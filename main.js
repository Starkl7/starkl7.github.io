/* main.js — portfolio page controller */

// ── FORMULA TOGGLE ────────────────────────────────────────────────────────────
function toggleFormula(btn) {
  const content = btn.nextElementSibling;
  const isOpen  = content.style.display !== 'none';
  content.style.display = isOpen ? 'none' : 'block';
  btn.textContent = isOpen
    ? btn.textContent.replace('↑', '↓')
    : btn.textContent.replace('↓', '↑');
  if (!isOpen && window.renderMathInElement) {
    renderMathInElement(content, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false }
      ]
    });
  }
}

// ── TAG FILTER ────────────────────────────────────────────────────────────────
function initTagFilter() {
  const btns  = document.querySelectorAll('.filter-btn');
  const cards = document.querySelectorAll('.project-card');

  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      cards.forEach(card => {
        const show = filter === 'all' || card.dataset.category === filter;
        card.classList.toggle('hidden', !show);
      });
    });
  });
}

// ── NAV SCROLL TRACKING ───────────────────────────────────────────────────────
function initScrollTracking() {
  const links    = document.querySelectorAll('.nav-text-link[data-section]');
  const sections = document.querySelectorAll('main > section[id]');

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const id = entry.target.id;
      links.forEach(link => {
        link.classList.toggle('active', link.dataset.section === id);
      });
    });
  }, { threshold: 0.3, rootMargin: '-80px 0px 0px 0px' });

  sections.forEach(s => observer.observe(s));
}

// ── CHART HELPERS ─────────────────────────────────────────────────────────────
const CHART_DEFAULTS = {
  responsive:          true,
  maintainAspectRatio: false,
  animation:           { duration: 400 },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: ctx => ' $' + ctx.parsed.y.toFixed(2)
      }
    }
  },
  scales: {
    x: { display: false },
    y: {
      display: true,
      grid:    { color: 'rgba(30,45,66,0.6)', drawBorder: false },
      ticks:   {
        color:    '#7a90a8',
        font:     { family: "'IBM Plex Mono', monospace", size: 10 },
        callback: v => '$' + v
      }
    }
  }
};

function pendingChart(canvas, message) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.offsetWidth  || 400;
  const H   = canvas.offsetHeight || 180;
  canvas.width  = W;
  canvas.height = H;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle    = '#3d5166';
  ctx.font         = "12px 'IBM Plex Mono', monospace";
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(message, W / 2, H / 2);
}

// Draws a vertical dashed line annotation at a given data index
function w37Plugin(w37Index) {
  return {
    id: 'w37Line',
    afterDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta.data[w37Index]) return;
      const x   = meta.data[w37Index].x;
      const ctx = chart.ctx;
      const top = chart.chartArea.top;
      const bot = chart.chartArea.bottom;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#f39c12';
      ctx.lineWidth   = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bot);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle  = '#f39c12';
      ctx.font       = "10px 'IBM Plex Mono', monospace";
      ctx.textAlign  = 'left';
      ctx.fillText('W37', x + 4, top + 14);
      ctx.restore();
    }
  };
}

// ── AS CHART (hero + project card) ───────────────────────────────────────────
async function initASCharts() {
  const heroCanvas = document.getElementById('hero-chart');
  const cardCanvas = document.getElementById('as-chart');

  let data;
  try {
    const res = await fetch('data/as_pnl.json');
    data = await res.json();
  } catch (e) {
    if (heroCanvas) pendingChart(heroCanvas, 'Walk-forward data pending');
    if (cardCanvas) pendingChart(cardCanvas, 'Walk-forward data pending');
    return;
  }

  if (!data.series || !data.series.length) {
    if (heroCanvas) pendingChart(heroCanvas, 'Walk-forward data pending');
    if (cardCanvas) pendingChart(cardCanvas, 'Walk-forward data pending');
    return;
  }

  const labels   = data.series.map(d => 'W' + d.window);
  const strategy = data.series.map(d => d.cumulative_strategy);
  const baseline = data.series.map(d => d.cumulative_baseline);
  const w37idx   = data.series.findIndex(d => d.window === 37);

  const buildConfig = () => ({
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label:       'Strategy',
          data:        strategy,
          borderColor: '#4a9eff',
          borderWidth: 1.5,
          pointRadius: 0,
          tension:     0.2,
          fill:        false
        },
        {
          label:       'Fixed-Horizon Baseline',
          data:        baseline,
          borderColor: '#3d5166',
          borderWidth: 1,
          borderDash:  [4, 4],
          pointRadius: 0,
          tension:     0.2,
          fill:        false
        }
      ]
    },
    options: { ...CHART_DEFAULTS },
    plugins: w37idx >= 0 ? [w37Plugin(w37idx)] : []
  });

  if (heroCanvas) new Chart(heroCanvas, buildConfig());
  if (cardCanvas) new Chart(cardCanvas, buildConfig());
}

