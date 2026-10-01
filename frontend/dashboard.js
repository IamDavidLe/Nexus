import { isSupabaseConfigured, supabase } from './supabase.js';

if (!isSupabaseConfigured) {
  window.location.replace('./auth.html?reason=setup');
} else {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session) window.location.replace('./auth.html?reason=session');
  });
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) window.location.replace('./auth.html?reason=session');
  });
  document.querySelector('[data-signout]')?.addEventListener('click', async (event) => {
    event.preventDefault();
    await supabase.auth.signOut();
    window.location.replace('./auth.html');
  });
}

/* =========================================================
   Nexus — dashboard behaviour
   Reveal, counters, live spending chart, activity filtering,
   transaction detail, notifications, card freeze, toasts.
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const money = (n, cents = true) =>
  '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

/* ---------- Reveal on scroll ---------- */
const io = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
  { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
);
$$('.reveal').forEach((el) => io.observe(el));

/* ---------- Greeting + date ---------- */
{
  const now = new Date();
  const hour = now.getHours();
  const part = hour < 5 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const h1 = $('.topbar h1');
  if (h1) h1.innerHTML = `Good ${part}, <em>Alex.</em>`;
  const today = $('[data-today]');
  if (today) today.textContent = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const updated = $('[data-updated]');
  if (updated) updated.textContent = `Updated ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/* ---------- Count-up numbers ---------- */
function countUp(el) {
  const target = Number(el.dataset.count);
  const prefix = el.dataset.prefix || '';
  const suffix = el.dataset.suffix || '';
  const decimals = el.dataset.suffix === '%' ? 0 : String(target).includes('.') ? 2 : 0;
  const render = (v) =>
    (el.textContent = prefix
      ? prefix + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix
      : v.toFixed(decimals) + suffix);

  if (reduced) return render(target);
  const dur = 1200;
  const t0 = performance.now();
  const tick = (t) => {
    const p = clamp((t - t0) / dur, 0, 1);
    render(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
const countIO = new IntersectionObserver(
  (entries) => entries.forEach((e) => e.isIntersecting && (countUp(e.target), countIO.unobserve(e.target))),
  { threshold: 0.4 }
);
$$('[data-count]').forEach((el) => countIO.observe(el));

/* ---------- Balance: hide / show ---------- */
{
  const card = $('[data-balance-card]');
  const amount = $('[data-balance]');
  const btn = $('[data-balance-toggle]');
  const real = amount?.innerHTML;
  btn?.addEventListener('click', () => {
    const hidden = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', String(hidden));
    btn.setAttribute('aria-label', hidden ? 'Show balance' : 'Hide balance');
    card.classList.toggle('is-hidden', hidden);
    amount.innerHTML = hidden ? '••••••' : real;
  });
}

/* ---------- Balance sparkline ---------- */
{
  const host = $('[data-spark]');
  if (host) {
    const pts = [42, 48, 44, 57, 52, 63, 59, 71, 66, 78, 74, 88];
    const w = 240;
    const h = 56;
    const max = Math.max(...pts);
    const min = Math.min(...pts);
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * w, h - 4 - ((v - min) / (max - min)) * (h - 12)]);
    const d = xy.map(([x, y], i) => (i ? `L${x.toFixed(1)},${y.toFixed(1)}` : `M${x.toFixed(1)},${y.toFixed(1)}`)).join('');
    host.innerHTML =
      `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
      `<path class="fill" d="${d}L${w},${h}L0,${h}Z" /><path d="${d}" /></svg>`;
  }
}

/* =========================================================
   Spending chart
   ========================================================= */
const RANGES = {
  '7d': {
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    now: [46.2, 18.9, 72.4, 31.5, 94.8, 68.1, 52.72],
    prev: [58.4, 41.2, 60.1, 49.7, 88.3, 79.6, 61.78],
    note: 'vs. $439.08 the week before',
    unit: 'day',
  },
  '30d': {
    labels: Array.from({ length: 30 }, (_, i) => (i < 16 ? `Sep ${15 + i}` : `Oct ${i - 15}`)),
    now: [38, 52, 24, 61, 44, 88, 72, 31, 46, 19, 74, 58, 92, 41, 63, 27, 55, 48, 81, 36, 69, 22, 57, 44, 78, 33, 61, 49, 86, 54],
    prev: [45, 48, 39, 70, 52, 81, 66, 44, 52, 33, 68, 61, 84, 50, 58, 41, 62, 55, 74, 47, 63, 38, 60, 51, 71, 45, 58, 56, 79, 62],
    note: 'vs. $1,724.00 the month before',
    unit: 'day',
  },
  '12m': {
    labels: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'],
    now: [1490, 1980, 1240, 1310, 1420, 1360, 1580, 1690, 1810, 1520, 1724, 1610],
    prev: [1620, 2040, 1380, 1290, 1510, 1470, 1620, 1580, 1740, 1660, 1690, 1705],
    note: 'vs. $19,305 the year before',
    unit: 'month',
  },
};

