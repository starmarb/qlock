// qlock: the time and date as the state of two qubits.
//
// time qubit |t⟩: hour (plus minutes) -> θ,  minute -> φ
// date qubit |d⟩: month (plus days)   -> θ,  day    -> φ
//
// |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩
// Midnight and 1 January are both |0⟩, the north pole.

// ---------------------------------------------------------------------------
// Clock source. Add ?at=2026-12-31T23:59 to the URL to start from another
// moment (handy for testing); ?theme=dark or ?theme=light forces a theme.

const params = new URLSearchParams(location.search);
let clockOffset = 0;
if (params.get("at")) {
  const d = new Date(params.get("at"));
  if (!isNaN(d)) clockOffset = d.getTime() - Date.now();
}
if (params.get("theme") === "dark" || params.get("theme") === "light") {
  document.documentElement.dataset.theme = params.get("theme");
}
const now = () => new Date(Date.now() + clockOffset);

const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

function gcd(a, b) { return b ? gcd(b, a % b) : Math.abs(a); }

// An angle stored as an exact fraction of π: { n, d, value }.
function piFrac(n, d) {
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g, value: (Math.PI * n) / d };
}
function fracText(f) {
  if (f.n === 0) return "0";
  const top = f.n === 1 ? "π" : `${f.n}π`;
  return f.d === 1 ? top : `${top}/${f.d}`;
}
function fracTex(f) {
  if (f.n === 0) return "0";
  const top = f.n === 1 ? "\\pi" : `${f.n}\\pi`;
  return f.d === 1 ? top : `${top}/${f.d}`;
}

function readClock() {
  const t = now();
  const h = t.getHours(), m = t.getMinutes();
  const M = t.getMonth() + 1, D = t.getDate();
  const days = new Date(t.getFullYear(), M, 0).getDate();
  return {
    key: `${t.getFullYear()}-${M}-${D} ${h}:${m}`,
    h, m, M, D, days,
    // time: θ = (hour + minute/60)/24 · π,   φ = minute/60 · 2π
    timeTheta: piFrac(60 * h + m, 1440),
    timePhi: piFrac(2 * m, 60),
    // date: θ = (month − 1 + (day − 1)/days)/12 · π,   φ = (day − 1)/days · 2π
    dateTheta: piFrac((M - 1) * days + (D - 1), 12 * days),
    datePhi: piFrac(2 * (D - 1), days),
  };
}

// ---------------------------------------------------------------------------
// Theme colours, read from the CSS custom properties.

let colors = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name) => cs.getPropertyValue(name).trim();
  colors = { ink: v("--ink"), muted: v("--muted"), rule: v("--rule"), date: v("--date") };
}
readColors();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);

// ---------------------------------------------------------------------------
// p5 sketch: the Bloch sphere.

let R = 100;
let cam;
let lastKey = "";
let state;      // read every frame
let pageState;  // the state the page text and circuit were last built from

function sphereSize() {
  const host = document.getElementById("qlock");
  return Math.max(240, Math.min(400, host.clientWidth));
}

function setup() {
  const s = sphereSize();
  const c = createCanvas(s, s, WEBGL);
  c.parent("qlock");
  setAttributes("antialias", true);
  pixelDensity(Math.min(2, window.devicePixelRatio || 1));
  R = s * 0.4;
  cam = createCamera();
  c.elt.addEventListener("dblclick", () => cam.camera());
}

function windowResized() {
  const s = sphereSize();
  resizeCanvas(s, s);
  R = s * 0.4;
}

function ring(fn) {
  beginShape();
  for (let a = 0; a < TWO_PI; a += 0.05) fn(a);
  endShape(CLOSE);
}

function hand(theta, phi, col) {
  const x = R * sin(theta) * cos(phi);
  const y = R * sin(theta) * sin(phi);
  const z = R * cos(theta);
  stroke(col);
  strokeWeight(2.5);
  line(0, 0, 0, x, y, z);
  push();
  translate(x, y, z);
  noStroke();
  fill(col);
  sphere(R * 0.035, 12, 8);
  pop();
}

