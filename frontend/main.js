/* =========================================================
   Nexus — landing page motion
   Canvas sky + clouds, live phone feed, feature scenes,
   scroll-scrubbed statement. No dependencies.
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~[-1,1]
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmtMoney = (cents) => {
  const sign = cents < 0 ? "−" : "";
  const c = Math.abs(cents);
  return `${sign}$${Math.floor(c / 100).toLocaleString("en-US")}.${String(c % 100).padStart(2, "0")}`;
};

/* ---------- Word splitting ---------- */
$$("[data-hero-title] .w").forEach((w, i) => w.style.setProperty("--i", i));

function splitWords(el, cls) {
  const walk = (node, italic) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
          const s = document.createElement("span");
          s.className = cls + (italic ? " em" : "");
          s.textContent = part;
          frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && n.tagName !== "BR") {
        walk(n, italic || n.tagName === "EM");
      }
    });
  };
  walk(el, false);
  $$("." + cls, el).forEach((s, i) => s.style.setProperty("--i", i));
  return $$("." + cls, el);
}
$$("[data-words]").forEach((el) => splitWords(el, "wd"));

/* ---------- Reveal on scroll ---------- */
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
}, { threshold: 0.18, rootMargin: "0px 0px -6% 0px" });
$$(".reveal, [data-words]").forEach((el) => io.observe(el));

/* ---------- Nav ---------- */
const nav = $("[data-nav]");
const burger = $("[data-burger]");
const menu = $("[data-menu]");
const setMenu = (open) => {
  burger.setAttribute("aria-expanded", open);
  menu.classList.toggle("is-open", open);
  menu.setAttribute("aria-hidden", !open);
  document.body.style.overflow = open ? "hidden" : "";
};
burger.addEventListener("click", () => setMenu(!menu.classList.contains("is-open")));
$$("a", menu).forEach((a) => a.addEventListener("click", () => setMenu(false)));

const navLinks = $$(".nav__links a");
const secIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (e.isIntersecting) navLinks.forEach((a) => a.classList.toggle("is-active", a.hash === "#" + e.target.id));
  });
}, { rootMargin: "-45% 0px -50% 0px" });
$$("main section[id]").forEach((s) => secIO.observe(s));

/* ---------- Glass button spotlight ---------- */
$$(".glass-btn").forEach((b) => b.addEventListener("pointermove", (e) => {
  const r = b.getBoundingClientRect();
  b.style.setProperty("--mx", `${e.clientX - r.left}px`);
  b.style.setProperty("--my", `${e.clientY - r.top}px`);
}));

/* =========================================================
   SKY: stars + three parallax cloud banks on two canvases
   ========================================================= */
