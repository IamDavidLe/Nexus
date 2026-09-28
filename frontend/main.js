/* =========================================================
   Nexus — landing page motion
   Hero payment network, feature scenes,
   scroll-scrubbed statement. No dependencies.
   ========================================================= */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5; // ~[-1,1]
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Word splitting ---------- */
$$(".hero__title .hw").forEach((w, i) => w.style.setProperty("--i", i));

function splitWords(el, cls, mask = false) {
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
          if (mask) { const m = document.createElement("span"); m.className = "wdm"; m.appendChild(s); frag.appendChild(m); }
          else frag.appendChild(s);
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
$$("[data-words]").forEach((el) => splitWords(el, "wd", true));

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
   HERO NETWORK
   Friends float above a glowing horizon. Payments streak
   between them and "home", the Nexus hub rising on it.
   ========================================================= */
const hero = $("[data-hero]");
const heroContent = $("[data-hero-content]");

(() => {
  const cv = $("[data-hero-canvas]", hero);
  const g = cv.getContext("2d");
  const hubEl = $("[data-hub]", hero);
  const nodeEls = $$("[data-node]", hero);
  const ping = $("[data-ping]");
  const pingAv = $("[data-ping-av]");
  const pingTitle = $("[data-ping-title]");
  const pingNote = $("[data-ping-note]");

  let W, H, dpr, narrow;
  let hub = { x: 0, y: 0, bx: 0, by: 0 }, nodes = {}, live = [], stars = [], motes = [];
  let comets = [], sparks = [], rings = [];
  const mouse = { x: 0, y: 0, sx: 0, sy: 0, px: -999, py: -999, inside: false };

  const spawnMote = (anywhere) => ({
    x: hub.bx + gauss() * W * 0.34, y: anywhere ? rand(H * 0.45, hub.by) : hub.by - rand(0, 12),
    vy: rand(8, 26), sway: rand(6, 22), p: Math.random() * 6.28, r: rand(0.6, 1.8), life: 0, max: rand(4, 9),
  });

  function build() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    const r = hero.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    narrow = W < 700;
    cv.width = W * dpr; cv.height = H * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // resting centres come straight from the CSS left/top (the elements are centred on them)
    const at = (el) => { const cs = getComputedStyle(el); return { bx: parseFloat(cs.left), by: parseFloat(cs.top) }; };
    Object.assign(hub, at(hubEl));
    nodes = {};
    for (const el of nodeEls) {
      if (!el.offsetParent) continue; // hidden at this width
      nodes[el.dataset.node] = { el, ...at(el), x: 0, y: 0, d: +el.dataset.depth || 0.5, c: el.style.getPropertyValue("--c"), heat: 0 };
    }
    live = Object.keys(nodes);
    stars = Array.from({ length: narrow ? 70 : 150 }, () => ({
      x: Math.random() * W, y: Math.pow(Math.random(), 1.4) * H * 0.8,
      r: rand(0.3, 1.2), p: Math.random() * 6.28, s: rand(0.4, 1.8), d: rand(0.05, 0.3),
    }));
    motes = Array.from({ length: narrow ? 18 : 36 }, () => spawnMote(true));
    place();
  }

  /* ---- parallax: move each friend by its depth, keep the canvas in sync ---- */
  function place() {
    for (const k of live) {
      const n = nodes[k];
      const ox = -mouse.sx * n.d * 36, oy = -mouse.sy * n.d * 22;
      n.x = n.bx + ox; n.y = n.by + oy;
      n.el.style.transform = `translate3d(${ox.toFixed(2)}px, ${oy.toFixed(2)}px, 0)`;
    }
    hub.x = hub.bx; hub.y = hub.by;
  }

  // every friend is wired to home along a curve that hugs the edges and glides in over the horizon
  const ctrl = (n) => ({ x: n.x + (hub.x - n.x) * 0.1, y: hub.y - (hub.y - n.y) * 0.08 });
  const bez = (a, c, b, t) => ({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  function drawSky(t) {
    for (const s of stars) {
      const a = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
      g.fillStyle = `rgba(226,236,255,${a * 0.7})`;
      g.beginPath(); g.arc(s.x - mouse.sx * s.d * 30, s.y - mouse.sy * s.d * 18, s.r, 0, Math.PI * 2); g.fill();
    }
  }

  function drawLinks(t) {
    g.lineWidth = 1;
    g.setLineDash([2, 7]);
    g.lineDashOffset = -t * 16;
    for (const k of live) {
      const n = nodes[k], c = ctrl(n);
      n.heat *= Math.pow(0.97, frameDt * 60);
      const grd = g.createLinearGradient(n.x, n.y, hub.x, hub.y);
      grd.addColorStop(0, `rgba(191,219,254,${0.16 + n.heat * 0.5})`);
      grd.addColorStop(1, `rgba(147,197,253,${0.05 + n.heat * 0.3})`);
      g.strokeStyle = grd;
      g.beginPath(); g.moveTo(n.x, n.y); g.quadraticCurveTo(c.x, c.y, hub.x, hub.y); g.stroke();
    }
    g.setLineDash([]);
  }

  function drawMotes(dt) {
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.life += dt; m.y -= m.vy * dt;
      const x = m.x + Math.sin(m.life * 0.8 + m.p) * m.sway;
      const a = Math.sin(Math.PI * clamp(m.life / m.max, 0, 1)) * 0.8;
      if (m.life > m.max) motes[i] = spawnMote(false);
      g.fillStyle = `rgba(191,219,254,${Math.max(0, a)})`;
      g.beginPath(); g.arc(x, m.y, m.r, 0, Math.PI * 2); g.fill();
    }
  }

  /* ---- payments ---- */
  const SCRIPT = [
    { who: "maya", out: true, av: "M", title: "Maya received $40.00", note: "🌸 For the flowers" },
    { who: "leo", out: false, av: "L", title: "Leo paid you $18.40", note: "🍣 Sushi Friday" },
    { who: "priya", out: true, av: "P", title: "Priya received $12.00", note: "🚕 Half the cab home" },
    { who: "jordan", out: false, av: "J", title: "Jordan paid you $15.00", note: "🎬 Dune: Part Three" },
    { who: "sam", out: true, av: "S", title: "Sam received $31.25", note: "🏠 Utilities · Oct" },
    { who: "noah", out: false, av: "N", title: "Noah paid you $22.00", note: "🎂 Mia's gift fund" },
  ];
  let scriptIdx = 0;

  function hit(el) { el.classList.remove("is-hit"); void el.offsetWidth; el.classList.add("is-hit"); }

  function launch() {
    let step, tries = 0;
    do { step = SCRIPT[scriptIdx++ % SCRIPT.length]; } while (!nodes[step.who] && ++tries < SCRIPT.length);
    const n = nodes[step.who];
    if (!n) return;
    comets.push({ step, n, t0: performance.now(), dur: 1900, big: true });
    n.heat = 1;
    if (step.out) hit(hubEl); else hit(n.el);
  }
  // quieter traffic between neighbours on the same side, so the network always feels alive
  function chatter() {
    const left = live.filter((k) => nodes[k].bx < W / 2), right = live.filter((k) => nodes[k].bx >= W / 2);
    const side = Math.random() < 0.5 ? left : right;
    if (side.length < 2) return;
    const i = (Math.random() * side.length) | 0;
    let j = (Math.random() * (side.length - 1)) | 0; if (j >= i) j++;
    comets.push({ from: nodes[side[i]], to: nodes[side[j]], t0: performance.now(), dur: 1500 });
  }

  function cometPath(cm) {
    if (cm.n) { // along the node ↔ hub link
      const c = ctrl(cm.n);
      return cm.step.out ? [hub, c, cm.n] : [cm.n, c, hub];
    }
    const a = cm.from || hub, b = cm.to;
    const mid = { x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) - Math.abs(a.y - b.y) * 0.3 - 40 };
    return [a, mid, b];
  }

  let pingTimer;
  function arrive(cm, b) {
    const n = cm.big ? 30 : 12;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2, sp = rand(20, cm.big ? 130 : 60);
      sparks.push({ x: b.x, y: b.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 20, life: 0, max: rand(0.5, 1.2), r: rand(0.7, 2.2), hue: Math.random() });
    }
    rings.push({ x: b.x, y: b.y, t: 0, big: !!cm.big });
    if (cm.to && cm.to.el) hit(cm.to.el);
    if (!cm.step) return;
    const { step, n: node } = cm;
    let x, y;
    if (step.out) { hit(node.el); x = node.x; y = node.y - 40 * (+getComputedStyle(node.el).getPropertyValue("--s") || 1) - 4; }
    else { hit(hubEl); x = hub.x; y = hub.y - (narrow ? 58 : 64); }
    ping.style.left = clamp(x, narrow ? 120 : 150, W - (narrow ? 120 : 150)) + "px";
    ping.style.top = y + "px";
    pingAv.textContent = step.av; pingAv.style.setProperty("--c", node.c);
    pingTitle.textContent = step.title; pingNote.textContent = step.note;
    ping.classList.remove("is-on"); void ping.offsetWidth; ping.classList.add("is-on");
    clearTimeout(pingTimer);
    pingTimer = setTimeout(() => ping.classList.remove("is-on"), 2300);
  }

  function drawComets(now, dt) {
    g.globalCompositeOperation = "lighter";
    if (mouse.inside && !narrow) {
      const cg = g.createRadialGradient(mouse.px, mouse.py, 0, mouse.px, mouse.py, 180);
      cg.addColorStop(0, "rgba(96,165,250,.12)"); cg.addColorStop(1, "rgba(96,165,250,0)");
      g.fillStyle = cg; g.beginPath(); g.arc(mouse.px, mouse.py, 180, 0, Math.PI * 2); g.fill();
    }
    g.lineCap = "round";
    comets = comets.filter((cm) => {
      const [a, c, b] = cometPath(cm);
      const raw = clamp((now - cm.t0) / cm.dur, 0, 1), p = ease(raw);
      const big = !!cm.big, fade = Math.min(1, raw * 6);
      // tapered, fading trail
      const SEG = 22, len = big ? 0.3 : 0.22;
      let prev = bez(a, c, b, p);
      for (let k = 1; k <= SEG; k++) {
        const q = Math.max(0, p - (k / SEG) * len), pt = bez(a, c, b, q), f = 1 - k / SEG;
        g.strokeStyle = `rgba(${f > 0.6 ? "226,238,255" : "96,165,250"},${f * (big ? 0.85 : 0.45) * fade})`;
        g.lineWidth = f * (big ? 3.6 : 2) + 0.3;
        g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(pt.x, pt.y); g.stroke();
        prev = pt;
      }
      const h = bez(a, c, b, p), R = big ? 24 : 12;
      const gr = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, R);
      gr.addColorStop(0, `rgba(255,255,255,${fade})`); gr.addColorStop(0.2, `rgba(219,234,254,${0.9 * fade})`); gr.addColorStop(0.55, "rgba(96,165,250,.35)"); gr.addColorStop(1, "rgba(59,130,246,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(h.x, h.y, R, 0, Math.PI * 2); g.fill();
      if (big && Math.random() < 0.7) sparks.push({ x: h.x + gauss() * 3, y: h.y + gauss() * 3, vx: gauss() * 10, vy: gauss() * 10 + 8, life: 0, max: rand(0.4, 0.9), r: rand(0.5, 1.5), hue: Math.random() });
      if (raw >= 1) { arrive(cm, b); return false; }
      return true;
    });
    sparks = sparks.filter((s) => {
      s.life += dt; if (s.life > s.max) return false;
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.95; s.vy = s.vy * 0.95 + 16 * dt;
      const a = 1 - s.life / s.max;
      g.fillStyle = s.hue < 0.5 ? `rgba(255,255,255,${a})` : s.hue < 0.8 ? `rgba(147,197,253,${a})` : `rgba(96,165,250,${a})`;
      g.beginPath(); g.arc(s.x, s.y, s.r * (0.5 + a * 0.5), 0, Math.PI * 2); g.fill();
      return true;
    });
    rings = rings.filter((r) => {
      r.t += dt * (r.big ? 0.9 : 1.3); if (r.t > 1) return false;
      g.strokeStyle = `rgba(191,219,254,${(1 - r.t) * 0.8})`; g.lineWidth = 1.2;
      g.beginPath(); g.arc(r.x, r.y, 6 + ease(r.t) * (r.big ? 54 : 30), 0, Math.PI * 2); g.stroke();
      return true;
    });
    g.globalCompositeOperation = "source-over";
  }

  /* ---- input ---- */
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = ((e.clientY - r.top) / r.height) * 2 - 1;
    mouse.px = e.clientX - r.left; mouse.py = e.clientY - r.top; mouse.inside = true;
  });
  hero.addEventListener("pointerleave", () => { mouse.x = 0; mouse.y = 0; mouse.inside = false; });
  // click the sky to send a spark from home
  hero.addEventListener("click", (e) => {
    if (reduced || e.target.closest("a, button") || comets.length > 8) return;
    const r = hero.getBoundingClientRect();
    comets.push({ to: { x: e.clientX - r.left, y: e.clientY - r.top }, t0: performance.now(), dur: 1000 });
    hit(hubEl);
  });

  /* ---- loop ---- */
  let running = true, raf, last = performance.now(), frameDt = 0;
  let nextLaunch = performance.now() + 2000, nextChatter = performance.now() + 2600;
  const t0 = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    frameDt = reduced ? 0 : dt;
    const t = reduced ? 0 : (now - t0) / 1000;
    mouse.sx += (mouse.x - mouse.sx) * 0.06;
    mouse.sy += (mouse.y - mouse.sy) * 0.06;
    place();
    g.clearRect(0, 0, W, H);
    drawSky(t);
    drawLinks(t);
    drawMotes(frameDt);
    drawComets(now, frameDt);
    if (!reduced && !document.hidden) {
      if (now >= nextLaunch) { launch(); nextLaunch = now + 2900; }
      if (now >= nextChatter) { chatter(); nextChatter = now + rand(900, 1700); }
    }
    if (running && !reduced) raf = requestAnimationFrame(frame);
  }

  build();
  frame(performance.now());
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { build(); if (reduced) frame(performance.now()); }, 150); });
  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    cancelAnimationFrame(raf);
    if (running && !reduced) { last = performance.now(); raf = requestAnimationFrame(frame); }
  }).observe(hero);
})();