function draw() {
  clear();
  orbitControl(1, 1, 0); // rotate only; leave the scroll wheel to the page

  state = readClock();
  if (state.key !== lastKey) {
    lastKey = state.key;
    updatePage(state);
  }

  noFill();

  // faint sphere
  const shell = color(colors.ink);
  shell.setAlpha(9);
  stroke(shell);
  strokeWeight(1);
  sphere(R, 24, 18);

  // great circles: xy (the clock face), xz, yz
  stroke(colors.rule);
  strokeWeight(1);
  ring((a) => vertex(R * cos(a), R * sin(a), 0));
  ring((a) => vertex(R * cos(a), 0, R * sin(a)));
  ring((a) => vertex(0, R * cos(a), R * sin(a)));

  // poles: |0⟩ (midnight, 1 January) and |1⟩
  strokeWeight(7);
  stroke(colors.ink);
  point(0, 0, R);
  stroke(colors.muted);
  point(0, 0, -R);
  strokeWeight(4);
  stroke(colors.ink);
  point(0, 0, 0);

  hand(state.dateTheta.value, state.datePhi.value, colors.date);
  hand(state.timeTheta.value, state.timePhi.value, colors.ink);
}

// ---------------------------------------------------------------------------
// Page text: readout and Dirac notation.

const KATEX_OPTS = {
  throwOnError: false,
  strict: false,
  trust: (ctx) => ctx.command === "\\htmlClass",
  macros: { "\\ket": "\\lvert #1\\rangle" },
};
function tex(el, src, display = false) {
  if (window.katex) katex.render(src, el, { ...KATEX_OPTS, displayMode: display });
  else el.textContent = src;
}

function num(x) {
  const r = Math.abs(x) < 0.005 ? 0 : x;
  return r.toFixed(2);
}
function amplitudes(theta, phi) {
  const a = Math.cos(theta / 2);
  const re = Math.cos(phi) * Math.sin(theta / 2);
  const im = Math.sin(phi) * Math.sin(theta / 2);
  const imAbs = Math.abs(im) < 0.005 ? 0 : im;
  const sign = imAbs < 0 ? "-" : "+";
  return `${num(a)}\\,\\ket{0} + (${num(re)} ${sign} ${num(Math.abs(imAbs))}i)\\,\\ket{1}`;
}

function pad(n) { return String(n).padStart(2, "0"); }

function updatePage(s) {
  document.getElementById("time-value").textContent = `${pad(s.h)}:${pad(s.m)}`;
  document.getElementById("date-value").textContent = `${s.D} ${MONTHS[s.M - 1]}`;
  tex(document.getElementById("time-angles"),
    `\\theta = ${fracTex(s.timeTheta)},\\;\\; \\phi = ${fracTex(s.timePhi)}`);
  tex(document.getElementById("date-angles"),
    `\\theta = ${fracTex(s.dateTheta)},\\;\\; \\phi = ${fracTex(s.datePhi)}`);

  tex(document.getElementById("psi-inline"), "\\ket{\\psi}");
  const d = "\\htmlClass{date-ket}{\\ket{d}}";
  tex(document.getElementById("state-math"),
    "\\begin{aligned}" +
      `\\ket{\\psi} &= \\ket{t} \\otimes ${d} \\\\[4pt]` +
      `\\ket{t} &= ${amplitudes(s.timeTheta.value, s.timePhi.value)} \\\\[2pt]` +
      `${d} &= ${amplitudes(s.dateTheta.value, s.datePhi.value)}` +
    "\\end{aligned}", true);

  // the discrete-gate search only needs to run when the state changes
  s.htTime = cliffordT(s.timeTheta.value, s.timePhi.value);
  s.htDate = cliffordT(s.dateTheta.value, s.datePhi.value);
  pageState = s;
  renderCircuit(s);
}

// ---------------------------------------------------------------------------
// Clifford + T search.
//
// Every sequence of H and T gates can be written as H T^k1 H T^k2 H ... with
// k in 1..7 (T^8 = I, and a leading T only adds a phase to |0⟩). We walk all
// such sequences up to MAX_H Hadamards and keep the cheapest one whose
// fidelity |⟨target|ψ⟩|² reaches TARGET_F, or the most faithful one otherwise.

const MAX_H = 7;
const TARGET_F = 0.999;
// T^k written with the usual named gates, and how many gates that costs
const T_POWER = [[], ["T"], ["S"], ["S", "T"], ["Z"], ["Z", "T"], ["S†"], ["T†"]];