const chart = $('[data-chart]');
const svg = $('[data-chart-svg]');
const xAxis = $('[data-chart-x]');
const tip = $('[data-chart-tip]');
const totalEl = $('[data-chart-total]');
const trendEl = $('[data-chart-trend]');
const noteEl = $('[data-chart-note]');
const avgEl = $('[data-chart-avg]');

let range = '7d';
let geometry = null;

const NS = 'http://www.w3.org/2000/svg';
const el = (name, attrs) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};
const smooth = (pts) => {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const mx = (x0 + x1) / 2;
    d += `C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  return d;
};

function drawChart() {
  if (!chart || !svg) return;
  const data = RANGES[range];
  const w = chart.clientWidth;
  const h = chart.clientHeight;
  if (!w || !h) return;

  const padB = 26;
  const top = 10;
  const plot = h - padB - top;
  const max = Math.max(...data.now, ...data.prev) * 1.08;
  const px = (i, n) => (n === 1 ? w / 2 : (i / (n - 1)) * w);
  const py = (v) => top + plot - (v / max) * plot;

  const nowPts = data.now.map((v, i) => [px(i, data.now.length), py(v)]);
  const prevPts = data.prev.map((v, i) => [px(i, data.prev.length), py(v)]);
  const line = smooth(nowPts);

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.querySelectorAll(':scope > *:not(title)').forEach((n) => n.remove());

  const grid = el('g', { class: 'chart__grid' });
  [0.25, 0.5, 0.75, 1].forEach((f) => {
    const y = (top + plot * f).toFixed(1);
    grid.append(el('line', { x1: 0, x2: w, y1: y, y2: y }));
  });
  svg.append(grid);

  svg.append(el('path', { class: 'chart__area', d: `${line}L${w},${top + plot}L0,${top + plot}Z` }));
  svg.append(el('path', { class: 'chart__line chart__line--ghost', d: smooth(prevPts) }));

  const path = el('path', { class: 'chart__line', d: line });
  svg.append(path);
  if (!reduced) {
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len}`;
    path.style.strokeDashoffset = `${len}`;
    path.getBoundingClientRect();
    path.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.16,1,.3,1)';
    path.style.strokeDashoffset = '0';
  }

  const cursor = el('line', { class: 'chart__cursor', x1: 0, x2: 0, y1: top - 6, y2: top + plot });
  const knob = el('circle', { class: 'chart__knob', r: 4.5, cx: 0, cy: 0 });
  svg.append(cursor, knob);

  const n = data.labels.length;
  const step = Math.ceil(n / 7);
  xAxis.innerHTML = data.labels
    .map((l, i) =>
      i % step === 0 || i === n - 1
        ? `<span data-i="${i}" style="left:${((n === 1 ? 0.5 : i / (n - 1)) * 100).toFixed(2)}%">${l}</span>`
        : ''
    )
    .join('');

  const total = data.now.reduce((a, b) => a + b, 0);
  const prevTotal = data.prev.reduce((a, b) => a + b, 0);
  const delta = ((total - prevTotal) / prevTotal) * 100;
  const cents = range !== '12m';
  totalEl.textContent = money(total, cents);
  trendEl.className = `trend${delta > 0 ? ' trend--up' : ''}`;
  trendEl.innerHTML = `<span aria-hidden="true">${delta > 0 ? '↑' : '↓'}</span> ${Math.abs(delta).toFixed(1)}%`;
  noteEl.textContent = data.note;
  avgEl.textContent = `${data.unit === 'month' ? 'Monthly' : 'Daily'} average ${money(total / data.now.length, cents)}`;

  geometry = { data, nowPts, prevPts, cursor, knob, w, h, top, plot, cents };
}

