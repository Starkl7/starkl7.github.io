# Portfolio Website — Claude Code Build Spec
## Dhrubojeet Haldar | Quant Researcher Portfolio

Hand this document to Claude Code and say:
> "Build this portfolio website exactly to spec. Follow the build order. Do not deviate from the design system. After each phase, run a local server to verify output before moving on."

---

## 0. Repository Setup

```bash
# Run first
git init dhrubojeet-portfolio
cd dhrubojeet-portfolio
git checkout -b main
```

**GitHub Pages config:**
- Repo name: `dhrubojeet-haldar.github.io` (makes it your root URL)
- Or: any repo name with GitHub Pages enabled on `/docs` or `main` branch root
- No Jekyll, no Hugo — plain HTML/CSS/JS. Zero build step, zero dependencies to break.

---

## 1. Repository File Structure

```
/
├── index.html                  # Single page application
├── style.css                   # All styles
├── main.js                     # Section routing, scroll tracking, Substack RSS
├── coinbase_ws.js              # Single shared Coinbase WebSocket module
│                               # Feeds: ticker bar + AS dashboard paper trading
│
├── /dashboards
│   ├── as-market-maker.html    # AS dashboard (standalone page)
│   ├── momentum.html           # Russell 2000 signal page
│   └── es-calendar.html        # ES futures page
│
├── /data                       # Auto-updated by GitHub Actions
│   ├── as_pnl.json             # Walk-forward P&L curve (static, from your results)
│   ├── momentum_signal.json    # Current long/short portfolio (updated monthly)
│   ├── es_signal.json          # ES calendar z-score (updated daily)
│   └── meta.json               # Last updated timestamps
│
├── /scripts                    # Python scripts run by GitHub Actions
│   ├── update_momentum.py
│   ├── update_es_signal.py
│   └── requirements.txt
│
├── /assets
│   ├── resume_qt.pdf           # QT-targeted resume
│   └── favicon.svg             # Minimal geometric favicon
│
└── /.github/workflows
    ├── momentum_update.yml     # Monthly cron
    └── es_update.yml           # Daily cron
```

---

## 2. Design System

### Philosophy
This is a research terminal, not a portfolio. The aesthetic should feel closer to a Bloomberg function screen or a well-formatted quant research memo than a SaaS startup landing page. Every visual choice should reinforce: *this person thinks rigorously and shows their work.*

### Color Palette
```css
:root {
  --bg-primary:     #0a0e14;   /* Near-black, slightly blue-tinted — not pure #000 */
  --bg-secondary:   #111820;   /* Card/panel backgrounds */
  --bg-tertiary:    #1a2332;   /* Hover states, subtle borders */
  --border:         #1e2d42;   /* All borders */
  --text-primary:   #e8edf4;   /* Body text */
  --text-secondary: #7a90a8;   /* Labels, metadata, timestamps */
  --text-muted:     #3d5166;   /* Placeholder, disabled */
  --accent-blue:    #4a9eff;   /* Primary accent — links, active states, CTAs */
  --accent-green:   #2ecc71;   /* Positive P&L, signals */
  --accent-red:     #e74c3c;   /* Negative P&L, losses, drawdown */
  --accent-yellow:  #f39c12;   /* Warnings, regime annotations */
  --mono-light:     #8be9fd;   /* Inline code, formula variables */
}
```

### Typography
```css
/* Load via Google Fonts — put in <head> */
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@300;400;500;600&display=swap');

:root {
  --font-body:   'Inter', sans-serif;        /* All prose, nav, UI */
  --font-mono:   'IBM Plex Mono', monospace; /* ALL numbers, metrics, formulas, code */
}

/* Type scale */
--text-xs:   0.70rem;   /* timestamps, labels */
--text-sm:   0.85rem;   /* secondary metadata */
--text-base: 1.00rem;   /* body */
--text-lg:   1.15rem;   /* card titles */
--text-xl:   1.40rem;   /* section headers */
--text-2xl:  2.00rem;   /* hero subtitle */
--text-3xl:  3.20rem;   /* hero name */
```

**Rule: Every number on this site uses `font-family: var(--font-mono)`.**
Sharpe ratios, P&L figures, z-scores, fill counts, timestamps — monospace only. This creates the signature research-terminal feel.

### Spacing & Layout
```css
--max-width: 1100px;
--section-gap: 120px;
--card-pad: 28px;
--border-radius: 6px;    /* Minimal rounding — not bubbly */
```

### Signature Element
The **nav bar is a live data ticker** — a horizontal strip above the main nav that shows:
```
BTC-USD  $[live price]  ▲ [change]     AS Reservation: $[computed]     Spread: $[computed]     Updated: HH:MM:SS UTC
```
This updates in real time via a Coinbase Advanced Trade WebSocket connection (US-legal, no auth required). It's the first thing any visitor sees. Nothing else on any quant portfolio does this.

---

