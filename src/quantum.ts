// qlock: the time and date as the state of two qubits.
//
// time qubit |t⟩: hour (plus minutes) -> θ,  minute -> φ
// date qubit |d⟩: month (plus days)   -> θ,  day    -> φ
//
// |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩
// Midnight and 1 January are both |0⟩, the north pole.
//
// Everything in this file is plain math with no DOM, so it can be unit tested
// and shared by the shader scene, the React panels and the SVG fallback.

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];

/** An angle stored as an exact fraction of π. */
export interface PiFrac { n: number; d: number; value: number }

/** One qubit, described by its two Bloch angles. */
export interface Qubit { theta: PiFrac; phi: PiFrac }

export interface ClockState {
  key: string;
  h: number; m: number; M: number; D: number; days: number;
  time: Qubit;
  date: Qubit;
}

export type QubitName = "time" | "date";
export const QUBITS: QubitName[] = ["time", "date"];

function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : Math.abs(a); }

export function piFrac(n: number, d: number): PiFrac {
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g, value: (Math.PI * n) / d };
}
export function fracText(f: PiFrac): string {
  if (f.n === 0) return "0";
  const top = f.n === 1 ? "π" : `${f.n}π`;
  return f.d === 1 ? top : `${top}/${f.d}`;
}
export function fracTex(f: PiFrac): string {
  if (f.n === 0) return "0";
  const top = f.n === 1 ? "\\pi" : `${f.n}\\pi`;
  return f.d === 1 ? top : `${top}/${f.d}`;
}

export function readClock(t: Date): ClockState {
  const h = t.getHours(), m = t.getMinutes();
  const M = t.getMonth() + 1, D = t.getDate();
  const days = new Date(t.getFullYear(), M, 0).getDate();
  return {
    key: `${t.getFullYear()}-${M}-${D} ${h}:${m}`,
    h, m, M, D, days,
    // time: θ = (hour + minute/60)/24 · π,   φ = minute/60 · 2π
    time: { theta: piFrac(60 * h + m, 1440), phi: piFrac(2 * m, 60) },
    // date: θ = (month − 1 + (day − 1)/days)/12 · π,   φ = (day − 1)/days · 2π
    date: { theta: piFrac((M - 1) * days + (D - 1), 12 * days), phi: piFrac(2 * (D - 1), days) },
  };
}