function hover(clientX) {
  if (!geometry) return;
  const { data, nowPts, cursor, knob, w, cents } = geometry;
  const rect = chart.getBoundingClientRect();
  const x = clamp(clientX - rect.left, 0, w);
  const i = clamp(Math.round((x / w) * (nowPts.length - 1)), 0, nowPts.length - 1);
  const [cx, cy] = nowPts[i];

  cursor.setAttribute('x1', cx);
  cursor.setAttribute('x2', cx);
  knob.setAttribute('cx', cx);
  knob.setAttribute('cy', cy);

  const value = data.now[i];
  const prev = data.prev[i];
  const diff = value - prev;
  tip.innerHTML =
    `<small>${data.labels[i]}</small><b>${money(value, cents)}</b>` +
    `<span>${diff >= 0 ? '+' : '−'}${money(Math.abs(diff), cents)} vs. last ${data.unit}</span>`;
  tip.style.left = `${clamp(cx, 76, w - 76)}px`;
  tip.style.top = `${cy}px`;
  chart.classList.add('is-live');
  $$('span', xAxis).forEach((s) => s.classList.toggle('is-live', Number(s.dataset.i) === i));
}

if (chart) {
  drawChart();
  chart.addEventListener('pointermove', (e) => hover(e.clientX));
  chart.addEventListener('pointerleave', () => {
    chart.classList.remove('is-live');
    $$('span', xAxis).forEach((s) => s.classList.remove('is-live'));
  });

  let raf;
  addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawChart);
  });

  $$('[data-range]').forEach((chip) =>
    chip.addEventListener('click', () => {
      if (chip.dataset.range === range) return;
      range = chip.dataset.range;
      $$('[data-range]').forEach((c) => {
        const on = c === chip;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-selected', String(on));
      });
      chart.classList.remove('is-live');
      drawChart();
    })
  );
}

/* =========================================================
   Activity
   ========================================================= */
const TX = [
  { who: 'Maya Torres', initial: 'M', tone: '#bfdbfe', note: '🍣 Sushi Friday', amount: 18.4, when: 'Today, 7:42 PM', dir: 'in' },
  { who: 'Leo Chen', initial: 'L', tone: '#93c5fd', note: '🚕 Ride home', amount: -12, when: 'Today, 1:08 AM', dir: 'out' },
  { who: 'Corner Coffee Co.', initial: 'C', tone: '#f3cf8a', note: '☕ Flat white ×2', amount: -9.5, when: 'Yesterday, 8:31 AM', dir: 'out' },
  { who: 'Priya Shah', initial: 'P', tone: '#7dd3fc', note: '🎂 Birthday dinner', amount: -20, when: 'Oct 11, 9:15 PM', dir: 'out' },
  { who: 'Jordan Lee', initial: 'J', tone: '#a5b4fc', note: '🎬 Movie tickets', amount: 15, when: 'Oct 9, 6:02 PM', dir: 'in' },
  { who: 'Utilities · 4B Ellis', initial: 'U', tone: '#7ee0c0', note: '🏠 Split 3 ways', amount: -31.25, when: 'Oct 8, 12:00 PM', dir: 'out' },
];

const list = $('[data-tx-list]');
const empty = $('[data-tx-empty]');
let filter = 'all';
let query = '';

function renderTx() {
  if (!list) return;
  const rows = TX.filter((t) => (filter === 'all' || t.dir === filter) && (t.who + t.note).toLowerCase().includes(query));
  list.innerHTML = rows
    .map(
      (t, i) => `<li><button class="tx" type="button" data-tx="${TX.indexOf(t)}">
      <span class="avatar" style="--avatar:${t.tone}" aria-hidden="true">${t.initial}</span>
      <span class="tx__who"><b>${t.who}</b><small>${t.note} · ${t.when.split(',')[0]}</small></span>
      <span class="tx__amt${t.amount > 0 ? ' is-positive' : ''}">${t.amount > 0 ? '+' : '−'}${money(t.amount)}</span>
    </button></li>`
    )
    .join('');
  empty.hidden = rows.length > 0;
}
renderTx();

$$('[data-filter]').forEach((chip) =>
  chip.addEventListener('click', () => {
    filter = chip.dataset.filter;
    $$('[data-filter]').forEach((c) => {
      const on = c === chip;
      c.classList.toggle('is-active', on);
      c.setAttribute('aria-selected', String(on));
    });
    renderTx();
  })
);

const search = $('[data-search]');
search?.addEventListener('input', () => {
  query = search.value.trim().toLowerCase();
  renderTx();
});