## 3. HTML Structure (`index.html`)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dhrubojeet Haldar | Quant Researcher</title>
  <meta name="description" content="Quant researcher specializing in vol regime transitions, market microstructure, and systematic L/S equity. MFM @ NC State.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="[google fonts url]" rel="stylesheet">
  <link rel="stylesheet" href="style.css">
  <!-- KaTeX for math rendering -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"></script>
  <script defer src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js"></script>
  <!-- Chart.js for all charts -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
  <!-- TICKER BAR -->
  <div id="ticker-bar">...</div>

  <!-- NAVIGATION -->
  <nav id="main-nav">...</nav>

  <!-- SECTIONS (all in one page) -->
  <main>
    <section id="hero">...</section>
    <section id="thesis">...</section>
    <section id="projects">...</section>
    <section id="experience">...</section>
    <section id="writing">...</section>
    <section id="contact">...</section>
  </main>

  <script src="main.js"></script>
</body>
</html>
```

---

## 4. Section-by-Section Spec

### 4.1 Ticker Bar
```
[BTC-USD] [price in green/red] [Δ%]  |  [AS Reservation: $X]  |  [Spread: $X]  |  Updated: HH:MM:SS UTC
```
- Fixed to top of viewport, z-index 1000
- Height: 32px
- Background: `var(--bg-secondary)`, bottom border: `1px solid var(--border)`
- All values: `font-family: var(--font-mono)`, `font-size: var(--text-xs)`
- Fed by a persistent Coinbase Advanced Trade WebSocket (see Section 5.1) — ticker bar shares the same WS connection as the AS dashboard; no duplicate connections
- Reservation price and spread computed client-side from live BTC-USD mid using AS formula with illustrative κ
- If WebSocket is disconnected, show `[---.--]` in muted color — never show stale values as live

### 4.2 Navigation
```
[D.H.]                    [About]  [Projects]  [Research]  [Writing]  [Resume ↓]
```
- Sticky below ticker bar
- `[D.H.]` is the logo — monospace, accent-blue
- `[Resume ↓]` is a pill button that triggers download of `assets/resume_qt.pdf`
- Active section highlighted via IntersectionObserver scroll tracking
- No hamburger menu on mobile — collapse to icon row

### 4.3 Hero Section
**Do not open with your name in an H1. Open with your intellectual thesis.**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                  │
│   [ small label in accent-blue monospace ]                       │
│   QUANT RESEARCHER · MFM @ NC STATE · EX-WELLS FARGO            │
│                                                                  │
│   [ H1 — large, Inter 300 weight ]                               │
│   I study how volatility regime                                  │
│   transitions create predictable                                 │
│   structure in short-dated markets.                              │
│                                                                  │
│   [ body text, text-secondary ]                                  │
│   Building systematic strategies across equity momentum,         │
│   futures microstructure, and crypto market-making.              │
│   IIT Roorkee → Wells Fargo ($48B portfolio) → NC State.         │
│                                                                  │
│   [ CTA buttons ]                                                │
│   [View Projects →]  [Read Research →]  [GitHub ↗]              │
│                                                                  │
│   [ right side — live mini chart ]                               │
│   AS Market Maker — BTCUSD P&L (Walk-Forward, 105 windows)      │
│   [ sparkline of your actual results ]                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

- H1 font-size: clamp(2rem, 5vw, 3.5rem), weight 300 — thin and precise, not chunky
- Right column: Chart.js line chart loaded from `data/as_pnl.json`, W37 regime annotated with a vertical dashed line + label
- No hero image, no gradient blob, no animated particles

### 4.4 Thesis Callout
A single 3-column block between Hero and Projects:

```
┌─────────────────┬─────────────────┬─────────────────┐
│   MARKETS        │   METHODS        │   EDGE           │
│                 │                 │                  │
│   Crypto perp   │   AS market-     │   Regime-aware   │
│   futures       │   making         │   parameter      │
│   ES calendar   │   XGBoost L/S    │   adaptation     │
│   spreads       │   reclassify     │   Honest failure │
│   Russell 2000  │   Mean reversion │   analysis       │
│   momentum      │   C++20 / Python │                  │
└─────────────────┴─────────────────┴─────────────────┘
```
- Background: `var(--bg-secondary)`, border: `1px solid var(--border)`
- Labels: `font-family: var(--font-mono)`, `color: var(--accent-blue)`, `font-size: var(--text-xs)`
- No numbers here — save numbers for project cards

### 4.5 Projects Section

**Section header:**
```
RESEARCH & PROJECTS                            [Filter: All | Market-Making | Systematic | Competition]
```

**Each project card:**
```
┌──────────────────────────────────────────────────────────────────┐
│  [TAG: MARKET MICROSTRUCTURE]              [C++20] [Binance] [AS]│
│                                                                   │
│  Avellaneda-Stoikov Market-Maker                                  │
│  BTCUSD Perpetual Futures                                         │
│                                                                   │
│  [one-line thesis]                                                │
│  Inventory-aware MM on crypto perps; MLE-calibrated fill          │
│  intensity from real-tape replay, not Poisson simulation.         │
│                                                                   │
│  ┌────────────────────── MINI CHART ─────────────────────────┐   │
│  │  [Chart.js sparkline — walk-forward cumulative P&L]        │   │
│  │  [W37 regime annotated]                                    │   │
│  └────────────────────────────────────────────────────────────┘   │
│                                                                   │
│  KEY RESULTS                          WHERE IT BREAKS             │
│  Spread: -$63.51 vs -$352.05          Low-vol regime (W37)        │
│  Drawdown ↓47%   Losses ↓58%         Absent queue model           │
│  Fills: 936      PnL: -$73.95        VPIN not incorporated        │
│                                                                   │
│  [Live Dashboard →]   [GitHub →]   [Substack Article →]           │
└──────────────────────────────────────────────────────────────────┘
```

**Rules for ALL project cards:**
- "KEY RESULTS" column: every value in `font-family: var(--font-mono)`
- "WHERE IT BREAKS" column: mandatory on every card — this is the differentiator
- At least one formula rendered via KaTeX (collapsed by default, expandable on click)
- Negative P&L shown in `var(--accent-red)` — never hidden
- Tags are filterable (JS filter, no page reload)

**Project 1 — AS Market Maker (BTCUSD)**
- Tag: MARKET MICROSTRUCTURE
- Tech tags: C++20, Databento, Binance
- Thesis: Inventory-aware MM on BTCUSD perp. MLE-calibrated fill intensity from real-tape replay. Vol-adaptive horizon.
- Key results: Spread -$63.51 vs -$352.05 baseline; drawdown ↓47%; losses ↓58%; 936 fills; net PnL -$73.95
- Where it breaks: Low-vol regime (W37), absent queue model, VPIN not incorporated
- KaTeX formula (expandable): Reservation price `r = s - q·γ·σ²·T` and optimal spread `δ = γσ²T + (2/γ)ln(1 + γ/κ)`
- Links: Live Dashboard, GitHub, Substack (when live)
- Chart: Walk-forward cumulative P&L from `data/as_pnl.json`, W37 annotated

**Project 2 — Russell 2000 XGBoost L/S**
- Tag: SYSTEMATIC EQUITY
- Tech tags: Python, XGBoost, QuantConnect, yfinance
- Thesis: Bimodality-motivated 4-quadrant reclassifier on 12-1 momentum. GL quadrant (bottom-decile reversal) is the primary alpha source.
- Key results: Sharpe 0.235 vs 0.126 baseline; drawdown -8.1pp; vol ↓40%; GL: +1.90%/mo
- Where it breaks: Post-2020 rate-hike beta drag (Sharpe collapsed +0.418 → -0.042); cross-sectional signals displaced by vol_12m
- KaTeX formula (expandable): 4-quadrant classification logic
- Important callout: Show the post-2020 decomposition — rate-hike beta vs signal decay. L/S spread intact (+0.85%/mo post vs +0.86%/mo pre). This is sophisticated regime analysis, make it visible.
- Links: Live Signal Dashboard, GitHub, Substack (when live)
- Chart: Equity curve with pre/post-2020 regime shading; baseline vs strategy

**Project 3 — ES Calendar Spread Mean Reversion**
- Tag: FUTURES MICROSTRUCTURE
- Tech tags: Python, Databento MBP-10, SOFR
- Thesis: Fair Value deviation in ES calendar spread. High-conviction entry at |z_fill| > 3 (bias-corrected). European session is structural alpha source.
- Key results: +$2.86/lot net; European session: n=170, p=0.0008, avg +$4.9/trade; OOS p=0.0265; annualized Sharpe +3.88 (CI [+1.38, +6.63])
- Where it breaks: Roll window dependency; cost sensitivity ($8.04/lot already baked in)
- KaTeX formula: Fair value: `FV = S · e^{(r - q)·T}` and z-score construction
- Links: Signal Dashboard (daily update), GitHub, Substack (when live)
- Chart: Per-trade P&L scatter by session (European highlighted), z-score distribution

**Project 4 — IMC Prosperity 4**
- Tag: COMPETITION
- Tech tags: Python, Manual Trading
- Thesis: Ranked 42nd globally (Phase 1, ~18k teams); top 5% overall. Write the actual trade decisions here, not just the rank.
- Key results: Phase 1 rank 42/~18,000; Overall ~900/all participants
- Content: 3-4 bullet breakdown of strategy per round — what inefficiency, what position, how you sized it
- Where it breaks: Honest — what did you get wrong in Phase 2 that dropped you from 42 to ~900
- Links: GitHub (if code is public)

### 4.6 Experience Section

Timeline layout — not a list, not cards. A vertical line with dated nodes.

```
EXPERIENCE