const sky = (() => {
  const back = $("[data-sky-back]");
  const front = $("[data-sky-front]");
  const hero = $(".hero");
  if (!back || !front) return null;
  const bctx = back.getContext("2d");
  const fctx = front.getContext("2d");
  let W, H, dpr, stars = [], layers = [];

  // Paint one wrap-around cloud bank on an offscreen canvas.
  function makeBank(w, h, { clusters, heightMax, shade, alpha = 1, tower = false }) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    const puff = (px, py, r, a) => {
      for (const ox of [0, -w, w]) {
        const cx = px + ox;
        if (cx + r < 0 || cx - r > w) continue;
        const g = x.createRadialGradient(cx, py - r * 0.15, 0, cx, py, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`);
        g.addColorStop(0.62, `rgba(255,255,255,${a * 0.85})`);
        g.addColorStop(0.85, `rgba(255,255,255,${a * 0.3})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = g;
        x.beginPath(); x.arc(cx, py, r, 0, Math.PI * 2); x.fill();
      }
    };
    const base = h * 0.74;
    for (let k = 0; k < clusters; k++) {
      const cx = (k + Math.random() * 0.8) * (w / clusters);
      const cw = rand(0.35, 0.8) * (w / clusters);
      const ch = rand(0.45, 1) * heightMax;
      const n = Math.round(rand(26, 44));
      for (let i = 0; i < n; i++) {
        const dx = gauss() * cw * 0.6;
        const fall = 1 - Math.min(1, Math.abs(dx) / cw);
        const r = rand(0.18, 0.36) * ch * (0.45 + fall);
        const py = base - Math.abs(gauss()) * ch * fall * 0.75 - r * 0.2;
        puff(cx + dx, py, r, rand(0.35, 0.7));
      }
    }
    if (tower) {
      // one tall billowing cumulus
      const tx = w * 0.14, n = 60;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const r = rand(0.1, 0.18) * h * (1.1 - t * 0.55);
        const py = Math.max(r * 1.05, base - t * h * 0.55 + gauss() * 10); // keep puffs inside the bank
        puff(tx + gauss() * w * 0.05 * (1.2 - t), py, r, rand(0.4, 0.75));
      }
    }
    // colour the puffs: lit tops, shaded bellies
    x.globalCompositeOperation = "source-atop";
    const grd = x.createLinearGradient(0, 0, 0, h);
    shade.forEach(([stop, col]) => grd.addColorStop(stop, col));
    x.fillStyle = grd;
    x.fillRect(0, 0, w, h);
    // melt the bank's lower edge so no hard line shows
    x.globalCompositeOperation = "destination-in";
    const fade = x.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, "#000"); fade.addColorStop(0.72, "#000"); fade.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = fade;
    x.fillRect(0, 0, w, h);
    return { canvas: c, w, h, alpha };
  }

  function build() {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    const r = hero.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    for (const cv of [back, front]) { cv.width = W * dpr; cv.height = H * dpr; }
    bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const narrow = W < 700;

    stars = Array.from({ length: narrow ? 60 : 130 }, () => ({
      x: Math.random() * W, y: Math.pow(Math.random(), 1.6) * H * 0.42,
      r: rand(0.3, 1.2), p: Math.random() * Math.PI * 2, s: rand(0.6, 2),
    }));

    layers = [
      { ctx: bctx, y: 0.40, speed: 3, par: 0.34,
        bank: makeBank(Math.round(W * 1.5), Math.round(H * 0.26), { clusters: narrow ? 4 : 7, heightMax: H * 0.18, alpha: 0.7,
          shade: [[0, "rgba(255,244,246,.95)"], [0.6, "rgba(246,206,214,.9)"], [1, "rgba(206,178,220,.85)"]] }) },
      { ctx: bctx, y: 0.46, speed: 7, par: 0.2,
        bank: makeBank(Math.round(W * 1.7), Math.round(H * 0.42), { clusters: narrow ? 3 : 5, heightMax: H * 0.26, tower: !narrow,
          shade: [[0, "rgba(255,238,242,.98)"], [0.45, "rgba(236,190,212,.95)"], [1, "rgba(150,140,205,.95)"]] }) },
      { ctx: fctx, y: 0.86, speed: 13, par: 0.06,
        bank: makeBank(Math.round(W * 2), Math.round(H * 0.34), { clusters: narrow ? 4 : 8, heightMax: H * 0.2,
          shade: [[0, "rgba(232,206,232,1)"], [0.35, "rgba(170,156,214,1)"], [1, "rgba(52,48,110,1)"]] }) },
    ];
  }

  let t0 = performance.now(), running = true, raf;
  function frame(now) {
    const t = (now - t0) / 1000;
    const sy = scrollY;
    bctx.clearRect(0, 0, W, H);
    fctx.clearRect(0, 0, W, H);

    // stars
    for (const s of stars) {
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
      bctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
      bctx.beginPath(); bctx.arc(s.x, s.y + sy * 0.4, s.r, 0, Math.PI * 2); bctx.fill();
    }
    // clouds
    for (const L of layers) {
      const { canvas, w, h, alpha } = L.bank;
      const y = H * L.y + sy * L.par - h * 0.5;
      let x = -((t * L.speed) % w);
      L.ctx.globalAlpha = alpha;
      while (x < W) { L.ctx.drawImage(canvas, x, y, w, h); x += w; }
      L.ctx.globalAlpha = 1;
    }
    if (running && !reduced) raf = requestAnimationFrame(frame);
  }

  build();
  frame(performance.now());
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { build(); frame(performance.now()); }, 200); });
  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    cancelAnimationFrame(raf);
    if (running && !reduced) raf = requestAnimationFrame(frame);
  }).observe(hero);
  return { redraw: () => reduced && frame(performance.now()) };
})();