function cliffordT(theta, phi) {
  const s2 = Math.SQRT1_2;
  const t0 = Math.cos(theta / 2);
  const t1r = Math.cos(phi) * Math.sin(theta / 2);
  const t1i = Math.sin(phi) * Math.sin(theta / 2);
  const fid = (a0, a1, b0, b1) => {
    const re = t0 * a0 + t1r * b0 + t1i * b1;
    const im = t0 * a1 + t1r * b1 - t1i * b0;
    return re * re + im * im;
  };

  let best = { f: fid(1, 0, 0, 0), seq: [], cost: 0 };
  const seq = [];
  const consider = (a0, a1, b0, b1, cost) => {
    const f = fid(a0, a1, b0, b1);
    const hit = f >= TARGET_F, bestHit = best.f >= TARGET_F;
    if ((!bestHit && !hit && f > best.f + 1e-12) ||
        (hit && (!bestHit || cost < best.cost || (cost === best.cost && f > best.f)))) {
      best = { f, seq: seq.slice(), cost };
    }
  };
  const walk = (a0, a1, b0, b1, hCount, cost) => {
    const h0 = (a0 + b0) * s2, h1 = (a1 + b1) * s2;
    const g0 = (a0 - b0) * s2, g1 = (a1 - b1) * s2;
    seq.push("H");
    consider(h0, h1, g0, g1, cost + 1);
    if (hCount < MAX_H) {
      for (let k = 1; k < 8; k++) {
        const c = Math.cos((k * Math.PI) / 4), sn = Math.sin((k * Math.PI) / 4);
        const n0 = g0 * c - g1 * sn, n1 = g0 * sn + g1 * c;
        const kc = cost + 1 + T_POWER[k].length;
        seq.push(k);
        consider(h0, h1, n0, n1, kc);
        walk(h0, h1, n0, n1, hCount + 1, kc);
        seq.pop();
      }
    }
    seq.pop();
  };
  walk(1, 0, 0, 0, 1, 0);

  const gates = [];
  for (const g of best.seq) {
    if (g === "H") gates.push({ name: "H" });
    else for (const n of T_POWER[g]) gates.push({ name: n });
  }
  return { gates, fidelity: best.f };
}

// ---------------------------------------------------------------------------
// Circuit drawing (SVG).

const SVG_NS = "http://www.w3.org/2000/svg";
let mode = "rot";
try {
  const saved = localStorage.getItem("qlock-gates");
  if (["rot", "u", "ht"].includes(saved)) mode = saved;
} catch (e) { /* storage unavailable */ }

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const k in attrs) node.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(node);
  return node;
}

// gate label: base letter, optional subscript, optional "(args)"
function gateLabel(text, g) {
  text.appendChild(document.createTextNode(g.name));
  if (g.sub) {
    const sub = el("tspan", { dy: "4", "font-size": "10" }, text);
    sub.textContent = g.sub;
    if (g.args) {
      const rest = el("tspan", { dy: "-4" }, text);
      rest.textContent = `(${g.args})`;
    }
  } else if (g.args) {
    text.appendChild(document.createTextNode(`(${g.args})`));
  }
}

function wiresFor(s) {
  if (mode === "rot") {
    return [
      { cls: "time", gates: [
        { name: "R", sub: "y", args: fracText(s.timeTheta) },
        { name: "R", sub: "z", args: fracText(s.timePhi) }] },
      { cls: "date", gates: [
        { name: "R", sub: "y", args: fracText(s.dateTheta) },
        { name: "R", sub: "z", args: fracText(s.datePhi) }] },
    ];
  }
  if (mode === "u") {
    return [
      { cls: "time", gates: [{ name: "U", args: `${fracText(s.timeTheta)}, ${fracText(s.timePhi)}, 0` }] },
      { cls: "date", gates: [{ name: "U", args: `${fracText(s.dateTheta)}, ${fracText(s.datePhi)}, 0` }] },
    ];
  }
  const note = (r) => {
    if (r.gates.length === 0) return "no gates needed";
    const n = `${r.gates.length} gate${r.gates.length === 1 ? "" : "s"}`;
    if (r.fidelity > 1 - 1e-9) return `${n}, exact`;
    if (r.fidelity >= 0.99995) return `${n}, fidelity above 0.9999`;
    return `${n}, fidelity ${r.fidelity.toFixed(4)}`;
  };
  return [
    { cls: "time", gates: s.htTime.gates, note: note(s.htTime) },
    { cls: "date", gates: s.htDate.gates, note: note(s.htDate) },
  ];
}

const CAPTIONS = {
  rot: "Start in |0⟩, tilt down by θ with an R<sub>y</sub> rotation, then turn by φ around the z-axis with R<sub>z</sub>. This is exact, up to a global phase.",
  u: "U(θ, φ, λ) is the general single-qubit gate, so one gate can do both rotations. Its third angle λ would only add a global phase to |0⟩, so it is set to 0.",
  ht: "Real quantum hardware runs a small, fixed set of gates. This is the shortest sequence of H, S, T, Z and their inverses found that reaches each state with fidelity of at least 0.999, searching up to seven H gates. Where none gets there, it is the closest one found.",
};