│
● 06/2026 – Present
│  Avellaneda-Stoikov C++ Market Maker (see Projects)
│
● 03/2026
│  IMC Trading Prosperity 4 — Top 42 globally, Phase 1
│
● 08/2025 – 12/2026
│  Master of Financial Mathematics — NC State (GPA 3.82)
│  Coursework: Stochastic Calculus, Options Pricing, Monte Carlo,
│  Statistical Learning
│
● 06/2023 – 07/2025
│  Quantitative Model Solutions Specialist — Wells Fargo, Bangalore
│  Cards portfolio ($48B). KS/PSI regime diagnostics.
│  Feature-level drift detection ahead of formal review cycles.
│  60% runtime reduction on SAS+Python pipelines.
│  Manager's Spotlight Award.
│
● 07/2019 – 07/2023
│  B.Tech Computer Science — IIT Roorkee
```

- Timeline line: `2px solid var(--border)`
- Nodes: `8px circle, background: var(--accent-blue)`
- Dates: `font-family: var(--font-mono)`, `color: var(--text-secondary)`

### 4.7 Writing Section

Auto-populated from Substack RSS feed. No manual updates required.

```
WRITING & RESEARCH NOTES

┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│  [date in mono]                   │  │  [date in mono]                   │
│                                   │  │                                   │
│  [Article Title]                  │  │  [Article Title]                  │
│                                   │  │                                   │
│  [2-line description]             │  │  [2-line description]             │
│                                   │  │                                   │
│  [tag: Market Making]  [Read →]   │  │  [Coming soon]                    │
└──────────────────────────────────┘  └──────────────────────────────────┘
```

**RSS implementation:**
```javascript
// Fetch Substack RSS and parse in-browser
// Your Substack RSS URL: https://[yourhandle].substack.com/feed
async function loadSubstackPosts() {
  const RSS_URL = 'https://[yourhandle].substack.com/feed';
  const PROXY = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS_URL)}`;
  const res = await fetch(PROXY);
  const data = await res.json();
  return data.items; // title, pubDate, description, link
}
```
Use `rss2json.com` free tier (no key needed for low traffic). Renders articles as cards dynamically. Cards for projects without articles yet show "Writeup in progress" state.