/* ---------- Transaction modal ---------- */
const txm = $('[data-txm]');
let lastFocus = null;

function openTx(tx, origin) {
  lastFocus = origin;
  $('[data-txm-av]').textContent = tx.initial;
  $('[data-txm-av]').style.setProperty('--avatar', tx.tone);
  $('[data-txm-title]').textContent = tx.amount > 0 ? `${tx.who.split(' ')[0]} paid you` : `You paid ${tx.who}`;
  $('[data-txm-amt]').textContent = money(tx.amount);
  $('[data-txm-note]').textContent = tx.note;
  $('[data-txm-when]').textContent = tx.when;
  $('[data-txm-id]').textContent = `NX-${Math.random().toString(16).slice(2, 6).toUpperCase()}-${Math.random()
    .toString(16)
    .slice(2, 6)
    .toUpperCase()}`;
  txm.classList.add('is-open');
  txm.setAttribute('aria-hidden', 'false');
  $('.txm__x', txm).focus();
}
function closeTx() {
  txm.classList.remove('is-open');
  txm.setAttribute('aria-hidden', 'true');
  lastFocus?.focus();
}
list?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tx]');
  if (btn) openTx(TX[Number(btn.dataset.tx)], btn);
});
$$('[data-txm-close]').forEach((b) => b.addEventListener('click', closeTx));

/* =========================================================
   Budgets
   ========================================================= */
const BUDGETS = [
  { label: 'Eating out', spent: 186.4, cap: 250, tone: '#93c5fd' },
  { label: 'Groceries', spent: 142.18, cap: 320, tone: '#7ee0c0' },
  { label: 'Transport', spent: 74.5, cap: 120, tone: '#a5b4fc' },
  { label: 'Fun', spent: 209.54, cap: 200, tone: '#ffb4c0' },
];
{
  const host = $('[data-budgets]');
  if (host) {
    host.innerHTML = BUDGETS.map((b, i) => {
      const pct = (b.spent / b.cap) * 100;
      return `<div class="budget${pct > 100 ? ' budget--over' : ''}" style="--tone:${b.tone}; --d:${i * 0.1}s">
        <div class="budget__top"><span>${b.label}</span><small>${money(b.spent)} / ${money(b.cap, false)}</small></div>
        <div class="bar" role="img" aria-label="${b.label}: ${Math.round(pct)}% of budget used"><i data-w="${clamp(pct, 0, 100)}"></i></div>
      </div>`;
    }).join('');
    const fill = () => $$('.bar i', host).forEach((i) => (i.style.width = `${i.dataset.w}%`));
    reduced ? fill() : new IntersectionObserver((e, o) => e[0].isIntersecting && (fill(), o.disconnect()), { threshold: 0.3 }).observe(host);
  }
}

/* ---------- Savings ring ---------- */
{
  const prog = $('[data-ring-prog]');
  if (prog) {
    const len = 2 * Math.PI * 52;
    prog.setAttribute('stroke-dasharray', len.toFixed(1));
    prog.setAttribute('stroke-dashoffset', len.toFixed(1));
    const run = () => prog.setAttribute('stroke-dashoffset', (len * (1 - 0.68)).toFixed(1));
    reduced
      ? run()
      : new IntersectionObserver((e, o) => e[0].isIntersecting && (setTimeout(run, 180), o.disconnect()), { threshold: 0.4 }).observe($('[data-ring]'));
  }
}

/* =========================================================
   Card freeze, notifications, toasts
   ========================================================= */
const toasts = $('[data-toasts]');
function toast(message) {
  if (!toasts) return;
  const node = document.createElement('div');
  node.className = 'toast';
  const indicator = document.createElement('i');
  indicator.setAttribute('aria-hidden', 'true');
  node.append(indicator, document.createTextNode(message));
  toasts.append(node);
  setTimeout(() => {
    node.classList.add('is-out');
    node.addEventListener('animationend', () => node.remove());
  }, 2800);
}

/* ---------- Quick actions ---------- */
const actionModal = $('[data-action-modal]');
const actionForm = $('[data-action-form]');
const actionContent = $('[data-action-content]');
const actionTitle = $('[data-action-title]');
const actionEyebrow = $('[data-action-eyebrow]');
const actionSubmit = $('[data-action-submit]');
const actionError = $('[data-action-error]');
let activeAction = null;
let actionLastFocus = null;