/* ---------- Hero scroll parallax ---------- */
const heroCopy = $(".hero__copy");
const heroStage = $("[data-hero-stage]");
function onScroll() {
  const y = scrollY;
  nav.classList.toggle("is-scrolled", y > 60);
  if (!menu.classList.contains("is-open")) nav.classList.toggle("is-hidden", y > lastY && y > 700);
  lastY = y;
  if (y < innerHeight * 1.4 && !reduced) {
    heroCopy.style.transform = `translateY(${y * 0.35}px)`;
    heroCopy.style.opacity = String(clamp(1 - y / 520, 0, 1));
    heroStage.style.transform = `translateY(${-y * 0.18}px)`;
  }
  scrubStatement();
  sky && sky.redraw();
}
let lastY = scrollY, ticking = false;
addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { onScroll(); ticking = false; });
}, { passive: true });

/* =========================================================
   PHONE: live activity feed + balance in integer cents
   ========================================================= */
const FEED = [
  { n: "Maya", c: "#f59e8b", note: "🍣 Sushi Friday", amt: 1840 },
  { n: "Leo", c: "#8fb3ff", note: "🚕 Airport cab", amt: -1200 },
  { n: "Priya", c: "#9be0c7", note: "🎂 Mia's gift fund", amt: -2000 },
  { n: "Sam", c: "#ffd27a", note: "🍕 Pizza night", amt: 950 },
  { n: "Jordan", c: "#c9a7ff", note: "🎬 Movie tickets", amt: -1500 },
  { n: "Noah", c: "#7fd3e6", note: "⚽ 5-a-side pitch", amt: 600 },
  { n: "Ava", c: "#f7a8c8", note: "🛒 Groceries", amt: -2375 },
  { n: "Kai", c: "#b7e27a", note: "🏖️ Lisbon Airbnb", amt: 8200 },
];
const list = $("[data-activity]");
const balEl = $("[data-balance]");
let balance = 248016; // cents
let feedIdx = 0;
function feedItem(f, isNew) {
  const li = document.createElement("li");
  if (isNew) li.className = "is-new";
  li.innerHTML = `<span class="av" style="--c:${f.c}">${f.n[0]}</span><div><b>${f.n}</b><small>${f.note}</small></div><em class="${f.amt > 0 ? "plus" : ""}">${f.amt > 0 ? "+" : ""}${fmtMoney(f.amt)}</em>`;
  return li;
}
function tweenBalance(to) {
  const from = balance, start = performance.now(), dur = reduced ? 1 : 900;
  balance = to;
  const step = (now) => {
    const p = clamp((now - start) / dur, 0, 1);
    const e = 1 - Math.pow(1 - p, 3);
    balEl.textContent = fmtMoney(Math.round(from + (to - from) * e));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
for (let i = 0; i < 5; i++) list.appendChild(feedItem(FEED[(feedIdx++) % FEED.length]));
setInterval(() => {
  if (document.hidden) return;
  const f = FEED[(feedIdx++) % FEED.length];
  $$("li", list).forEach((li) => li.classList.remove("is-new"));
  list.prepend(feedItem(f, true));
  while (list.children.length > 5) list.lastChild.remove();
  tweenBalance(balance + f.amt);
}, 3200);

/* ---------- Hero toasts ---------- */
const toasts = $$("[data-toast]");
let toastIdx = 0;
setTimeout(function cycle() {
  const t = toasts[toastIdx % toasts.length];
  t.classList.add("is-on");
  setTimeout(() => t.classList.remove("is-on"), 4200);
  toastIdx++;
  setTimeout(cycle, 1900);
}, 2400);

/* ---------- Statement: scroll-scrubbed words ---------- */
const scrubEl = $("[data-scrub]");
const scrubWords = scrubEl ? splitWords(scrubEl, "sw") : [];
scrubWords.slice(-3).forEach((w) => w.classList.add("em"));
function scrubStatement() {
  if (!scrubEl) return;
  const r = scrubEl.getBoundingClientRect();
  const p = clamp((innerHeight * 0.82 - r.top) / (innerHeight * 0.55), 0, 1);
  const lit = reduced ? scrubWords.length : Math.round(p * scrubWords.length);
  scrubWords.forEach((w, i) => w.classList.toggle("lit", i < lit));
}

/* =========================================================
   FEATURES: auto-advancing tabs + scene choreography
   ========================================================= */
const TABS = [
  { t: "Instant, everywhere.", c: "Send to anyone with a phone number, email or @handle. The money arrives in seconds and can be spent the moment it lands." },
  { t: "Split anything.", c: "Snap a receipt or type in a total. Nexus splits it to the cent, and any leftover cent goes to whoever paid, so the numbers always add up." },
  { t: "Ask without the awkward.", c: "Send a friendly request with an emoji and a note. Nexus sends the reminders so you don't have to." },
  { t: "Point. Pay. Done.", c: "Scan any Nexus code to pay a friend, a food truck or the corner café. You don't have to type a thing." },
];
const chips = $$("[data-tab]");
const scenes = $$("[data-scene]");
const titleEl = $("[data-feature-title]");
const copyEl = $("[data-feature-copy]");
const bar = $("[data-progress]");
const TAB_MS = 6000;
let tab = 0, tabStart = performance.now(), featVisible = false, sceneTimers = [];

// QR code (decorative) with proper finder squares
(() => {
  const qr = $("[data-qr]");
  const N = 21;
  const finder = (r, c) => {
    for (const [fr, fc] of [[0, 0], [0, N - 7], [N - 7, 0]]) {
      const y = r - fr, x = c - fc;
      if (y >= 0 && y < 7 && x >= 0 && x < 7) {
        return y === 0 || y === 6 || x === 0 || x === 6 || (y >= 2 && y <= 4 && x >= 2 && x <= 4) ? 1 : 0;
      }
      if (y >= -1 && y <= 7 && x >= -1 && x <= 7) return 0; // quiet ring
    }
    return -1;
  };
  let html = "";
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const f = finder(r, c);
    const on = f === -1 ? Math.random() < 0.48 : f === 1;
    html += `<i class="${on ? "" : "o"}" style="--i:${r * N + c}"></i>`;
  }
  qr.insertAdjacentHTML("beforeend", html);
})();

function playScene(i) {
  sceneTimers.forEach(clearTimeout);
  sceneTimers = [];
  if (i === 0) {
    const s = $(".send");
    const amt = $("[data-type-amt]");
    s.classList.remove("is-sliding", "is-done");
    amt.textContent = "0";
    const seq = ["4", "42", "42.", "42.0", "42.00"];
    seq.forEach((v, k) => sceneTimers.push(setTimeout(() => (amt.textContent = v), 450 + k * 160)));
    sceneTimers.push(setTimeout(() => s.classList.add("is-sliding"), 1600));
    sceneTimers.push(setTimeout(() => s.classList.add("is-done"), 2650));
  }
}

function setTab(i, fromUser) {
  tab = (i + TABS.length) % TABS.length;
  tabStart = performance.now();
  chips.forEach((c, k) => { c.classList.toggle("is-active", k === tab); c.setAttribute("aria-selected", k === tab); });
  scenes.forEach((s, k) => s.classList.toggle("is-active", k === tab));
  [titleEl, copyEl].forEach((el) => { el.classList.remove("swap-in"); el.classList.add("swap-out"); });
  setTimeout(() => {
    titleEl.textContent = TABS[tab].t;
    copyEl.textContent = TABS[tab].c;
    [titleEl, copyEl].forEach((el) => { el.classList.remove("swap-out"); void el.offsetWidth; el.classList.add("swap-in"); });
  }, fromUser === "init" ? 0 : 320);
  playScene(tab);
}
chips.forEach((c) => c.addEventListener("click", () => setTab(+c.dataset.tab, true)));
$(".chips").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  setTab(tab + (e.key === "ArrowRight" ? 1 : -1), true);
  chips[tab].focus();
});