### 4.8 Contact / Footer

Minimal. No contact form.

```
DHRUBOJEET HALDAR

Targeting: Quant Trading · Quant Research · Market Making
Available: December 2026

[dhaldar@ncsu.edu]  [LinkedIn ↗]  [GitHub ↗]  [Resume PDF ↓]

Built with plain HTML/CSS/JS · Deployed on GitHub Pages
Data: Binance API · Signals updated via GitHub Actions
```

---

## 5. Live Dashboard Pages (`/dashboards/`)

Each dashboard is a standalone HTML page with its own nav back to main site.

### 5.1 AS Market Maker Dashboard (`dashboards/as-market-maker.html`)

**Data sources:**
- **Research results (static):** `data/as_pnl.json` — your actual Coincall walk-forward results, loaded once on page load, never changes
- **Live market data:** Coinbase Advanced Trade WebSocket (US-legal, no auth) — BTC-USD spot, L2 order book + trade tape
- **Instrument note:** Research was conducted on BTCUSD perpetual futures (Coincall). Live demo runs on BTC-USD spot (Coinbase). Different instruments, different microstructure. This is disclosed on the page.

**Dashboard layout — two visually distinct panels:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  AVELLANEDA-STOIKOV MARKET MAKER                                     │
│  BTCUSD Perpetual Futures · Coincall · Sep 2024 – Jun 2025          │
├──────────────────────────────────────────────────────────────────────┤
│  PANEL A — RESEARCH RESULTS  [static badge]                          │
│                                                                      │
│  WALK-FORWARD P&L — 105 WINDOWS                                      │
│  [Chart.js — cumulative PnL: strategy vs fixed-horizon baseline]     │
│  [W37 vertical dashed line, label: "Low-Vol Regime (W37)"]          │
│                                                                      │
│  ┌──────────┬───────────┬──────────┬──────────┬────────────────────┐│
│  │ AVG SPRD │ BASELINE  │ SPRD ↓   │ DD ↓     │ NET PnL (936 fills)││
│  │ -$63.51  │ -$352.05  │ 81.97%   │ 47%      │ -$73.95            ││
│  └──────────┴───────────┴──────────┴──────────┴────────────────────┘│
│                                                                      │
│  WHERE IT BREAKS                                                     │
│  ● Low-vol regime (W37): σ compression → tight reservation →        │
│    adverse fills dominate                                            │
│  ● Absent queue model: no LOB depth awareness; fills treated as      │
│    exogenous Poisson (real tape used, but no queue position logic)   │
│  ● VPIN not incorporated — no toxicity filter on incoming flow       │
│  ● Results pre-rebate; maker rebate would improve net PnL           │
│                                                                      │
│  [Show Model Equations ↓]  ← KaTeX expandable                       │
├──────────────────────────────────────────────────────────────────────┤
│  PANEL B — LIVE MODEL DEMONSTRATION  [live ● badge, pulsing green]  │
│                                                                      │
│  ⚠ INSTRUMENT NOTE: Research data = BTCUSD perp futures (Coincall). │
│  This demo runs on BTC-USD spot (Coinbase). Parameters are          │
│  recalibrated from live trade stream. Results are illustrative.      │
│                                                                      │
│  ┌──────────┬──────────────┬──────────────┬──────────────┐          │
│  │ BTC-USD  │ RESERVATION  │ OPT. BID     │ OPT. ASK     │          │
│  │ $[live]  │ $[computed]  │ $[computed]  │ $[computed]  │          │
│  └──────────┴──────────────┴──────────────┴──────────────┘          │
│                                                                      │
│  PAPER TRADING  (simulated fills on Coinbase BTC-USD spot)           │
│  ┌──────────────────────────────────────────────────────────┐        │
│  │ [Real-time inventory bar: ████░░░░░░ 0.023 BTC long]     │        │
│  │ [Cumulative paper PnL chart — live updating]             │        │
│  │ [Recent fills table: time | side | price | size | PnL]  │        │
│  └──────────────────────────────────────────────────────────┘        │
│                                                                      │
│  ┌──────────┬────────────┬──────────────┬────────────────┐           │
│  │ FILLS    │ PAPER PnL  │ INVENTORY    │ κ (live MLE)   │           │
│  │ [count]  │ $[value]   │ [±X.XXX BTC] │ [value]        │           │
│  └──────────┴────────────┴──────────────┴────────────────┘           │
│                                                                      │
│  [Reset Paper Portfolio]                                             │
└──────────────────────────────────────────────────────────────────────┘
```

**WebSocket connection — single persistent connection feeds everything:**
```javascript
// coinbase_ws.js — shared module used by dashboard AND ticker bar
const COINBASE_WS = 'wss://advanced-trade-ws.coinbase.com/ws';