function renderCircuit(s) {
  if (!s || !s.htTime) return;
  const svg = document.getElementById("circuit");
  svg.replaceChildren();

  const wires = wiresFor(s);
  const KET_X = 42, WIRE_X0 = 66, GAP = 6, PAD_X = 9, GATE_H = 28, ROW = 46, TOP = 18;

  // measure every gate label
  const measured = wires.map((w) => w.gates.map((g) => {
    const t = el("text", {}, svg);
    gateLabel(t, g);
    const width = Math.max(GATE_H, t.getBBox().width + PAD_X * 2);
    svg.removeChild(t);
    return width;
  }));
  // The two qubits never interact, so the long Clifford + T sequences are
  // packed tightly on each wire; the short exact circuits line up in columns.
  const cols = Math.max(0, ...wires.map((w) => w.gates.length));
  const colW = [];
  for (let c = 0; c < cols; c++) colW[c] = Math.max(0, ...measured.map((m) => m[c] || 0));
  const packed = mode === "ht";
  const widthOf = (i, c) => (packed ? measured[i][c] : colW[c]);
  const gatesWidth = Math.max(0, ...wires.map((w, i) =>
    w.gates.reduce((sum, g, c) => sum + widthOf(i, c) + GAP, 0)));
  const wireEnd = WIRE_X0 + GAP + Math.max(gatesWidth, 40) + 10;

  wires.forEach((w, i) => {
    const y = TOP + i * ROW;
    const name = el("text", { class: `label name ${w.cls}`, x: 0, y: y + 4.5 }, svg);
    name.textContent = w.cls;
    const ket = el("text", { class: "ket", x: KET_X, y: y + 5 }, svg);
    ket.textContent = "|0⟩";
    el("line", { class: `wire ${w.cls === "date" ? "date" : ""}`, x1: WIRE_X0, y1: y, x2: wireEnd, y2: y }, svg);

    let x = WIRE_X0 + GAP;
    w.gates.forEach((g, c) => {
      const width = measured[i][c];
      const cx = x + widthOf(i, c) / 2;
      const grp = el("g", { class: `gate ${w.cls === "date" ? "date" : ""}` }, svg);
      el("rect", { x: cx - width / 2, y: y - GATE_H / 2, width, height: GATE_H, rx: 2 }, grp);
      const t = el("text", { x: cx, y: y + 4.5, "text-anchor": "middle" }, grp);
      gateLabel(t, g);
      x += widthOf(i, c) + GAP;
    });

  });

  const width = Math.ceil(wireEnd + 2);
  const height = TOP + (wires.length - 1) * ROW + GATE_H / 2 + 6;
  svg.setAttribute("width", width);
  svg.setAttribute("height", height);
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("aria-label", wires.map((w) =>
    `${w.cls}: ${w.gates.length ? w.gates.map((g) => g.name + (g.sub || "") + (g.args ? `(${g.args})` : "")).join(", ") : "no gates"}`
  ).join("; "));
  svg.setAttribute("role", "img");

  const noteEl = document.getElementById("circuit-note");
  noteEl.innerHTML = wires.filter((w) => w.note)
    .map((w) => `<span class="${w.cls}">${w.cls}</span> ${w.note}`).join("<br>");
  noteEl.hidden = !wires.some((w) => w.note);
  document.getElementById("circuit-caption").innerHTML = CAPTIONS[mode];
}

// tabs
const tabs = Array.from(document.querySelectorAll('.tabs [role="tab"]'));
function selectTab(btn, focus) {
  mode = btn.dataset.mode;
  tabs.forEach((b) => {
    const on = b === btn;
    b.setAttribute("aria-selected", on);
    b.tabIndex = on ? 0 : -1;
  });
  document.querySelector(".circuit-wrap").setAttribute("aria-labelledby", btn.id);
  if (focus) btn.focus();
  try { localStorage.setItem("qlock-gates", mode); } catch (e) { /* ignore */ }
  renderCircuit(pageState);
}
tabs.forEach((btn, i) => {
  btn.addEventListener("click", () => selectTab(btn));
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") selectTab(tabs[(i + 1) % tabs.length], true);
    if (e.key === "ArrowLeft") selectTab(tabs[(i + tabs.length - 1) % tabs.length], true);
  });
});
selectTab(tabs.find((b) => b.dataset.mode === mode) || tabs[0]);

// re-measure gate labels once the web font has arrived
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => renderCircuit(pageState));
}