(function tick(now) {
  if (featVisible && !document.hidden) {
    const p = clamp((now - tabStart) / TAB_MS, 0, 1);
    bar.style.transform = `scaleX(${p})`;
    if (p >= 1 && !reduced) setTab(tab + 1);
  } else {
    tabStart = now - (parseFloat(bar.style.transform.slice(7)) || 0) * TAB_MS;
  }
  requestAnimationFrame(tick);
})(performance.now());
new IntersectionObserver(([e]) => {
  const was = featVisible;
  featVisible = e.isIntersecting;
  if (featVisible && !was) playScene(tab);
}, { threshold: 0.35 }).observe($(".features"));

// Starfield in the feature visual
(() => {
  const cv = $("[data-stars]");
  const ctx = cv.getContext("2d");
  let w, h, pts = [], on = false;
  const size = () => {
    const d = Math.min(devicePixelRatio || 1, 1.5);
    w = cv.offsetWidth; h = cv.offsetHeight;
    cv.width = w * d; cv.height = h * d; ctx.setTransform(d, 0, 0, d, 0, 0);
    pts = Array.from({ length: Math.round((w * h) / 1400) }, () => ({ x: Math.random() * w, y: Math.random() * h, r: rand(0.3, 1.3), p: Math.random() * 6, s: rand(0.5, 2.2), b: Math.random() < 0.12 }));
  };
  size();
  addEventListener("resize", size);
  (function draw(now) {
    if (on || reduced) {
      const t = now / 1000;
      ctx.clearRect(0, 0, w, h);
      for (const s of pts) {
        const a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
        ctx.fillStyle = s.b ? `rgba(160,200,255,${a})` : `rgba(255,255,255,${a * 0.8})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (!reduced) requestAnimationFrame(draw);
  })(performance.now());
  new IntersectionObserver(([e]) => (on = e.isIntersecting)).observe(cv);
})();

/* ---------- Counters ---------- */
const countIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    countIO.unobserve(e.target);
    const el = e.target, to = +el.dataset.count, from = +(el.dataset.from || 0);
    const start = performance.now(), dur = reduced ? 1 : 1600;
    const step = (now) => {
      const p = clamp((now - start) / dur, 0, 1);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}, { threshold: 0.6 });
$$("[data-count]").forEach((el) => countIO.observe(el));

/* ---------- Feed marquee ---------- */
const POSTS = [
  ["🍕", "Sam paid Priya", "Friday pizza, the good one"],
  ["🚕", "You & Leo", "Airport cab at 5am"],
  ["🏠", "Rent · 4 roommates", "Split evenly · $612.50 each"],
  ["🎂", "Mia's gift fund", "12 friends chipped in"],
  ["☕", "Noah paid you", "Coffee run, you owe me nothing"],
  ["🎟️", "Ava paid Kai", "Front row, no regrets"],
  ["🛒", "Groceries", "Split 3 ways · $28.14 each"],
  ["🏖️", "Lisbon trip", "Settled up · 6 people"],
  ["⚽", "5-a-side pitch", "Jordan collected $60"],
  ["🍜", "Ramen night", "Maya paid Alex"],
  ["🎸", "Band practice room", "Split 4 ways"],
  ["🐶", "Dog-sitting", "Thanks for Mochi ❤️"],
];
$$("[data-marquee]").forEach((row, r) => {
  const items = r ? [...POSTS].reverse() : POSTS;
  const html = items.map(([e, t, s]) => `<div class="post"><span class="emo">${e}</span><div><b>${t}</b><small>${s}</small></div></div>`).join("");
  row.innerHTML = html + html; // doubled for a seamless loop
});

onScroll();
setTab(0, "init");