let ws;
let state = {
  // Order book
  bids: new Map(),       // price (string) → size (float)
  asks: new Map(),
  mid: null,
  bestBid: null,
  bestAsk: null,

  // Realized vol — rolling window of last 500 trades
  recentTrades: [],      // { price, time }
  sigma: null,

  // AS parameters
  GAMMA: 0.1,            // risk aversion — from your Coincall calibration (adjust if needed)
  T: 1/24,               // horizon in years — your calibrated value
  kappa: null,           // recalibrated from live trade stream on startup

  // Paper portfolio
  paperInventory: 0,
  paperPnL: 0,
  paperFills: [],
  INVENTORY_LIMIT: 0.05, // BTC — ±5 lots equivalent in spot terms

  // Session tracking
  lastTradePrice: null,
  sessionStart: Date.now()
};

function connect() {
  ws = new WebSocket(COINBASE_WS);

  ws.onopen = () => {
    // Subscribe to both channels
    ws.send(JSON.stringify({
      type: 'subscribe',
      product_ids: ['BTC-USD'],
      channel: 'level2'         // L2 order book
    }));
    ws.send(JSON.stringify({
      type: 'subscribe',
      product_ids: ['BTC-USD'],
      channel: 'market_trades'  // real trade tape
    }));
    updateConnectionStatus('connected');
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.channel === 'l2_data')       handleBookUpdate(msg);
    if (msg.channel === 'market_trades') handleTrade(msg);
  };

  ws.onclose = () => {
    updateConnectionStatus('disconnected');
    // Reconnect after 5s
    setTimeout(connect, 5000);
  };

  ws.onerror = () => ws.close();
}

// ── ORDER BOOK ──────────────────────────────────────────────────────────
function handleBookUpdate(msg) {
  for (const event of msg.events) {
    for (const update of event.updates) {
      const price = update.price_level;
      const size  = parseFloat(update.new_quantity);
      if (update.side === 'bid') {
        size === 0 ? state.bids.delete(price) : state.bids.set(price, size);
      } else {
        size === 0 ? state.asks.delete(price) : state.asks.set(price, size);
      }
    }
  }
  // Recompute mid
  state.bestBid = Math.max(...[...state.bids.keys()].map(Number));
  state.bestAsk = Math.min(...[...state.asks.keys()].map(Number));
  state.mid     = (state.bestBid + state.bestAsk) / 2;

  recomputeASQuotes();
}

// ── TRADE TAPE ──────────────────────────────────────────────────────────
function handleTrade(msg) {
  for (const event of msg.events) {
    for (const trade of event.trades) {
      const price = parseFloat(trade.price);
      const size  = parseFloat(trade.size);
      const time  = Date.now();

      // Update rolling vol window
      state.recentTrades.push({ price, time });
      if (state.recentTrades.length > 500) state.recentTrades.shift();
      state.sigma = computeRealizedVol(state.recentTrades);

      // Recalibrate κ from trade inter-arrival times (MLE, rolling)
      if (state.recentTrades.length >= 100) {
        state.kappa = calibrateKappa(state.recentTrades);
      }

      // Paper trading fill simulation
      simulateFill(price, size, time);

      state.lastTradePrice = price;
    }
  }
  updateDashboardUI();
  updateTickerBar();   // also updates the top-of-page ticker
}

// ── REALIZED VOL ─────────────────────────────────────────────────────────
function computeRealizedVol(trades) {
  if (trades.length < 2) return 0.01; // fallback
  const logReturns = [];
  for (let i = 1; i < trades.length; i++) {
    logReturns.push(Math.log(trades[i].price / trades[i-1].price));
  }
  const variance = logReturns.reduce((s, r) => s + r*r, 0) / logReturns.length;
  // Annualize: assume ~1 trade/second on average → 86400 trades/day
  return Math.sqrt(variance * 86400 * 365);
}

// ── KAPPA CALIBRATION (MLE on inter-arrival times) ──────────────────────
function calibrateKappa(trades) {
  // Simplified: λ(δ) = A·e^{-κδ}
  // For demo purposes, estimate κ from trade frequency vs spread
  // Full MLE calibration should match your C++ implementation
  const intervals = [];
  for (let i = 1; i < trades.length; i++) {
    intervals.push((trades[i].time - trades[i-1].time) / 1000); // seconds
  }
  const meanInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const lambda = 1 / meanInterval; // trades per second
  // κ ≈ λ / (best_ask - best_bid) as first-order approximation
  const currentSpread = state.bestAsk && state.bestBid
    ? state.bestAsk - state.bestBid
    : 10; // fallback
  return lambda / Math.max(currentSpread, 1);
}