/* ---------- Scroll: hero copy, nav, statement ---------- */
function onScroll() {
  const y = scrollY;
  nav.classList.toggle("is-scrolled", y > 60);
  if (!menu.classList.contains("is-open")) nav.classList.toggle("is-hidden", y > lastY && y > 700);
  lastY = y;
  if (y < innerHeight * 1.4 && !reduced) {
    heroContent.style.transform = `translateY(${y * 0.35}px)`;
    heroContent.style.opacity = String(clamp(1 - y / 560, 0, 1));
  }
  scrubStatement();
}
let lastY = scrollY, ticking = false;
addEventListener("scroll", () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { onScroll(); ticking = false; });
}, { passive: true });

/* ---------- Statement: scroll-scrubbed words ---------- */
const scrubEl = $("[data-scrub]");
const scrubWords = scrubEl ? splitWords(scrubEl, "sw") : [];
function scrubStatement() {
  if (!scrubEl) return;
  const r = scrubEl.getBoundingClientRect();
  const p = clamp((innerHeight * 0.82 - r.top) / (innerHeight * 0.55), 0, 1);
  const lit = reduced ? scrubWords.length : Math.round(p * scrubWords.length);
  scrubWords.forEach((w, i) => w.classList.toggle("lit", i < lit));
}