const actionViews = {
  send: {
    eyebrow: 'Move money',
    title: 'Send a payment.',
    submit: 'Send now',
    content: `
      <div class="action-fields">
        <label>To<input name="recipient" required autocomplete="off" placeholder="Name, phone, or @handle" /></label>
        <div class="action-fields__grid"><label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0.00" /></label><label>Note<input name="note" maxlength="80" placeholder="What’s this for?" /></label></div>
      </div>`,
  },
  request: {
    eyebrow: 'Get paid back',
    title: 'Request money.',
    submit: 'Send request',
    content: `
      <div class="action-fields">
        <label>Request from<input name="recipient" required autocomplete="off" placeholder="Name, phone, or @handle" /></label>
        <div class="action-fields__grid"><label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0.00" /></label><label>For<input name="note" maxlength="80" placeholder="Dinner, tickets…" /></label></div>
      </div>`,
  },
  split: {
    eyebrow: 'Share a cost',
    title: 'Split a bill.',
    submit: 'Create split',
    content: `
      <div class="action-fields">
        <label>Total amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0.00" /></label>
        <label>Split with<input name="people" required autocomplete="off" placeholder="Maya, Leo, Priya" /></label>
        <label>What was it for?<input name="note" maxlength="80" placeholder="Dinner, utilities…" /></label>
        <div class="split-preview" data-split-preview><span>Add at least two people to calculate each share.</span><b>—</b></div>
      </div>`,
  },
  scan: {
    eyebrow: 'Pay in person',
    title: 'Scan to pay.',
    submit: 'Scan demo code',
    content: `<div class="scan-stage" data-scan-stage><span>Align a QR code here</span><b>Demo scanner · no camera access needed</b></div>`,
  },
  'top-up': {
    eyebrow: 'Add funds',
    title: 'Top up your balance.',
    submit: 'Add money',
    content: `
      <div class="action-fields">
        <label>Amount<input name="amount" type="number" min="0.01" step="0.01" inputmode="decimal" required placeholder="0.00" /></label>
        <label>From<select name="source"><option>•••• 4821 · Debit card</option><option>•••• 0902 · Bank account</option><option>Apple Pay</option></select></label>
      </div>`,
  },
};

function setActionError(message = '') {
  actionError.textContent = message;
}

function updateSplitPreview() {
  if (activeAction !== 'split') return;
  const preview = $('[data-split-preview]', actionContent);
  const amount = Number(actionForm.elements.amount?.value);
  const people = String(actionForm.elements.people?.value || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (!preview || !Number.isFinite(amount) || amount <= 0 || people.length < 2) return;
  preview.innerHTML = `<span>${people.length} people · you included</span><b>${money(amount / (people.length + 1))} each</b>`;
}

function openAction(key, origin) {
  const view = actionViews[key];
  if (!view) return;
  activeAction = key;
  actionLastFocus = origin;
  actionEyebrow.textContent = view.eyebrow;
  actionTitle.textContent = view.title;
  actionSubmit.textContent = view.submit;
  actionContent.innerHTML = view.content;
  setActionError();
  actionModal.classList.add('is-open');
  actionModal.setAttribute('aria-hidden', 'false');
  const firstField = $('input, select', actionContent);
  (firstField || $('[data-action-close]', actionModal)).focus();
}

function closeAction() {
  if (!actionModal?.classList.contains('is-open')) return;
  actionModal.classList.remove('is-open');
  actionModal.setAttribute('aria-hidden', 'true');
  actionLastFocus?.focus();
  activeAction = null;
}

$$('[data-quick-action]').forEach((button) => button.addEventListener('click', () => openAction(button.dataset.quickAction, button)));
$$('[data-action-close]').forEach((button) => button.addEventListener('click', closeAction));

actionForm?.addEventListener('input', () => {
  setActionError();
  updateSplitPreview();
});

actionForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!activeAction) return;
  if (activeAction === 'scan') {
    const stage = $('[data-scan-stage]', actionContent);
    stage?.classList.add('is-scanned');
    if (stage) stage.querySelector('span').textContent = 'Corner Coffee Co. found';
    if (stage) stage.querySelector('b').textContent = 'Ready for a $4.80 payment';
    actionSubmit.textContent = 'Scanned';
    toast('Demo code scanned — Corner Coffee Co. is ready to pay');
    return;
  }

  const amount = Number(actionForm.elements.amount?.value);
  if (!Number.isFinite(amount) || amount <= 0) return setActionError('Enter an amount greater than $0.');
  const recipient = String(actionForm.elements.recipient?.value || '').trim();
  const people = String(actionForm.elements.people?.value || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);

  if (['send', 'request'].includes(activeAction) && !recipient) return setActionError('Add a recipient before continuing.');
  if (activeAction === 'split' && people.length < 2) return setActionError('Add at least two people to create a split.');

  const amountText = money(amount);
  if (activeAction === 'send') toast(`${amountText} sent to ${recipient}`);
  if (activeAction === 'request') toast(`${amountText} request sent to ${recipient}`);
  if (activeAction === 'split') toast(`${amountText} split with ${people.length} people`);
  if (activeAction === 'top-up') toast(`${amountText} added to your balance`);
  closeAction();
});