// ── AS QUOTE COMPUTATION ─────────────────────────────────────────────────
function recomputeASQuotes() {
  if (!state.mid || !state.sigma || !state.kappa) return;
  const { GAMMA, T, kappa, paperInventory: q } = state;
  const sigma = state.sigma;

  const reservation = state.mid - q * GAMMA * sigma * sigma * T;
  const spread      = GAMMA * sigma * sigma * T + (2 / GAMMA) * Math.log(1 + GAMMA / kappa);
  const optBid      = reservation - spread / 2;
  const optAsk      = reservation + spread / 2;

  state.currentQuotes = { reservation, spread, optBid, optAsk };
}

// ── PAPER TRADING FILL SIMULATION ────────────────────────────────────────
function simulateFill(tradePrice, tradeSize, time) {
  if (!state.currentQuotes) return;
  const { optBid, optAsk } = state.currentQuotes;

  // A real trade at or below our bid → we get filled as maker on buy side
  if (tradePrice <= optBid) {
    const fillPnL = -tradePrice * tradeSize; // cash out
    state.paperInventory += tradeSize;
    state.paperPnL       += fillPnL;
    state.paperFills.push({ side: 'BUY', price: tradePrice, size: tradeSize, time, pnl: fillPnL });
    enforceInventoryBounds();
  }

  // A real trade at or above our ask → we get filled as maker on sell side
  if (tradePrice >= optAsk) {
    const fillPnL = tradePrice * tradeSize; // cash in
    state.paperInventory -= tradeSize;
    state.paperPnL       += fillPnL;
    state.paperFills.push({ side: 'SELL', price: tradePrice, size: tradeSize, time, pnl: fillPnL });
    enforceInventoryBounds();
  }
}

// Hard inventory bounds — mirrors C++ model (±5 lots → spot equivalent)
function enforceInventoryBounds() {
  if (Math.abs(state.paperInventory) > state.INVENTORY_LIMIT) {
    // Flatten at mid — conservative paper assumption
    state.paperPnL       += state.paperInventory * state.mid;
    state.paperInventory  = 0;
    state.paperFills.push({ side: 'FLATTEN', price: state.mid, size: 0, time: Date.now(), pnl: 0 });
  }
}
```

**κ recalibration note for Claude Code:**
The `calibrateKappa()` function above is a first-order approximation. The C++ model used full MLE on fill intensity against historical spread. For the live demo, the approximation is sufficient — the page discloses that parameters are illustrative. If Dhrubo provides his MLE calibration logic, port it here verbatim.

### 5.2 Russell 2000 Signal Dashboard (`dashboards/momentum.html`)

**Data source:** `data/momentum_signal.json` (updated monthly by GitHub Actions)

**Signal JSON schema:**
```json
{
  "last_updated": "2026-06-01",
  "rebalance_date": "2026-06-01",
  "portfolio_size": 10000000,
  "long_positions": [
    {"ticker": "XYZ", "quadrant": "GL", "momentum_12_1": -0.42, "weight": 0.05}
  ],
  "short_positions": [
    {"ticker": "ABC", "quadrant": "GW", "momentum_12_1": 0.68, "weight": -0.05}
  ],
  "equity_curve": [
    {"date": "2014-01-01", "strategy": 1.0, "baseline": 1.0}
  ],
  "regime_flag": "normal",
  "sharpe_rolling_12m": 0.235,
  "post_2020_note": "Rate-hike beta drag identified. L/S spread intact."
}
```

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│  RUSSELL 2000 DEEP MOMENTUM — LIVE SIGNAL          Updated: [date]│
├──────────────────────────────────────────────────────────────────┤
│  [Equity curve — strategy vs buy-hold Russell 2000]              │
│  [Pre/post-2020 regime shading — yellow band]                    │
│  [Annotation: "Rate-hike beta drag — not signal decay"]          │
├────────────────────────┬─────────────────────────────────────────┤
│  CURRENT LONG (GL)     │  CURRENT SHORT (GW)                     │
│  [table of tickers,    │  [table of tickers,                     │
│   momentum scores,     │   momentum scores,                      │
│   weights]             │   weights]                              │
├────────────────────────┴─────────────────────────────────────────┤
│  GL QUADRANT INSIGHT                                             │
│  Primary alpha source: bottom-decile reversal                    │
│  Avg return: +1.90%/mo — orthogonal to momentum factor           │
│  Post-2020: +0.85%/mo spread vs +0.86%/mo pre-2020              │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 ES Calendar Dashboard (`dashboards/es-calendar.html`)

**Data source:** `data/es_signal.json` (updated daily by GitHub Actions)

**Signal JSON schema:**
```json
{
  "last_updated": "2026-06-21T08:00:00Z",
  "front_contract": "ESU24",
  "back_contract": "ESZ24",
  "fair_value_spread": 12.45,
  "observed_spread": 14.20,
  "z_score": 1.82,
  "signal": "NEUTRAL",
  "entry_threshold": 3.0,
  "session_stats": {
    "european": {"n": 170, "p_value": 0.0008, "avg_pnl": 4.9},
    "us": {"n": 500, "p_value": 0.41, "avg_pnl": 0.8}
  },
  "oos_summary": {"n": 670, "p_value": 0.0265, "sharpe": 3.88, "sharpe_ci_low": 1.38, "sharpe_ci_high": 6.63}
}
```

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│  ES CALENDAR SPREAD — MEAN REVERSION SIGNAL       Updated: [time]│
├──────────────────────────────────────────────────────────────────┤
│  CURRENT Z-SCORE: [value]    SIGNAL: [NEUTRAL / LONG / SHORT]    │
│  Fair Value: [X]    Observed: [Y]    Deviation: [Z]              │
├──────────────────────────────────────────────────────────────────┤
│  [Z-score time series — last 30 days]                            │
│  [Horizontal dashed lines at ±3 (entry threshold)]               │
├────────────────────────────────┬─────────────────────────────────┤
│  EUROPEAN SESSION EDGE         │  OOS VALIDATION                 │
│  n = 170  p = 0.0008          │  n = 670   p = 0.0265           │
│  Avg P&L: +$4.9/trade         │  Sharpe: +3.88                  │
│  Across all 4 roll windows    │  CI: [+1.38, +6.63]             │
└────────────────────────────────┴─────────────────────────────────┘
```