/** Point on the unit Bloch sphere, z up (|0⟩ at +z). */
export function blochVector(theta: number, phi: number): [number, number, number] {
  return [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
}

// ---------------------------------------------------------------------------
// Measurement. Measuring in the computational basis gives |0⟩ with
// probability |cos(θ/2)|² and |1⟩ with probability |sin(θ/2)|². φ never
// changes the odds, which is why every point on a line of latitude reads the
// same. The two qubits are a product state, so the joint odds multiply.

export function p0(theta: number): number {
  const c = Math.cos(theta / 2);
  return c * c;
}

export type Outcome = 0 | 1;

export interface JointOutcome { bits: [Outcome, Outcome]; p: number }

export function jointProbabilities(timeTheta: number, dateTheta: number): JointOutcome[] {
  const t0 = p0(timeTheta), d0 = p0(dateTheta);
  const out: JointOutcome[] = [];
  for (const a of [0, 1] as Outcome[]) {
    for (const b of [0, 1] as Outcome[]) {
      out.push({ bits: [a, b], p: (a ? 1 - t0 : t0) * (b ? 1 - d0 : d0) });
    }
  }
  return out;
}

/** Sample one outcome. `rand` is injectable so tests are deterministic. */
export function measure(theta: number, rand: () => number = Math.random): Outcome {
  return rand() < p0(theta) ? 0 : 1;
}

export function percent(p: number): string {
  if (p > 0 && p < 0.001) return "<0.1%";
  if (p < 1 && p > 0.999) return ">99.9%";
  return `${(p * 100).toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Amplitudes, written for KaTeX.

function num(x: number): string {
  const r = Math.abs(x) < 0.005 ? 0 : x;
  return r.toFixed(2);
}
export function amplitudesTex(theta: number, phi: number): string {
  const a = Math.cos(theta / 2);
  const re = Math.cos(phi) * Math.sin(theta / 2);
  const im = Math.sin(phi) * Math.sin(theta / 2);
  const imAbs = Math.abs(im) < 0.005 ? 0 : im;
  const sign = imAbs < 0 ? "-" : "+";
  return `${num(a)}\\,\\ket{0} + (${num(re)} ${sign} ${num(Math.abs(imAbs))}i)\\,\\ket{1}`;
}

// ---------------------------------------------------------------------------
// Clifford + T search.
//
// Every sequence of H and T gates can be written as H T^k1 H T^k2 H ... with
// k in 1..7 (T^8 = I, and a leading T only adds a phase to |0⟩). We walk all
// such sequences up to MAX_H Hadamards and keep the cheapest one whose
// fidelity |⟨target|ψ⟩|² reaches TARGET_F, or the most faithful one otherwise.

export const MAX_H = 7;
export const TARGET_F = 0.999;
const T_POWER: string[][] = [[], ["T"], ["S"], ["S", "T"], ["Z"], ["Z", "T"], ["S†"], ["T†"]];

export interface Gate { name: string; sub?: string; args?: string }
export interface GateSequence { gates: Gate[]; fidelity: number }

export function cliffordT(theta: number, phi: number): GateSequence {
  const s2 = Math.SQRT1_2;
  const t0 = Math.cos(theta / 2);
  const t1r = Math.cos(phi) * Math.sin(theta / 2);
  const t1i = Math.sin(phi) * Math.sin(theta / 2);
  const fid = (a0: number, a1: number, b0: number, b1: number) => {
    const re = t0 * a0 + t1r * b0 + t1i * b1;
    const im = t0 * a1 + t1r * b1 - t1i * b0;
    return re * re + im * im;
  };

  type Step = "H" | number;
  let best = { f: fid(1, 0, 0, 0), seq: [] as Step[], cost: 0 };
  const seq: Step[] = [];
  const consider = (a0: number, a1: number, b0: number, b1: number, cost: number) => {
    const f = fid(a0, a1, b0, b1);
    const hit = f >= TARGET_F, bestHit = best.f >= TARGET_F;
    if ((!bestHit && !hit && f > best.f + 1e-12) ||
        (hit && (!bestHit || cost < best.cost || (cost === best.cost && f > best.f)))) {
      best = { f, seq: seq.slice(), cost };
    }
  };
  const walk = (a0: number, a1: number, b0: number, b1: number, hCount: number, cost: number) => {
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

  const gates: Gate[] = [];
  for (const g of best.seq) {
    if (g === "H") gates.push({ name: "H" });
    else for (const n of T_POWER[g]) gates.push({ name: n });
  }
  return { gates, fidelity: best.f };
}

export type GateMode = "rot" | "u" | "ht";

export function gatesFor(mode: GateMode, q: Qubit): Gate[] {
  if (mode === "rot") {
    return [
      { name: "R", sub: "y", args: fracText(q.theta) },
      { name: "R", sub: "z", args: fracText(q.phi) },
    ];
  }
  if (mode === "u") return [{ name: "U", args: `${fracText(q.theta)}, ${fracText(q.phi)}, 0` }];
  return cliffordT(q.theta.value, q.phi.value).gates;
}

export function sequenceNote(r: GateSequence): string {
  if (r.gates.length === 0) return "no gates needed";
  const n = `${r.gates.length} gate${r.gates.length === 1 ? "" : "s"}`;
  if (r.fidelity > 1 - 1e-9) return `${n}, exact`;
  if (r.fidelity >= 0.99995) return `${n}, fidelity above 0.9999`;
  return `${n}, fidelity ${r.fidelity.toFixed(4)}`;
}