{
  const freeze = $('[data-freeze]');
  const card = $('[data-card]');

  card?.addEventListener('click', () => {
    const flipped = card.getAttribute('aria-pressed') !== 'true';
    card.setAttribute('aria-pressed', String(flipped));
    card.setAttribute('aria-label', flipped ? 'Flip card to show its front' : 'Flip card to see card details');
  });

  freeze?.addEventListener('click', () => {
    const on = freeze.getAttribute('aria-pressed') !== 'true';
    freeze.setAttribute('aria-pressed', String(on));
    card.classList.toggle('is-frozen', on);
    toast(on ? 'Card frozen — nothing can be charged' : 'Card unfrozen and ready to tap');
  });
}

$$('[data-settle]').forEach((btn) =>
  btn.addEventListener('click', () => {
    const name = btn.dataset.settle;
    const paid = btn.textContent.trim() === 'Pay';
    btn.textContent = paid ? 'Paid' : 'Reminded';
    btn.classList.add('is-done');
    toast(paid ? `Settled up with ${name}` : `Reminder sent to ${name}`);
  })
);

/* ---------- Notifications drawer ---------- */
const drawer = $('[data-drawer]');
const setDrawer = (open) => {
  drawer.classList.toggle('is-open', open);
  drawer.setAttribute('aria-hidden', String(!open));
  document.body.style.overflow = open ? 'hidden' : '';
  if (open) $('[data-drawer-close].icon-button', drawer)?.focus();
};
$('[data-notifs]')?.addEventListener('click', () => setDrawer(true));
$$('[data-drawer-close]').forEach((b) => b.addEventListener('click', () => setDrawer(false)));

/* ---------- Mobile rail ---------- */
{
  const rail = $('[data-rail]');
  const toggle = $('[data-rail-toggle]');
  const scrim = $('.rail__scrim');
  const closeControls = $$('[data-rail-close]');
  const setRail = (open) => {
    if (!rail) return;
    rail.classList.toggle('is-open', open);
    toggle?.setAttribute('aria-expanded', String(open));
    toggle?.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    scrim?.classList.toggle('is-visible', open);
  };
  toggle?.addEventListener('click', (event) => {
    event.preventDefault();
    setRail(!rail?.classList.contains('is-open'));
  });
  closeControls.forEach((control) => control.addEventListener('click', () => setRail(false)));
  $$('.rail__scroll .nav-item').forEach((a) =>
    a.addEventListener('click', () => setRail(false))
  );
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && rail?.classList.contains('is-open')) setRail(false);
  });
}

/* ---------- Rail active state follows sections ---------- */
{
  const links = $$('.nav-item[href^="#"]');
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const sections = [...map.keys()].map((id) => document.getElementById(id)).filter(Boolean);
  if (sections.length) {
    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!top) return;
        links.forEach((a) => a.classList.remove('is-active'));
        map.get(top.target.id)?.classList.add('is-active');
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0.1, 0.4, 0.8] }
    );
    sections.forEach((s) => observer.observe(s));
  }
}

/* ---------- Glass button spotlight ---------- */
$$('.glass-btn').forEach((btn) =>
  btn.addEventListener('pointermove', (e) => {
    const r = btn.getBoundingClientRect();
    btn.style.setProperty('--mx', `${e.clientX - r.left}px`);
    btn.style.setProperty('--my', `${e.clientY - r.top}px`);
  })
);

/* ---------- Keyboard ---------- */
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (txm?.classList.contains('is-open')) closeTx();
    else if (drawer?.classList.contains('is-open')) setDrawer(false);
  }
  if (e.key === '/' && document.activeElement !== search) {
    e.preventDefault();
    search?.focus();
  }
});