---

## 6. GitHub Actions — Data Pipeline

### 6.1 Momentum Signal (`/.github/workflows/momentum_update.yml`)

```yaml
name: Update Momentum Signal
on:
  schedule:
    - cron: '0 6 1 * *'  # 1st of every month at 6am UTC
  workflow_dispatch:       # Allow manual trigger

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Set up Python
        uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: pip install -r scripts/requirements.txt
      
      - name: Run momentum signal
        run: python scripts/update_momentum.py
      
      - name: Commit updated signal
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/momentum_signal.json data/meta.json
          git diff --staged --quiet || git commit -m "feat: monthly momentum signal update $(date -u +%Y-%m-%d)"
          git push
```

### 6.2 ES Calendar Signal (`/.github/workflows/es_update.yml`)

```yaml
name: Update ES Calendar Signal
on:
  schedule:
    - cron: '0 8 * * 1-5'  # Weekdays at 8am UTC (pre-US open)
  workflow_dispatch:

jobs:
  update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -r scripts/requirements.txt
      - run: python scripts/update_es_signal.py
      - name: Commit
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/es_signal.json data/meta.json
          git diff --staged --quiet || git commit -m "feat: daily ES signal update $(date -u +%Y-%m-%dT%H:%M)"
          git push
```

### 6.3 Python Scripts

**`scripts/requirements.txt`**
```
yfinance>=0.2.40
pandas>=2.0
numpy>=1.26
scipy>=1.11
scikit-learn>=1.3
xgboost>=2.0
requests>=2.31
```

**`scripts/update_momentum.py`** — skeleton:
```python
import yfinance as yf
import pandas as pd
import numpy as np
import json
from datetime import datetime, date

def get_russell_2000_universe():
    """Pull IWM constituents or use a saved list."""
    # Use iShares holdings CSV (downloadable from iShares site) or a saved constituent list
    # For simplicity, use a pre-saved CSV of R2000 tickers
    tickers = pd.read_csv('scripts/russell2000_tickers.csv')['ticker'].tolist()
    return tickers

def compute_momentum(prices_df):
    """12-1 momentum: 12-month return excluding last month."""
    returns_12 = prices_df.pct_change(252)
    returns_1  = prices_df.pct_change(21)
    return returns_12 - returns_1

def classify_quadrant(mom_score, vol_12m):
    """4-quadrant classification."""
    # Your XGBoost model — load from a saved model file
    # Or approximate with threshold rules from your research
    pass

def main():
    # [Full implementation of your walk-forward signal]
    # Output: data/momentum_signal.json with schema defined above
    signal = {
        "last_updated": datetime.utcnow().isoformat(),
        "rebalance_date": date.today().isoformat(),
        # ... rest of signal
    }
    with open('data/momentum_signal.json', 'w') as f:
        json.dump(signal, f, indent=2)
    print(f"Signal updated: {signal['last_updated']}")

if __name__ == '__main__':
    main()
```

**Note to Claude Code:** The actual model logic (XGBoost inference, feature construction) should be ported directly from Dhrubo's existing research code. The skeleton above shows the I/O contract; fill in the implementation from the existing project code.

---

## 7. KaTeX Formula Integration

Formulas rendered inline on project cards and dashboard pages. Collapsed by default, expandable on click.

```html
<!-- In project card -->
<div class="formula-block">
  <button class="formula-toggle" onclick="toggleFormula(this)">
    Show Model Equations ↓
  </button>
  <div class="formula-content" style="display:none">
    <p>Reservation price:</p>
    <span class="math">r = s - q \cdot \gamma \cdot \sigma^2 \cdot T</span>
    <p>Optimal spread:</p>
    <span class="math">\delta = \gamma \sigma^2 T + \frac{2}{\gamma} \ln\!\left(1 + \frac{\gamma}{\kappa}\right)</span>
  </div>
</div>
```

```javascript
// After KaTeX auto-render loads
document.addEventListener("DOMContentLoaded", () => {
  renderMathInElement(document.body, {
    delimiters: [
      {left: "$$", right: "$$", display: true},
      {left: "$", right: "$", display: false}
    ]
  });
});
```

---

## 8. Build Order for Claude Code

Execute strictly in this order. Verify in browser before moving to next phase.

