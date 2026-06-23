/**
 * coinbase_ws.js — single shared Coinbase Advanced Trade WebSocket module
 * Feeds: ticker bar + AS dashboard paper trading
 * One connection, two consumers. Do not instantiate a second one.
 */

const CoinbaseWS = (() => {
  const COINBASE_WS = 'wss://advanced-trade-ws.coinbase.com/ws';

  const state = {
    bids: new Map(),
    asks: new Map(),
    mid: null,
    bestBid: null,
    bestAsk: null,
    recentTrades: [],
    sigma: null,
    GAMMA: 0.1,
    VOL_BUDGET: 0.5,   // B in τ_risk = B/(γσ); matches C++ vol_budget=0.5
    LOT_SIZE: 0.001,   // BTC per paper quote, matches C++ default lot
    Q_MAX: 0.05,       // BTC; bid suppressed above, ask suppressed below −Q_MAX
    kappa: null,
    paperInventory: 0,
    paperPnL: 0,
    paperFills: [],   // trimmed to last 50; use fillCount for totals
    fillCount: 0,
    // ── rolling metrics ──────────────────────────────────────────────
    totalFillVolume: 0,    // BTC traded (both sides)
    prevRunningPnL:  0,    // last fill's runningPnL for Welford delta
    pnlN:    0,            // Welford count of fill-to-fill deltas
    pnlMean: 0,            // Welford running mean
    pnlM2:   0,            // Welford sum of squared deviations
    bothSidesMs:  0,       // ms elapsed with both quotes active
    lastTickTs:   null,    // timestamp of last WS message (for uptime)
    pendingAS:    [],      // [{midAtFill, side, time}] — awaiting 5s horizon
    asN:    0,             // count of matured AS measurements
    asMean: 0,             // running mean adverse-selection cost (bps)
    maxAbsInv: 0,          // peak |inventory| seen this session
    // ─────────────────────────────────────────────────────────────────
    lastTradePrice: null,
    sessionStart: Date.now(),
    connected: false,
    currentQuotes: null,
    openPrice: null,
  };

  let ws = null;
  const listeners = { tick: [], fill: [] };

  function on(event, fn) {
    if (listeners[event]) listeners[event].push(fn);
  }

  function emit(event, data) {
    (listeners[event] || []).forEach(fn => fn(data));
  }

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    ws = new WebSocket(COINBASE_WS);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channel: 'level2' }));
      ws.send(JSON.stringify({ type: 'subscribe', product_ids: ['BTC-USD'], channel: 'market_trades' }));
      state.connected = true;
      setDotStatus(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.channel === 'l2_data')       handleBookUpdate(msg);
        if (msg.channel === 'market_trades') handleTrade(msg);
      } catch (e) { /* ignore parse errors */ }
    };

    ws.onclose = () => {
      state.connected = false;
      setDotStatus(false);
      showStaleValues();
      setTimeout(connect, 5000);
    };

    ws.onerror = () => ws.close();
  }

  // ── ORDER BOOK ──────────────────────────────────────────────────
  function handleBookUpdate(msg) {
    for (const event of (msg.events || [])) {
      for (const update of (event.updates || [])) {
        const price = update.price_level;
        const size  = parseFloat(update.new_quantity);
        if (update.side === 'bid') {
          size === 0 ? state.bids.delete(price) : state.bids.set(price, size);
        } else {
          size === 0 ? state.asks.delete(price) : state.asks.set(price, size);
        }
      }
    }
    if (state.bids.size === 0 || state.asks.size === 0) return;
    state.bestBid = Math.max(...[...state.bids.keys()].map(Number));
    state.bestAsk = Math.min(...[...state.asks.keys()].map(Number));
    state.mid     = (state.bestBid + state.bestAsk) / 2;
    recomputeASQuotes();
  }

  // ── TRADE TAPE ──────────────────────────────────────────────────
  function handleTrade(msg) {
    // Uptime: accumulate time spent with both quotes active, once per message.
    const msgNow = Date.now();
    if (state.lastTickTs !== null && state.currentQuotes) {
      const dt = msgNow - state.lastTickTs;
      if (state.currentQuotes.bidActive && state.currentQuotes.askActive) {
        state.bothSidesMs += dt;
      }
    }
    state.lastTickTs = msgNow;

    for (const event of (msg.events || [])) {
      for (const trade of (event.trades || [])) {
        const price     = parseFloat(trade.price);
        const size      = parseFloat(trade.size);
        const now       = Date.now();
        // Use exchange timestamp for vol buffer so inter-trade intervals
        // are correct even when a batch of trades arrives in one message.
        const tradeTime = trade.time ? new Date(trade.time).getTime() : now;

        if (state.openPrice === null) state.openPrice = price;
        state.lastTradePrice = price;

        // Guard against stale L2 book. state.mid is only set by handleBookUpdate,
        // which can lag the trade tape during rapid moves. A trade at P is ground
        // truth: any bestBid above P should have been consumed already. If the
        // deviation exceeds our own quoted spread (or $5 before quotes exist),
        // the book is lagging — snap mid to the trade price so quotes stay
        // anchored to actual market activity rather than a stale book level.
        if (state.mid !== null) {
          const drift = Math.abs(price - state.mid);
          const threshold = state.currentQuotes ? state.currentQuotes.spread : 5;
          if (drift > threshold) state.mid = price;
        }

        // 1. Check fill against quotes that were posted BEFORE this trade.
        //    Updating sigma/quotes first would be look-ahead bias.
        simulateFill(price, size, now);

        // 2. Update model with this trade's info for future quote cycles.
        state.recentTrades.push({ price, time: tradeTime });
        if (state.recentTrades.length > 500) state.recentTrades.shift();
        state.sigma = computePriceVolPerSecond(state.recentTrades);

        if (state.recentTrades.length >= 50) {
          state.kappa = calibrateKappa(state.recentTrades);
        }

        recomputeASQuotes();
      }
    }
    processAdverseSelection();
    updateTickerBar();
    emit('tick', { ...state.currentQuotes, mid: state.mid, price: state.lastTradePrice });
  }

  // ── PRICE VOL PER SECOND ─────────────────────────────────────────
  // Returns σ in $/s, matching ASParams.sigma in as_model.hpp.
  // Time-weights each log-return by its interval so irregular trade
  // arrival doesn't bias the estimate.
  function computePriceVolPerSecond(trades) {
    if (trades.length < 2) return 0.5;
    let sumVar = 0, count = 0;
    for (let i = 1; i < trades.length; i++) {
      const dt = Math.max((trades[i].time - trades[i - 1].time) / 1000, 0.001);
      const lr = Math.log(trades[i].price / trades[i - 1].price);
      sumVar += (lr * lr) / dt;
      count++;
    }
    return Math.sqrt(sumVar / count) * trades[trades.length - 1].price;
  }

  // ── KAPPA CALIBRATION ────────────────────────────────────────────
  function calibrateKappa(trades) {
    const intervals = [];
    for (let i = 1; i < trades.length; i++) {
      intervals.push((trades[i].time - trades[i - 1].time) / 1000);
    }
    const meanInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const lambda = 1 / Math.max(meanInterval, 0.001);
    const currentSpread = (state.bestAsk && state.bestBid)
      ? state.bestAsk - state.bestBid
      : 10;
    return lambda / Math.max(currentSpread, 0.01);
  }

  // ── AS QUOTES (v4) ───────────────────────────────────────────────
  // Mirrors as_model.hpp: stationary τ_risk = vol_budget/(γσ),
  // hybrid τ_inv calibrated so ask = mid exactly at q = Q_MAX,
  // plus quote suppression on the inventory-increasing side.
  function recomputeASQuotes() {
    if (!state.mid || !state.sigma || !state.kappa) return;
    const { GAMMA, VOL_BUDGET, Q_MAX, kappa } = state;
    const q     = state.paperInventory;
    const sigma = state.sigma;
    const s2    = sigma * sigma;

    const tauRisk = VOL_BUDGET / (GAMMA * sigma);
    const delta   = (GAMMA * s2 * tauRisk) / 2.0
                  + (1.0 / GAMMA) * Math.log(1.0 + GAMMA / kappa);
    const tauInv  = delta / (Q_MAX * GAMMA * s2);

    const reservation = state.mid - q * GAMMA * s2 * tauInv;
    const bidActive   = q <  Q_MAX;
    const askActive   = q > -Q_MAX;

    state.currentQuotes = {
      reservation,
      spread:    delta * 2,
      optBid:    bidActive ? reservation - delta : null,
      optAsk:    askActive ? reservation + delta : null,
      bidActive,
      askActive,
    };
  }

  // ── PAPER TRADING ────────────────────────────────────────────────
  // Fill logic: tape trade crossing our quote triggers a maker fill at
  // our QUOTED price (optBid / optAsk), not the tape price.  Using the
  // tape price would overstate PnL when the market runs through our quote.
  // Inventory bounded by quote suppression; no hard FLATTEN.
  function simulateFill(tradePrice, tradeSize, time) {
    if (!state.currentQuotes) return;
    const { optBid, optAsk, bidActive, askActive } = state.currentQuotes;
    // Fill size = min(what the tape trade offers, what we posted).
    // A tape trade of 0.0003 BTC can only fill 0.0003 of our 0.001 lot.
    const fillSize = Math.min(tradeSize, state.LOT_SIZE);
    if (fillSize <= 0) return;

    let fill = null;
    if (bidActive && optBid !== null && tradePrice <= optBid) {
      state.paperInventory += fillSize;
      state.paperPnL       -= optBid * fillSize;     // maker fills at quoted bid
      fill = { side: 'BUY',  price: optBid, size: fillSize, time,
               runningPnL: state.paperPnL + state.paperInventory * state.mid };
    } else if (askActive && optAsk !== null && tradePrice >= optAsk) {
      state.paperInventory -= fillSize;
      state.paperPnL       += optAsk * fillSize;     // maker fills at quoted ask
      fill = { side: 'SELL', price: optAsk, size: fillSize, time,
               runningPnL: state.paperPnL + state.paperInventory * state.mid };
    }

    if (fill) {
      state.fillCount++;

      // Volume
      state.totalFillVolume += fillSize;

      // Per-fill Sharpe — Welford's online mean/variance of fill-to-fill PnL delta
      if (state.fillCount >= 2) {
        const delta = fill.runningPnL - state.prevRunningPnL;
        state.pnlN++;
        const d = delta - state.pnlMean;
        state.pnlMean += d / state.pnlN;
        state.pnlM2   += d * (delta - state.pnlMean);
      }
      state.prevRunningPnL = fill.runningPnL;

      // Queue 5-second adverse-selection measurement
      if (state.mid !== null) {
        state.pendingAS.push({ midAtFill: state.mid, side: fill.side, time: fill.time });
        if (state.pendingAS.length > 500) state.pendingAS.shift();
      }

      // Peak inventory
      const absInv = Math.abs(state.paperInventory);
      if (absInv > state.maxAbsInv) state.maxAbsInv = absInv;

      state.paperFills.push(fill);
      if (state.paperFills.length > 50) state.paperFills.shift();
      emit('fill', fill);
    }
  }

  // ── ADVERSE SELECTION ────────────────────────────────────────────
  // Called after every trade batch. Matures any pending measurements whose
  // 5-second horizon has passed and folds them into a running mean (bps).
  // AS cost < 0 → mid moved in our favour after the fill (good).
  // AS cost > 0 → mid moved against us — classic adverse selection (bad).
  function processAdverseSelection() {
    if (!state.pendingAS.length || !state.mid) return;
    const now = Date.now();
    state.pendingAS = state.pendingAS.filter(entry => {
      if (now - entry.time < 5000) return true;
      const driftBps = (state.mid - entry.midAtFill) / entry.midAtFill * 10000;
      const asCost   = entry.side === 'BUY' ? -driftBps : driftBps;
      state.asN++;
      state.asMean += (asCost - state.asMean) / state.asN;
      return false;
    });
  }

  // ── TICKER BAR UI ────────────────────────────────────────────────
  function updateTickerBar() {
    const price = state.lastTradePrice;
    if (!price) return;

    const priceEl  = document.getElementById('tb-price');
    const changeEl = document.getElementById('tb-change');
    const resEl    = document.getElementById('tb-reservation');
    const spreadEl = document.getElementById('tb-spread');
    const timeEl   = document.getElementById('tb-time');

    if (priceEl) {
      priceEl.textContent = '$' + price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      if (state.openPrice) {
        const chg = ((price - state.openPrice) / state.openPrice) * 100;
        priceEl.className = 'ticker-value ' + (chg >= 0 ? 'up' : 'down');
        if (changeEl) {
          changeEl.textContent = (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%';
          changeEl.className   = 'ticker-value ' + (chg >= 0 ? 'up' : 'down');
        }
      }
    }

    if (resEl && state.currentQuotes) {
      resEl.textContent = '$' + state.currentQuotes.reservation.toFixed(2);
      resEl.className   = 'ticker-value';
    }

    if (spreadEl && state.currentQuotes) {
      spreadEl.textContent = '$' + state.currentQuotes.spread.toFixed(2);
      spreadEl.className   = 'ticker-value';
    }

    if (timeEl) {
      const now = new Date();
      timeEl.textContent = now.toUTCString().slice(17, 25) + ' UTC';
    }
  }

  function showStaleValues() {
    ['tb-price', 'tb-change', 'tb-reservation', 'tb-spread'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = '---.--'; el.className = 'ticker-value muted'; }
    });
  }

  function setDotStatus(connected) {
    const dot = document.getElementById('ws-dot');
    if (dot) dot.className = connected ? 'ticker-dot' : 'ticker-dot offline';
  }

  function resetPaper() {
    state.paperInventory  = 0;
    state.paperPnL        = 0;
    state.paperFills      = [];
    state.fillCount       = 0;
    state.totalFillVolume = 0;
    state.prevRunningPnL  = 0;
    state.pnlN            = 0;
    state.pnlMean         = 0;
    state.pnlM2           = 0;
    state.bothSidesMs     = 0;
    state.lastTickTs      = null;
    state.pendingAS       = [];
    state.asN             = 0;
    state.asMean          = 0;
    state.maxAbsInv       = 0;
  }

  function getState() { return state; }

  return { connect, on, getState, resetPaper };
})();