// ── MOMENTUM CHART ────────────────────────────────────────────────────────────
async function initMomentumChart() {
  const canvas = document.getElementById('momentum-chart');
  if (!canvas) return;

  let data;
  try {
    const res = await fetch('data/momentum_signal.json');
    data = await res.json();
  } catch (e) {
    pendingChart(canvas, 'Signal data pending');
    return;
  }

  if (!data.equity_curve || !data.equity_curve.length) {
    pendingChart(canvas, 'Signal data pending');
    return;
  }

  const labels   = data.equity_curve.map(d => d.date);
  const strategy = data.equity_curve.map(d => d.strategy);
  const baseline = data.equity_curve.map(d => d.baseline);

  // Find index where post-2020 shading begins
  const post2020Plugin = {
    id: 'post2020',
    beforeDraw(chart) {
      const idx2020 = labels.findIndex(l => l >= '2020-01');
      if (idx2020 < 0) return;
      const meta = chart.getDatasetMeta(0);
      if (!meta.data[idx2020]) return;
      const x   = meta.data[idx2020].x;
      const ctx = chart.ctx;
      const top = chart.chartArea.top;
      const bot = chart.chartArea.bottom;
      const right = chart.chartArea.right;
      ctx.save();
      ctx.fillStyle = 'rgba(243,156,18,0.07)';
      ctx.fillRect(x, top, right - x, bot - top);
      ctx.fillStyle = '#f39c12';
      ctx.font      = "10px 'IBM Plex Mono', monospace";
      ctx.fillText('Rate-hike beta drag', x + 6, top + 14);
      ctx.restore();
    }
  };

  new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label:       'Strategy',
          data:        strategy,
          borderColor: '#4a9eff',
          borderWidth: 1.5,
          pointRadius: 0,
          tension:     0.3,
          fill:        false
        },
        {
          label:       'Russell 2000',
          data:        baseline,
          borderColor: '#3d5166',
          borderWidth: 1,
          borderDash:  [4, 4],
          pointRadius: 0,
          tension:     0.3,
          fill:        false
        }
      ]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        ...CHART_DEFAULTS.scales,
        x: {
          display: true,
          ticks:   {
            color:       '#3d5166',
            font:        { family: "'IBM Plex Mono', monospace", size: 9 },
            maxTicksLimit: 6,
            callback: (_, i) => labels[i] ? labels[i].slice(0, 7) : ''
          },
          grid: { display: false }
        }
      }
    },
    plugins: [post2020Plugin]
  });
}

// ── ES CALENDAR CHART ─────────────────────────────────────────────────────────
async function initESChart() {
  const canvas = document.getElementById('es-chart');
  if (!canvas) return;

  let data;
  try {
    const res = await fetch('data/es_signal.json');
    data = await res.json();
  } catch (e) {
    pendingChart(canvas, 'Signal data pending');
    return;
  }

  // When we have a live z_score time series the dashboard handles it;
  // on the main page, show EU vs US session avg P&L as a bar comparison
  const ss = data.session_stats;
  if (!ss) {
    pendingChart(canvas, 'Signal data pending');
    return;
  }

  new Chart(canvas, {
    type: 'bar',
    data: {
      labels: ['European Session', 'US Session'],
      datasets: [{
        data:            [ss.european.avg_pnl, ss.us.avg_pnl],
        backgroundColor: ['rgba(46,204,113,0.25)', 'rgba(122,144,168,0.15)'],
        borderColor:     ['#2ecc71', '#3d5166'],
        borderWidth:     1
      }]
    },
    options: {
      ...CHART_DEFAULTS,
      scales: {
        x: {
          display: true,
          ticks:   {
            color: '#7a90a8',
            font:  { family: "'IBM Plex Mono', monospace", size: 10 }
          },
          grid: { display: false }
        },
        y: {
          ...CHART_DEFAULTS.scales.y,
          ticks: {
            ...CHART_DEFAULTS.scales.y.ticks,
            callback: v => '+$' + v.toFixed(1)
          }
        }
      },
      plugins: {
        ...CHART_DEFAULTS.plugins,
        tooltip: {
          callbacks: {
            label: ctx => ' Avg P&L: +$' + ctx.parsed.y.toFixed(2) + '/trade'
          }
        }
      }
    }
  });
}

// ── SUBSTACK RSS ──────────────────────────────────────────────────────────────
async function loadSubstackPosts() {
  const RSS   = 'https://starkl7.substack.com/feed';
  const PROXY = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(RSS)}`;

  let items;
  try {
    const res  = await fetch(PROXY);
    const data = await res.json();
    if (data.status !== 'ok' || !data.items || !data.items.length) return;
    items = data.items.slice(0, 3);
  } catch (e) {
    return;
  }

  const grid = document.getElementById('writing-grid');
  if (!grid) return;

  items.reverse().forEach(item => {
    const date    = new Date(item.pubDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const tag     = item.categories && item.categories[0] ? item.categories[0] : 'Research';
    const desc    = item.description
      ? item.description.replace(/<[^>]+>/g, '').slice(0, 120) + '…'
      : '';

    const card = document.createElement('a');
    card.href   = item.link;
    card.target = '_blank';
    card.rel    = 'noopener';
    card.className = 'writing-card';
    card.innerHTML = `
      <div class="writing-date mono">${date}</div>
      <div class="writing-title">${item.title}</div>
      <div class="writing-desc">${desc}</div>
      <div class="writing-footer">
        <span class="writing-tag">${tag}</span>
        <span class="writing-cta">Read →</span>
      </div>
    `;
    grid.prepend(card);
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTagFilter();
  initScrollTracking();
  initASCharts();
  initMomentumChart();
  initESChart();
  loadSubstackPosts();

  if (typeof CoinbaseWS !== 'undefined') {
    CoinbaseWS.connect();
  }
});