```
Phase 1: Foundation
  [ ] Init repo, file structure, favicon
  [ ] style.css — full design system (all CSS variables, reset, typography)
  [ ] index.html shell with all section anchors

Phase 2: Static Content
  [ ] Ticker bar (static placeholder values first)
  [ ] Nav with scroll tracking
  [ ] Hero section (static — no chart yet)
  [ ] Thesis callout block
  [ ] Experience timeline
  [ ] Contact / footer

Phase 3: Projects
  [ ] Project card component (HTML + CSS)
  [ ] All 4 project cards with full content
  [ ] Tag filter (All / Market-Making / Systematic / Competition)
  [ ] KaTeX formulas on each card (collapsed)

Phase 4: Charts & Live Data
  [ ] Create data/as_pnl.json with hardcoded walk-forward results (from Coincall C++ output logs)
  [ ] Hero sparkline (Chart.js, loads as_pnl.json, W37 annotated)
  [ ] coinbase_ws.js — single shared WebSocket module (L2 + trade tape)
  [ ] Ticker bar wired to coinbase_ws.js state
  [ ] AS dashboard page (as-market-maker.html) — Panel A (static) + Panel B (live paper trading)

Phase 5: Dashboard Pages
  [ ] data/momentum_signal.json (placeholder data)
  [ ] data/es_signal.json (placeholder data)
  [ ] momentum.html dashboard
  [ ] es-calendar.html dashboard

Phase 6: Automation
  [ ] scripts/requirements.txt
  [ ] scripts/update_momentum.py (full implementation)
  [ ] scripts/update_es_signal.py (full implementation)
  [ ] .github/workflows/momentum_update.yml
  [ ] .github/workflows/es_update.yml
  [ ] Test workflows via workflow_dispatch

Phase 7: Writing Section
  [ ] Substack RSS fetch via rss2json
  [ ] Article cards with "in progress" states for unpublished pieces

Phase 8: Polish & Deploy
  [ ] Mobile responsiveness (test at 375px)
  [ ] Prefers-reduced-motion on all animations
  [ ] Meta tags (OG, description, canonical)
  [ ] PDF resume linked correctly
  [ ] GitHub Pages enabled on repo settings
  [ ] Test all live data endpoints
  [ ] Trigger both GitHub Actions manually, verify JSON commits
```

---

## 9. Mobile Layout Notes

- Ticker bar: show only BTCUSD price + AS reservation on mobile; hide spread
- Hero: single column; chart moves below text
- Project cards: full width; key results + where it breaks stack vertically
- Dashboards: metric cards stack 2x2 then 1x4 below 600px
- Navigation: sticky bottom bar on mobile (Home / Projects / Research / Contact)

---

## 10. Performance Constraints

- No npm, no bundler, no build step — everything loads from CDN or is static
- Chart.js loaded from CDN with defer
- KaTeX loaded from CDN with defer
- Fonts loaded with `display=swap`
- `data/*.json` files must stay under 500KB
- **Single WebSocket connection** to Coinbase feeds both the ticker bar and the AS dashboard — do not open two separate WS connections
- Coinbase Advanced Trade WS: no rate limit on subscribe; handles reconnect gracefully via 5s retry
- GitHub Actions: free tier gives 2000 min/month — daily ES update (5 min) + monthly momentum (10 min) = ~120 min/month. Safe.

---

## 11. `data/as_pnl.json` — Seed Data

Claude Code should create this file with your actual walk-forward results from the Coincall research. Format:
```json
{
  "windows": 105,
  "data_source": "Coincall BTCUSD Perpetual Futures — real-tape fill replay",
  "period": "Sep 2024 – Jun 2025",
  "series": [
    {"window": 1,  "strategy_pnl": -12.40, "baseline_pnl": -87.30, "cumulative_strategy": -12.40, "cumulative_baseline": -87.30},
    {"window": 2,  "strategy_pnl":  18.20, "baseline_pnl": -42.10, "cumulative_strategy":   5.80, "cumulative_baseline": -129.40},
    ...
    {"window": 37, "strategy_pnl": -89.10, "baseline_pnl": -210.40, "label": "W37: Low-Vol Regime", "cumulative_strategy": ..., "cumulative_baseline": ...},
    ...
    {"window": 105, "strategy_pnl": ..., "cumulative_strategy": -73.95, "cumulative_baseline": ...}
  ]
}
```
**If you have the raw C++ output logs from the Coincall run, paste them to Claude Code and ask it to parse them into this JSON format.**

---

## 12. Final Checklist Before Going Live

- [ ] Every number on the site is in IBM Plex Mono
- [ ] Every project card has a "Where It Breaks" section with real content
- [ ] P&L of -$73.95 is shown in red, not hidden
- [ ] Research results panel clearly labeled "Coincall BTCUSD Perpetual — Sep 2024–Jun 2025"
- [ ] Live demo panel shows instrument disclaimer (spot ≠ perp futures)
- [ ] Ticker bar shows `[---.--]` in muted color when WS is disconnected — never stale values
- [ ] Coinbase WebSocket connects and populates ticker bar within 3 seconds of page load
- [ ] Paper trading fills accumulate correctly; inventory bounds trigger a FLATTEN fill at ±0.05 BTC
- [ ] κ (live MLE) shown on dashboard and updates as trade stream accumulates
- [ ] Both GitHub Actions workflows run successfully (check Actions tab)
- [ ] Substack RSS loads at least one article card
- [ ] Resume PDF downloads correctly from nav button
- [ ] All dashboard links work
- [ ] KaTeX renders formulas (not raw LaTeX strings)
- [ ] Site loads in under 2 seconds on a cold visit
```