/* =========================================================
   TRANSACTION POP-UP (phone activity + community feed)
   ========================================================= */
const fmt = (cents) => `$${Math.floor(Math.abs(cents) / 100).toLocaleString("en-US")}.${String(Math.abs(cents) % 100).padStart(2, "0")}`;
const hex4 = () => Math.random().toString(16).slice(2, 6).toUpperCase().padEnd(4, "0");
const txm = $("[data-txm]");
const txmCard = $(".txm__card", txm);
const txmF = {
  av: $("[data-txm-av]"), label: $("[data-txm-label]"), amt: $("[data-txm-amt]"), note: $("[data-txm-note]"),
  when: $("[data-txm-when]"), id: $("[data-txm-id]"), sparks: $("[data-txm-sparks]"),
};
let txmReturn = null, txmAnim = 0;

function openTx(tx, originEl) {
  txmReturn = originEl || document.activeElement;
  // the card grows out of whatever was clicked
  if (originEl) {
    const r = originEl.getBoundingClientRect();
    txmCard.style.setProperty("--fx", `${Math.round(r.left + r.width / 2 - innerWidth / 2)}px`);
    txmCard.style.setProperty("--fy", `${Math.round(r.top + r.height / 2 - innerHeight / 2)}px`);
  }
  txmF.av.textContent = tx.av; txmF.av.style.setProperty("--c", tx.c);
  txmF.label.textContent = tx.label; txmF.note.textContent = tx.note; txmF.when.textContent = tx.when;
  txmF.id.textContent = tx.id || (tx.id = `NX-${hex4()}-${hex4()}`);
  const sign = tx.signed ? (tx.amt > 0 ? "+" : "−") : "";
  cancelAnimationFrame(txmAnim);
  const start = performance.now(), target = Math.abs(tx.amt), dur = reduced ? 1 : 900;
  const count = (now) => {
    const p = clamp((now - start) / dur, 0, 1);
    txmF.amt.textContent = sign + fmt(Math.round(target * (1 - Math.pow(1 - p, 3))));
    if (p < 1) txmAnim = requestAnimationFrame(count);
  };
  txmAnim = requestAnimationFrame(count);
  txmF.sparks.innerHTML = Array.from({ length: 16 }, (_, i) => {
    const a = (i / 16) * Math.PI * 2 + Math.random() * 0.3, d = 70 + Math.random() * 60;
    return `<i style="--sx:${(Math.cos(a) * d).toFixed(1)}px;--sy:${(Math.sin(a) * d).toFixed(1)}px;--c:${i % 2 ? "#ffffff" : "#93c5fd"}"></i>`;
  }).join("");
  txm.classList.remove("is-open"); void txmCard.offsetWidth;
  txm.classList.add("is-open");
  txm.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  setTimeout(() => $(".txm__x", txm).focus({ preventScroll: true }), 80);
}
function closeTx() {
  if (!txm.classList.contains("is-open")) return;
  txm.classList.remove("is-open");
  txm.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  if (txmReturn && txmReturn.isConnected) txmReturn.focus({ preventScroll: true });
}
$$("[data-txm-close]", txm).forEach((b) => b.addEventListener("click", closeTx));
addEventListener("keydown", (e) => {
  if (!txm.classList.contains("is-open")) return;
  if (e.key === "Escape") closeTx();
  if (e.key === "Tab") { // keep focus inside the dialog
    const f = $$("button", txmCard);
    const i = f.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
  }
});
function ripple(btn, e) {
  const r = btn.getBoundingClientRect();
  const s = document.createElement("span");
  s.className = "tx__ripple";
  s.style.left = `${(e.clientX || r.left + r.width / 2) - r.left}px`;
  s.style.top = `${(e.clientY || r.top + r.height / 2) - r.top}px`;
  btn.appendChild(s);
  setTimeout(() => s.remove(), 650);
}

