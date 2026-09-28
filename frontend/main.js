/* =========================================================
   Nexus — landing page motion
   Cinematic hero world, feature scenes,
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
   HERO WORLD
   A dusk sky over a sea of clouds. Someone sits on a flower
   hill with a glowing phone; payments arc through the sky
   as comets to friends standing on distant cloud-islands.
   ========================================================= */
const hero = $("[data-hero]");
const heroContent = $("[data-hero-content]");
const PAD = 40; // canvases overhang the hero so parallax never shows an edge

const world = (() => {
  const cv = {}, ctx = {};
  $$("canvas[data-layer]", hero).forEach((c) => { cv[c.dataset.layer] = c; ctx[c.dataset.layer] = c.getContext("2d"); });
  const layers = $$(".layer", hero);
  const senderSvg = $("[data-sender]");
  const ping = $("[data-ping]");
  const pingAv = $("[data-ping-av]");
  const pingTitle = $("[data-ping-title]");
  const pingNote = $("[data-ping-note]");

  let W, H, dpr, narrow;
  let stars = [], banks = [], tower = null, flowers = [], fgFlowers = [], motes = [], hillPts = [];
  let sparks = [], rings = [], comets = [];
  const friends = {
    left: { nx: 0.15, ny: 0.585, glow: 0 },
    right: { nx: 0.86, ny: 0.565, glow: 0 },
  };
  let senderBase = { x: 0, y: 0 };

  /* ---- cloud bank painter (wraps horizontally) ---- */
  function makeBank(w, h, { clusters, heightMax, shade, alpha = 1, flat = 0.75, towerAt = -1 }) {
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
        g.addColorStop(0.86, `rgba(255,255,255,${a * 0.28})`);
        g.addColorStop(1, "rgba(255,255,255,0)");
        x.fillStyle = g;
        x.beginPath(); x.arc(cx, py, r, 0, Math.PI * 2); x.fill();
      }
    };
    const base = h * flat;
    for (let k = 0; k < clusters; k++) {
      const cx = (k + Math.random() * 0.8) * (w / clusters);
      const cw = rand(0.4, 0.85) * (w / clusters);
      const ch = rand(0.45, 1) * heightMax;
      const n = Math.round(rand(26, 44));
      for (let i = 0; i < n; i++) {
        const dx = gauss() * cw * 0.6;
        const fall = 1 - Math.min(1, Math.abs(dx) / cw);
        const r = rand(0.18, 0.36) * ch * (0.45 + fall);
        puff(cx + dx, base - Math.abs(gauss()) * ch * fall * 0.7 - r * 0.2, r, rand(0.35, 0.7));
      }
    }
    if (towerAt >= 0) {
      // a broad billowing cumulus: wide shoulders, rounded crown
      for (let i = 0; i < 150; i++) {
        const t = Math.pow(Math.random(), 0.8);
        const spread = w * 0.26 * (1.1 - t * 0.55);
        const r = rand(0.09, 0.16) * h * (1.2 - t * 0.5);
        const py = Math.max(r * 1.02, base - t * h * 0.6 + gauss() * 8);
        puff(towerAt * w + gauss() * spread, py, r, rand(0.45, 0.85));
      }
    }
    x.globalCompositeOperation = "source-atop";
    const grd = x.createLinearGradient(0, 0, 0, h);
    shade.forEach(([s, col]) => grd.addColorStop(s, col));
    x.fillStyle = grd; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = "destination-in";
    const fade = x.createLinearGradient(0, 0, 0, h);
    fade.addColorStop(0, "#000"); fade.addColorStop(0.7, "#000"); fade.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = fade; x.fillRect(0, 0, w, h);
    return { canvas: c, w, h, alpha };
  }

  /* ---- the hill the sender sits on (Catmull-Rom through hillPts) ---- */
  function hillY(x) {
    const p = hillPts;
    let i = 0;
    while (i < p.length - 2 && x > p[i + 1][0]) i++;
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    const t = clamp((x - p1[0]) / (p2[0] - p1[0] || 1), 0, 1);
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
  }

  // colour of the hill gradient (#3b3776 → #221f4c → #07060f over .68H..H) at height y
  function hillColorAt(y) {
    const stops = [[0, [59, 55, 118]], [0.35, [34, 31, 76]], [1, [7, 6, 15]]];
    const t = clamp((y - H * 0.68) / (H * 0.32), 0, 1);
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [t0, c0] = stops[i], [t1, c1] = stops[i + 1];
    const k = (t - t0) / (t1 - t0);
    return c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
  }

  const PETALS = ["245,163,199", "255,143,177", "185,164,255", "143,176,255", "255,236,244", "250,196,170"];

  function build() {
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    const r = hero.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    narrow = W < 700;
    for (const k in cv) {
      cv[k].width = (W + PAD * 2) * dpr; cv[k].height = (H + PAD * 2) * dpr;
      ctx[k].setTransform(dpr, 0, 0, dpr, PAD * dpr, PAD * dpr); // draw in hero coordinates
    }
    friends.left.nx = narrow ? 0.12 : 0.15;
    friends.right.nx = narrow ? 0.88 : 0.86;

    // where the sender's robe meets the ground (hero coords, parallax at rest)
    const wrap = senderSvg.parentElement;
    const tf = wrap.style.transform;
    wrap.style.transform = "none";
    const sr = senderSvg.getBoundingClientRect();
    wrap.style.transform = tf;
    senderBase = { x: sr.left - r.left + sr.width * 0.52, y: sr.top - r.top + sr.height * (352 / 360) };

    const by = senderBase.y + 3, bx = senderBase.x;
    hillPts = [
      [-PAD - 10, H * 0.70], [W * 0.14, H * 0.735], [bx - W * 0.2, by - H * 0.005],
      [bx - W * 0.06, by - 2], [bx + W * 0.08, by + 2], [bx + W * 0.26, by + H * 0.04], [W + PAD + 10, by + H * 0.085],
    ];

    stars = Array.from({ length: narrow ? 70 : 150 }, () => ({
      x: Math.random() * W, y: Math.pow(Math.random(), 1.7) * H * 0.45,
      r: rand(0.3, 1.25), p: Math.random() * 6.28, s: rand(0.5, 2.1),
    }));

    tower = makeBank(Math.round(W * (narrow ? 0.9 : 0.62)), Math.round(H * 0.6), {
      clusters: 3, heightMax: H * 0.16, towerAt: 0.42, flat: 0.8,
      shade: [[0, "rgba(255,247,250,.98)"], [0.35, "rgba(250,214,226,.97)"], [0.7, "rgba(206,178,222,.95)"], [1, "rgba(150,140,205,.9)"]],
    });
    banks = [
      { y: 0.575, speed: 3, bank: makeBank(Math.round(W * 1.5), Math.round(H * 0.22), { clusters: narrow ? 5 : 9, heightMax: H * 0.11, alpha: 0.85,
        shade: [[0, "rgba(255,246,240,.95)"], [0.6, "rgba(248,210,208,.9)"], [1, "rgba(214,184,214,.85)"]] }) },
      { y: 0.64, speed: 6, bank: makeBank(Math.round(W * 1.7), Math.round(H * 0.26), { clusters: narrow ? 5 : 10, heightMax: H * 0.13,
        shade: [[0, "rgba(255,236,238,.98)"], [0.45, "rgba(236,196,216,.96)"], [1, "rgba(150,140,205,.95)"]] }) },
      { y: 0.71, speed: 10, bank: makeBank(Math.round(W * 1.9), Math.round(H * 0.26), { clusters: narrow ? 5 : 11, heightMax: H * 0.12,
        shade: [[0, "rgba(246,222,236,1)"], [0.4, "rgba(196,176,222,1)"], [1, "rgba(118,108,178,1)"]] }) },
    ];

    // meadow flowers, denser and larger toward the viewer
    const n = Math.round(clamp((W * H) / 1300, 380, 1300));
    flowers = [];
    for (let i = 0; i < n; i++) {
      const x = rand(-PAD, W + PAD);
      const top = hillY(x);
      const d = Math.pow(Math.random(), 1.35); // 0 = crest, 1 = foreground
      const y = top + 4 + d * (H + PAD - top);
      flowers.push({ x, y, d, r: 0.9 + d * 3.4 + Math.random() * 1.2, c: PETALS[(Math.random() * PETALS.length) | 0], p: Math.random() * 6.28, a: 0.45 + d * 0.5 });
    }
    flowers.sort((a, b) => a.y - b.y);
    // big out-of-focus blossoms right in front of the lens
    fgFlowers = Array.from({ length: narrow ? 14 : 26 }, () => ({
      x: rand(-PAD, W + PAD), y: rand(H * 0.9, H + PAD), r: rand(5, 11), c: PETALS[(Math.random() * PETALS.length) | 0], p: Math.random() * 6.28,
    }));
    // small flowers tucked around the sender so the robe sits *in* the meadow
    for (let i = 0; i < 40; i++) {
      const x = senderBase.x + gauss() * 150;
      fgFlowers.push({ x, y: hillY(x) + rand(2, 22), r: rand(1.4, 3), c: PETALS[(Math.random() * PETALS.length) | 0], p: Math.random() * 6.28, small: true });
    }
    // grass blades in front of the sender so the robe settles into the meadow
    grass = Array.from({ length: narrow ? 160 : 320 }, () => {
      const x = senderBase.x + gauss() * (narrow ? 120 : 210);
      return { x, y: hillY(x) + rand(2, 14), len: rand(7, 20), lean: rand(-0.45, 0.45), p: Math.random() * 6.28 };
    });
    motes = Array.from({ length: narrow ? 22 : 44 }, () => spawnMote(true));
  }
  let grass = [];

  function spawnMote(anywhere) {
    return { x: rand(0, W), y: anywhere ? rand(H * 0.5, H) : H + 10, vy: rand(8, 22), sway: rand(10, 30), p: Math.random() * 6.28, r: rand(0.8, 2.2), life: 0, max: rand(5, 10) };
  }

  /* ---- positions (hero coords) ---- */
  const friendPos = (f) => ({ x: f.nx * W, y: f.ny * H });
  function svgPoint(vx, vy) {
    const hr = hero.getBoundingClientRect(), sr = senderSvg.getBoundingClientRect();
    return { x: sr.left - hr.left + sr.width * (vx / 300), y: sr.top - hr.top + sr.height * (vy / 360) };
  }
  const senderPhone = () => svgPoint(228, 196);
  const senderHead = () => svgPoint(152, 60);

  /* ---- drawing ---- */
  function drawFriend(g, f, t) {
    const { x, y } = friendPos(f);
    const s = H * (narrow ? 0.06 : 0.075);
    // cloud-island under their feet
    const isl = g.createRadialGradient(x, y + s * 0.1, 0, x, y + s * 0.1, s * 1.6);
    isl.addColorStop(0, "rgba(255,236,242,.95)"); isl.addColorStop(0.5, "rgba(236,200,222,.6)"); isl.addColorStop(1, "rgba(236,200,222,0)");
    g.fillStyle = isl;
    g.beginPath(); g.ellipse(x, y + s * 0.12, s * 1.7, s * 0.42, 0, 0, Math.PI * 2); g.fill();
    // silhouette: robe + head
    g.fillStyle = "rgba(58,54,118,.92)";
    g.beginPath();
    g.moveTo(x - s * 0.1, y - s * 0.78);
    g.quadraticCurveTo(x - s * 0.24, y - s * 0.4, x - s * 0.26, y);
    g.lineTo(x + s * 0.26, y);
    g.quadraticCurveTo(x + s * 0.22, y - s * 0.4, x + s * 0.1, y - s * 0.78);
    g.closePath(); g.fill();
    g.beginPath(); g.arc(x, y - s * 0.9, s * 0.13, 0, Math.PI * 2); g.fill();
    // phone glow
    const glow = clamp(0.35 + 0.15 * Math.sin(t * 2 + f.nx * 9) + f.glow, 0, 1);
    const R = s * (0.5 + f.glow * 1.4);
    const gl = g.createRadialGradient(x + s * 0.12, y - s * 0.62, 0, x + s * 0.12, y - s * 0.62, R);
    gl.addColorStop(0, `rgba(240,250,255,${glow})`); gl.addColorStop(1, "rgba(160,200,255,0)");
    g.globalCompositeOperation = "lighter";
    g.fillStyle = gl;
    g.beginPath(); g.arc(x + s * 0.12, y - s * 0.62, R, 0, Math.PI * 2); g.fill();
    g.globalCompositeOperation = "source-over";
    f.glow *= 0.965;
  }

  function drawBack(t) {
    const g = ctx.back;
    g.clearRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    for (const s of stars) {
      const a = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
      g.fillStyle = `rgba(255,255,255,${a * 0.85})`;
      g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.fill();
    }
    // the big cumulus on the left, breathing slowly
    g.drawImage(tower.canvas, -W * 0.06 + Math.sin(t * 0.05) * 18, H * 0.18 + Math.sin(t * 0.07) * 6, tower.w, tower.h);
    banks.forEach((L, i) => {
      const { canvas, w, h, alpha } = L.bank;
      let x = -((t * L.speed) % w) - PAD;
      g.globalAlpha = alpha;
      while (x < W + PAD) { g.drawImage(canvas, x, H * L.y - h * 0.62, w, h); x += w; }
      g.globalAlpha = 1;
      if (i === 1) { drawFriend(g, friends.left, t); drawFriend(g, friends.right, t); }
    });
  }

  function drawMeadow(t) {
    const g = ctx.meadow;
    g.clearRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    g.beginPath();
    g.moveTo(-PAD, H + PAD);
    for (let x = -PAD; x <= W + PAD; x += 8) g.lineTo(x, hillY(x));
    g.lineTo(W + PAD, H + PAD); g.closePath();
    const grd = g.createLinearGradient(0, H * 0.68, 0, H);
    grd.addColorStop(0, "#3b3776"); grd.addColorStop(0.35, "#221f4c"); grd.addColorStop(1, "#07060f");
    g.fillStyle = grd; g.fill();
    // rim light along the crest
    g.save();
    g.beginPath();
    for (let x = -PAD; x <= W + PAD; x += 8) { if (x === -PAD) g.moveTo(x, hillY(x) + 1); else g.lineTo(x, hillY(x) + 1); }
    g.strokeStyle = "rgba(255,206,222,.45)"; g.lineWidth = 2; g.shadowColor = "rgba(255,190,210,.8)"; g.shadowBlur = 12; g.stroke();
    g.restore();
    for (const f of flowers) {
      const fx = f.x + Math.sin(t * 1.1 + f.x * 0.012 + f.p) * (0.6 + f.d * 3.2), fy = f.y;
      if (f.d > 0.25) {
        g.strokeStyle = `rgba(20,18,50,${0.5 * f.a})`; g.lineWidth = 0.6 + f.d;
        g.beginPath(); g.moveTo(f.x, fy + f.r * 3); g.lineTo(fx, fy); g.stroke();
      }
      g.fillStyle = `rgba(${f.c},${0.16 * f.a})`;
      g.beginPath(); g.arc(fx, fy, f.r * 2.3, 0, Math.PI * 2); g.fill();
      g.fillStyle = `rgba(${f.c},${f.a})`;
      g.beginPath(); g.arc(fx, fy, f.r, 0, Math.PI * 2); g.fill();
    }
  }

  function drawFront(t, dt) {
    const g = ctx.front;
    g.clearRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    // a soft strip of meadow over the robe's hem
    const half = narrow ? 150 : 250;
    g.beginPath();
    for (let x = senderBase.x - half; x <= senderBase.x + half; x += 6) {
      const y = hillY(x) - 3 * Math.sin(Math.PI * (x - senderBase.x + half) / (half * 2));
      if (x === senderBase.x - half) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.lineTo(senderBase.x + half, H + PAD); g.lineTo(senderBase.x - half, H + PAD); g.closePath();
    // same colour as the hill at that height, fading out so no seam shows under parallax
    const [cr, cg, cb] = hillColorAt(senderBase.y);
    const hem = g.createLinearGradient(0, senderBase.y - 6, 0, senderBase.y + 44);
    hem.addColorStop(0, `rgba(${cr},${cg},${cb},1)`); hem.addColorStop(0.45, `rgba(${cr},${cg},${cb},.9)`); hem.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    g.fillStyle = hem; g.fill();
    g.strokeStyle = "#2d2a5e"; g.lineWidth = 1.5; g.lineCap = "round";
    for (const b of grass) {
      const sway = Math.sin(t * 1.3 + b.p) * 2.2;
      g.beginPath(); g.moveTo(b.x, b.y);
      g.quadraticCurveTo(b.x + b.lean * b.len * 0.4, b.y - b.len * 0.6, b.x + b.lean * b.len + sway, b.y - b.len);
      g.stroke();
    }
    for (const f of fgFlowers) {
      const fx = f.x + Math.sin(t * 0.9 + f.p) * (f.small ? 1.2 : 5), fy = f.y;
      if (f.small) {
        g.fillStyle = `rgba(${f.c},.22)`; g.beginPath(); g.arc(fx, fy, f.r * 2.3, 0, Math.PI * 2); g.fill();
        g.fillStyle = `rgba(${f.c},.9)`; g.beginPath(); g.arc(fx, fy, f.r, 0, Math.PI * 2); g.fill();
      } else {
        const gr = g.createRadialGradient(fx, fy, 0, fx, fy, f.r * 2.6);
        gr.addColorStop(0, `rgba(${f.c},.75)`); gr.addColorStop(0.45, `rgba(${f.c},.35)`); gr.addColorStop(1, `rgba(${f.c},0)`);
        g.fillStyle = gr; g.beginPath(); g.arc(fx, fy, f.r * 2.6, 0, Math.PI * 2); g.fill();
      }
    }
    // fireflies drifting up from the meadow
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < motes.length; i++) {
      const m = motes[i];
      m.life += dt; m.y -= m.vy * dt;
      const x = m.x + Math.sin(t * 0.8 + m.p) * m.sway;
      const a = Math.sin(Math.PI * clamp(m.life / m.max, 0, 1)) * (0.55 + 0.45 * Math.sin(t * 3 + m.p));
      if (m.life > m.max || m.y < H * 0.35) motes[i] = spawnMote(false);
      const gr = g.createRadialGradient(x, m.y, 0, x, m.y, m.r * 5);
      gr.addColorStop(0, `rgba(255,236,214,${Math.max(0, a)})`); gr.addColorStop(1, "rgba(255,200,180,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, m.y, m.r * 5, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }

  /* ---- payments as comets ---- */
  const SCRIPT = [
    { from: "me", to: "left", av: "M", c: "#f7a8c8", title: "Maya received $40.00", note: "🌸 For the flowers" },
    { from: "right", to: "me", av: "L", c: "#8fb3ff", title: "You received $18.40", note: "🍣 Leo · Sushi Friday" },
    { from: "me", to: "right", av: "L", c: "#8fb3ff", title: "Leo received $12.00", note: "🚕 Half the cab home" },
    { from: "left", to: "me", av: "M", c: "#f7a8c8", title: "You received $25.00", note: "🎂 Maya · Mia's gift fund" },
  ];
  let scriptIdx = 0;
  const posOf = (who) => (who === "me" ? senderPhone() : friendPos(friends[who]));

  function pulseSender() {
    senderSvg.classList.remove("is-sending"); void senderSvg.getBoundingClientRect();
    senderSvg.classList.add("is-sending");
  }
  function launch() {
    const step = SCRIPT[scriptIdx++ % SCRIPT.length];
    const a = posOf(step.from), b = posOf(step.to);
    const peak = Math.min(a.y, b.y) - H * (narrow ? 0.14 : 0.2);
    comets.push({ step, a, b, c: { x: (a.x + b.x) / 2, y: peak }, t0: performance.now(), dur: 2300 });
    if (step.from === "me") pulseSender(); else friends[step.from].glow = 0.9;
  }
  let pingTimer;
  function arrive(cm) {
    const { b, step } = cm;
    for (let i = 0; i < 34; i++) {
      const ang = Math.random() * Math.PI * 2, sp = rand(30, 140);
      sparks.push({ x: b.x, y: b.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 20, life: 0, max: rand(0.6, 1.4), r: rand(0.8, 2.4), hue: Math.random() });
    }
    rings.push({ x: b.x, y: b.y, t: 0 });
    if (step.to === "me") pulseSender(); else friends[step.to].glow = 1.2;
    // glass notification above whoever received it
    // beside the sender (clear of the hero button), or above the friend
    const head = senderHead();
    const at = step.to === "me"
      ? { x: head.x + (narrow ? W * 0.18 : Math.max(200, W * 0.15)), y: head.y + H * 0.08 }
      : { x: b.x, y: b.y - H * (narrow ? 0.07 : 0.09) };
    ping.style.left = clamp(at.x, 130, W - 130) + "px";
    ping.style.top = at.y + "px";
    pingAv.textContent = step.av; pingAv.style.setProperty("--c", step.c);
    pingTitle.textContent = step.title; pingNote.textContent = step.note;
    ping.classList.remove("is-on"); void ping.offsetWidth; ping.classList.add("is-on");
    clearTimeout(pingTimer);
    pingTimer = setTimeout(() => ping.classList.remove("is-on"), 2600);
  }
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const bez = (a, c, b, t) => ({ x: (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * c.x + t * t * b.x, y: (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * c.y + t * t * b.y });

  function drawFx(now, dt) {
    const g = ctx.fx;
    g.clearRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    g.globalCompositeOperation = "lighter";
    comets = comets.filter((cm) => {
      const p = clamp((now - cm.t0) / cm.dur, 0, 1);
      const h = bez(cm.a, cm.c, cm.b, ease(p));
      g.strokeStyle = `rgba(255,236,230,${0.2 * Math.sin(Math.PI * p)})`;
      g.lineWidth = 1; g.setLineDash([2, 6]);
      g.beginPath(); g.moveTo(cm.a.x, cm.a.y); g.quadraticCurveTo(cm.c.x, cm.c.y, cm.b.x, cm.b.y); g.stroke();
      g.setLineDash([]);
      for (let k = 0; k < 3; k++) sparks.push({ x: h.x + gauss() * 3, y: h.y + gauss() * 3, vx: gauss() * 12, vy: gauss() * 12 + 6, life: 0, max: rand(0.5, 1.1), r: rand(0.6, 1.8), hue: Math.random() });
      const gr = g.createRadialGradient(h.x, h.y, 0, h.x, h.y, 26);
      gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.18, "rgba(255,226,210,.9)"); gr.addColorStop(0.5, "rgba(247,168,200,.35)"); gr.addColorStop(1, "rgba(160,170,255,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(h.x, h.y, 26, 0, Math.PI * 2); g.fill();
      if (p >= 1) { arrive(cm); return false; }
      return true;
    });
    sparks = sparks.filter((s) => {
      s.life += dt; if (s.life > s.max) return false;
      s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.96; s.vy = s.vy * 0.96 + 14 * dt;
      const a = 1 - s.life / s.max;
      g.fillStyle = s.hue < 0.5 ? `rgba(255,230,214,${a})` : s.hue < 0.8 ? `rgba(247,168,200,${a})` : `rgba(185,196,255,${a})`;
      g.beginPath(); g.arc(s.x, s.y, s.r * (0.5 + a * 0.5), 0, Math.PI * 2); g.fill();
      return true;
    });
    rings = rings.filter((r) => {
      r.t += dt; if (r.t > 1) return false;
      g.strokeStyle = `rgba(255,236,240,${(1 - r.t) * 0.8})`; g.lineWidth = 1.5;
      g.beginPath(); g.arc(r.x, r.y, 8 + r.t * 46, 0, Math.PI * 2); g.stroke();
      return true;
    });
    g.globalCompositeOperation = "source-over";
  }

  /* ---- parallax (mouse + scroll) ---- */
  const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = ((e.clientY - r.top) / r.height) * 2 - 1;
  });
  hero.addEventListener("pointerleave", () => { mouse.x = 0; mouse.y = 0; });
  function applyParallax() {
    mouse.sx += (mouse.x - mouse.sx) * 0.05;
    mouse.sy += (mouse.y - mouse.sy) * 0.05;
    const sy = Math.min(scrollY, H);
    for (const el of layers) {
      const d = +el.dataset.depth || 0;
      el.style.transform = `translate3d(${(-mouse.sx * d * 520).toFixed(2)}px, ${(-mouse.sy * d * 260 + sy * (0.45 - d * 5)).toFixed(2)}px, 0)`;
    }
  }

  /* ---- loop ---- */
  let running = true, raf, last = performance.now(), nextLaunch = performance.now() + 2200;
  const t0 = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000;
    if (!reduced) applyParallax();
    drawBack(t);
    drawMeadow(t);
    drawFront(t, reduced ? 0 : dt);
    drawFx(now, dt);
    if (!reduced && now >= nextLaunch && !document.hidden) { launch(); nextLaunch = now + 3700; }
    if (running && !reduced) raf = requestAnimationFrame(frame);
  }

  build();
  frame(performance.now());
  let rt;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { build(); if (reduced) frame(performance.now()); }, 180); });
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