/* =========================================================
   LIVE PHONE (2nd slide): payments arrive, balance ticks,
   every row opens the pop-up
   ========================================================= */
const FEED = [
  { n: "Maya", c: "#bfdbfe", note: "🍣 Sushi Friday", amt: 1840 },
  { n: "Leo", c: "#93c5fd", note: "🚕 Airport cab", amt: -1200 },
  { n: "Priya", c: "#7dd3fc", note: "🎂 Mia's gift fund", amt: -2000 },
  { n: "Sam", c: "#dbeafe", note: "🍕 Pizza night", amt: 950 },
  { n: "Jordan", c: "#a5b4fc", note: "🎬 Movie tickets", amt: -1500 },
  { n: "Noah", c: "#60a5fa", note: "⚽ 5-a-side pitch", amt: 600 },
  { n: "Ava", c: "#c7d2fe", note: "🛒 Groceries", amt: -2375 },
  { n: "Kai", c: "#e0f2fe", note: "🏖️ Lisbon Airbnb", amt: 8200 },
];
const TIMES = ["Today, 6:48 PM", "Today, 5:12 PM", "Today, 1:30 PM", "Today, 9:05 AM", "Yesterday, 8:14 PM"];
const list = $("[data-activity]");
const balEl = $("[data-balance]");
let balance = 248016; // integer cents
let feedIdx = 0;
function feedItem(f, when, isNew) {
  const tx = { av: f.n[0], c: f.c, label: f.amt > 0 ? `${f.n} paid you` : `You paid ${f.n}`, note: f.note, amt: f.amt, when, signed: true };
  const li = document.createElement("li");
  if (isNew) li.className = "is-new";
  li.innerHTML = `<button class="tx" type="button" aria-label="${tx.label} ${fmt(f.amt)}, ${f.note}"><span class="av" style="--c:${f.c}">${f.n[0]}</span><div><b>${f.n}</b><small>${f.note}</small></div><em class="${f.amt > 0 ? "plus" : ""}">${f.amt > 0 ? "+" : "−"}${fmt(f.amt)}</em></button>`;
  const btn = li.firstElementChild;
  btn.addEventListener("click", (e) => { ripple(btn, e); setTimeout(() => openTx(tx, btn), reduced ? 0 : 160); });
  return li;
}
function tweenBalance(to) {
  const from = balance, start = performance.now(), dur = reduced ? 1 : 900;
  balance = to;
  const step = (now) => {
    const p = clamp((now - start) / dur, 0, 1);
    balEl.textContent = fmt(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
if (list) {
  for (let i = 0; i < 5; i++) list.appendChild(feedItem(FEED[(feedIdx++) % FEED.length], TIMES[i], false));
  let phoneVisible = false;
  new IntersectionObserver(([e]) => (phoneVisible = e.isIntersecting), { threshold: 0.2 }).observe(list);
  setInterval(() => {
    if (document.hidden || !phoneVisible || txm.classList.contains("is-open")) return;
    const f = FEED[(feedIdx++) % FEED.length];
    $$("li", list).forEach((li) => li.classList.remove("is-new"));
    list.prepend(feedItem(f, "Just now", true));
    while (list.children.length > 5) list.lastChild.remove();
    tweenBalance(balance + f.amt);
  }, 3400);
}

// floating notifications beside the phone take turns
(() => {
  const toasts = $$("[data-toast]");
  if (!toasts.length) return;
  if (reduced) { toasts.forEach((t) => t.classList.add("is-on")); return; }
  let k = 0;
  const cycle = () => {
    const t = toasts[k++ % toasts.length];
    t.classList.add("is-on");
    setTimeout(() => t.classList.remove("is-on"), 3600);
  };
  setTimeout(() => { cycle(); setInterval(cycle, 2300); }, 1200);
})();

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
  ["🍕", "Sam paid Priya", "Friday pizza, the good one", 2400],
  ["🚕", "You & Leo", "Airport cab at 5am", -1450],
  ["🏠", "Rent · 4 roommates", "Split evenly · $612.50 each", -61250],
  ["🎂", "Mia's gift fund", "12 friends chipped in", -2000],
  ["☕", "Noah paid you", "Coffee run, you owe me nothing", 540],
  ["🎟️", "Ava paid Kai", "Front row, no regrets", 8900],
  ["🛒", "Groceries", "Split 3 ways · $28.14 each", -2814],
  ["🏖️", "Lisbon trip", "Settled up · 6 people", -18400],
  ["⚽", "5-a-side pitch", "Jordan collected $60", -1000],
  ["🍜", "Ramen night", "Maya paid Alex", 3200],
  ["🎸", "Band practice room", "Split 4 ways", -1500],
  ["🐶", "Dog-sitting", "Thanks for Mochi ❤️", 4000],
];
const POST_TIMES = ["2h ago", "Yesterday", "3 days ago", "Last week"];
const POST_COLORS = ["#bfdbfe", "#93c5fd", "#7dd3fc", "#a5b4fc", "#dbeafe", "#60a5fa"];
$$("[data-marquee]").forEach((row, r) => {
  const order = POSTS.map((_, i) => i);
  if (r) order.reverse();
  const card = (i, hidden) => {
    const [e, t, sub] = POSTS[i];
    return `<button class="post" type="button" data-post="${i}"${hidden ? ' tabindex="-1" aria-hidden="true"' : ""}><span class="emo">${e}</span><div><b>${t}</b><small>${sub}</small></div></button>`;
  };
  // doubled for a seamless loop; the second copy is hidden from keyboard/screen readers
  row.innerHTML = order.map((i) => card(i, false)).join("") + order.map((i) => card(i, true)).join("");
  row.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-post]");
    if (!b) return;
    const i = +b.dataset.post;
    const [e, t, sub, amt] = POSTS[i];
    openTx({ av: t[0], c: POST_COLORS[i % POST_COLORS.length], label: t, note: `${e} ${sub}`, amt, when: POST_TIMES[i % POST_TIMES.length], signed: /\byou\b/i.test(t) }, b);
  });
});

/* ---------- Footer wordmark: letters rise in ---------- */
const footWord = $(".footer__word");
if (footWord) {
  footWord.innerHTML = [...footWord.textContent.trim()].map((ch, i) => `<span class="fl" style="--i:${i}">${ch}</span>`).join("");
  io.observe(footWord);
}

onScroll();
setTab(0, "init");
