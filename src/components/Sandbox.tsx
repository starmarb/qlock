import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Button, Tabs } from "../ds";
import {
  QUBITS, answerGates, blochOf, cliffordT, fidelity, gatesFor, percent, piText, runGates, sequenceNote,
  type Gate, type GateKind, type GateMode, type PlacedGate, type QubitName,
} from "../quantum";
import { useReducedMotion } from "../hooks/env";
import { Circuit, type CircuitWire } from "./Circuit";
import { makeView, onSphere, type Vec3 } from "./blochSvg";
import { useQlock } from "./QlockContext";

// "Try to make this state with gates": both qubits start at |0⟩ and you add
// gates to steer each one to where the clock is pointing. A small sphere per
// qubit shows your hand against the target, and an answer can be revealed and
// loaded into the workspace.

export interface CircuitMode { id: GateMode; label: string; caption: string }
type Wires = Record<QubitName, PlacedGate[]>;

const MATCH = 0.999;
const STORE_WIRES = "qlock-sandbox";
const STORE_MODE = "qlock-gates";
const STEP = Math.PI / 360; // slider step: half a degree

const GATE_INFO: Record<GateKind, { title: string; text: string }> = {
  H: { title: "H", text: "Hadamard. Swaps the poles with the equator, so |0⟩ moves to the front of the sphere." },
  X: { title: "X", text: "A half turn around the x-axis. Flips |0⟩ and |1⟩." },
  Y: { title: "Y", text: "A half turn around the y-axis. Also flips |0⟩ and |1⟩, with a different phase." },
  Z: { title: "Z", text: "A half turn around the z-axis. The poles stay put; everything else swings to the opposite side." },
  S: { title: "S", text: "A quarter turn around the z-axis." },
  T: { title: "T", text: "An eighth of a turn around the z-axis." },
  Sdg: { title: "S†", text: "A quarter turn back around the z-axis. Undoes S." },
  Tdg: { title: "T†", text: "An eighth of a turn back around the z-axis. Undoes T." },
  Ry: { title: "Ry", text: "Tips the hand toward |1⟩ by any angle you choose." },
  Rz: { title: "Rz", text: "Turns the hand around the z-axis by any angle you choose." },
  U: { title: "U", text: "The general single-qubit gate: tips by θ, then turns by φ." },
};

const FIXED: GateKind[] = ["H", "X", "Y", "Z", "S", "T", "Sdg", "Tdg"];
const TURNS: GateKind[] = ["Ry", "Rz"];

function toGate(g: PlacedGate): Gate {
  switch (g.kind) {
    case "Ry": return { name: "R", sub: "y", args: g.label ?? piText(g.angle ?? 0) };
    case "Rz": return { name: "R", sub: "z", args: g.label ?? piText(g.angle ?? 0) };
    case "U": return { name: "U", args: g.label ?? `${piText(g.angle ?? 0)}, ${piText(g.angle2 ?? 0)}, 0` };
    case "Sdg": return { name: "S†" };
    case "Tdg": return { name: "T†" };
    default: return { name: g.kind };
  }
}

function GateFace({ kind }: { kind: GateKind }) {
  if (kind === "Ry" || kind === "Rz") return <>R<sub>{kind[1]}</sub></>;
  return <>{GATE_INFO[kind].title}</>;
}

function loadWires(): Wires {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_WIRES) ?? "null");
    const ok = (a: unknown): a is PlacedGate[] => Array.isArray(a) && a.every((g) => g && typeof g.id === "number" && g.kind in GATE_INFO);
    if (raw && ok(raw.time) && ok(raw.date)) return { time: raw.time, date: raw.date };
  } catch { /* storage unavailable or corrupt */ }
  return { time: [], date: [] };
}

export function Sandbox({ title, intro, modes }: { title: string; intro: string; modes: CircuitMode[] }) {
  const { clock: s } = useQlock();
  const [wires, setWires] = useState<Wires>(loadWires);
  const [history, setHistory] = useState<Wires[]>([]);
  const [active, setActive] = useState<QubitName>("time");
  const [selected, setSelected] = useState<{ wire: QubitName; id: number } | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [mode, setMode] = useState<GateMode>(() => {
    try {
      const saved = localStorage.getItem(STORE_MODE) as GateMode | null;
      if (saved && modes.some((m) => m.id === saved)) return saved;
    } catch { /* ignore */ }
    return modes[0].id;
  });
  const nextId = useRef(Math.max(0, ...wires.time.map((g) => g.id), ...wires.date.map((g) => g.id)) + 1);

  useEffect(() => { try { localStorage.setItem(STORE_WIRES, JSON.stringify(wires)); } catch { /* ignore */ } }, [wires]);
  useEffect(() => { try { localStorage.setItem(STORE_MODE, mode); } catch { /* ignore */ } }, [mode]);

  const commit = (next: Wires) => {
    setHistory((h) => [...h.slice(-49), wires]);
    setWires(next);
  };

  const add = (kind: GateKind) => {
    const g: PlacedGate = { id: nextId.current++, kind, ...(TURNS.includes(kind) ? { angle: Math.PI / 2 } : {}) };
    commit({ ...wires, [active]: [...wires[active], g] });
    setSelected(TURNS.includes(kind) ? { wire: active, id: g.id } : null);
  };
  const remove = () => {
    if (!selected) return;
    commit({ ...wires, [selected.wire]: wires[selected.wire].filter((g) => g.id !== selected.id) });
    setSelected(null);
  };
  const setAngle = (angle: number) => {
    if (!selected) return;
    setWires({
      ...wires,
      [selected.wire]: wires[selected.wire].map((g) => (g.id === selected.id ? { ...g, angle, label: undefined } : g)),
    });
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory(history.slice(0, -1));
    setWires(prev);
    setSelected(null);
  };
  const clear = () => {
    commit({ time: [], date: [] });
    setSelected(null);
  };

  const results = useMemo(() => {
    const r = {} as Record<QubitName, { fid: number; vec: Vec3 }>;
    for (const q of QUBITS) {
      const k = runGates(wires[q]);
      r[q] = { fid: fidelity(k, s[q].theta.value, s[q].phi.value), vec: blochOf(k) };
    }
    return r;
  }, [wires, s]);
  const bothMatch = QUBITS.every((q) => results[q].fid >= MATCH);

  // the answer, for the mode being shown
  const ht = useMemo(() => ({
    time: cliffordT(s.time.theta.value, s.time.phi.value),
    date: cliffordT(s.date.theta.value, s.date.phi.value),
  }), [s.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const answerWires: CircuitWire[] = QUBITS.map((q) => ({
    name: q,
    gates: (mode === "ht" ? ht[q].gates : gatesFor(mode, s[q])).map((g, i) => ({ ...g, key: i })),
  }));
  const loadAnswer = () => {
    const next = {} as Wires;
    for (const q of QUBITS) next[q] = answerGates(mode, s[q]).map((g) => ({ ...g, id: nextId.current++ }));
    commit(next);
    setSelected(null);
  };
  const currentMode = modes.find((m) => m.id === mode)!;

  const sel = selected ? wires[selected.wire].find((g) => g.id === selected.id) : undefined;
  const liveWires: CircuitWire[] = QUBITS.map((q) => ({
    name: q,
    gates: wires[q].map((g) => ({ ...toGate(g), key: g.id, selected: selected?.wire === q && selected.id === g.id })),
  }));

  const onKey = (e: KeyboardEvent) => {
    if ((e.key === "Delete" || e.key === "Backspace") && selected && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      remove();
    }
  };

  return (
    <section className={`sandbox sandbox--${active}`} aria-labelledby="sandbox-heading" onKeyDown={onKey}>
      <h2 id="sandbox-heading">{title}</h2>
      <p className="sandbox__intro">{intro}</p>

      <div className="sandbox__targets">
        {QUBITS.map((q) => {
          const r = results[q];
          const matched = r.fid >= MATCH;
          return (
            <button key={q} type="button" className={`target target--${q}${active === q ? " is-active" : ""}`}
              aria-pressed={active === q} onClick={() => { setActive(q); setSelected(null); }}>
              <MiniBloch target={onSphere(s[q].theta.value, s[q].phi.value)} yours={r.vec} tone={q} />
              <span className="target__text">
                <span className="target__name">{q}</span>
                <span className={`target__score${matched ? " is-matched" : ""}`}>
                  {matched ? <><Check /> Matched</> : <>{percent(r.fid)} there</>}
                </span>
                <span className="target__bar" aria-hidden="true"><span style={{ width: `${r.fid * 100}%` }} /></span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="circuit-wrap">
        <Circuit wires={liveWires} packed
          interaction={{
            active,
            onWire: (q) => { setActive(q); setSelected(null); },
            onGate: (q, key) => {
              setActive(q);
              setSelected(selected?.id === key ? null : { wire: q, id: key as number });
            },
          }}
          label="Your circuit" />
      </div>

      <div className="palette" role="group" aria-label={`Add a gate to the ${active} qubit`}>
        <div className="palette__group">
          <span className="palette__label">Fixed turns</span>
          <div className="palette__row">
            {FIXED.map((k) => (
              <button key={k} type="button" className="gate-btn" title={GATE_INFO[k].text} onClick={() => add(k)}>
                <GateFace kind={k} />
              </button>
            ))}
          </div>
        </div>
        <div className="palette__group">
          <span className="palette__label">Any angle</span>
          <div className="palette__row">
            {TURNS.map((k) => (
              <button key={k} type="button" className="gate-btn gate-btn--wide" title={GATE_INFO[k].text} onClick={() => add(k)}>
                <GateFace kind={k} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="editor" aria-live="polite">
        {sel ? (
          <>
            <p className="editor__info"><b><GateFace kind={sel.kind} /></b> {GATE_INFO[sel.kind].text}</p>
            {TURNS.includes(sel.kind) && (
              <div className="editor__angle">
                <label htmlFor="gate-angle">Angle</label>
                <input id="gate-angle" type="range" min={0} max={720} step={1}
                  value={Math.round((sel.angle ?? 0) / STEP)}
                  onPointerDown={() => setHistory((h) => [...h.slice(-49), wires])}
                  onChange={(e) => setAngle(Number(e.target.value) * STEP)} />
                <output htmlFor="gate-angle">{sel.label ?? piText(sel.angle ?? 0)}</output>
              </div>
            )}
            <div className="editor__actions">
              <Button variant="quiet" onClick={remove}>Remove gate</Button>
              <Button variant="quiet" onClick={() => setSelected(null)}>Done</Button>
            </div>
          </>
        ) : (
          <p className="editor__hint">
            {bothMatch
              ? <>Both qubits match the clock. You built the time.</>
              : <>Gates go on the <b className={`k-${active}`}>{active}</b> wire. Click a gate on the wire to change or remove it. The clock keeps moving, so the target shifts a little every minute.</>}
          </p>
        )}
        {!sel && (
          <div className="editor__actions">
            <Button variant="quiet" onClick={undo} disabled={!history.length}>Undo</Button>
            <Button variant="quiet" onClick={clear} disabled={!wires.time.length && !wires.date.length}>Clear</Button>
            <Button variant="quiet" onClick={() => setShowAnswer(!showAnswer)} aria-expanded={showAnswer} aria-controls="answer">
              {showAnswer ? "Hide Answers" : "Show Answers"}
            </Button>
          </div>
        )}
      </div>

      {showAnswer && (
        <div className="answer" id="answer">
          <Tabs idPrefix="gates" label="Gate set" items={modes} value={mode} onChange={setMode} />
          <div className="circuit-wrap" role="tabpanel" id="gates-panel" aria-labelledby={`gates-tab-${mode}`}>
            <Circuit wires={answerWires} packed={mode === "ht"} />
          </div>
          {mode === "ht" && (
            <p className="circuit-note">
              {QUBITS.map((q, i) => <span key={q}>{i > 0 && <br />}<span className={q}>{q}</span> {sequenceNote(ht[q])}</span>)}
            </p>
          )}
          <p className="caption" dangerouslySetInnerHTML={{ __html: currentMode.caption }} />
          <div className="answer__actions">
            <Button variant="quiet" onClick={loadAnswer}>Load this into the sandbox</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Check() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" className="check">
      <path d="M2 6.5 4.8 9 10 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// A small flat sphere: the target as a dashed hand, yours as a solid one that
// glides to its new position when the circuit changes.

const mini = makeView({ az: 32, el: 22, R: 42, cx: 48, cy: 48 });
const miniEquator = mini.curve((u) => [Math.cos(u), Math.sin(u), 0], 0, 2 * Math.PI, 72);

function MiniBloch({ target, yours, tone }: { target: Vec3; yours: Vec3; tone: QubitName }) {
  const shown = useGlide(yours);
  const c = mini.project([0, 0, 0]);
  const t = mini.project(target);
  const y = mini.project(shown);
  return (
    <svg className={`mini mini--${tone}`} viewBox="0 0 96 96" width="84" height="84" aria-hidden="true">
      <circle cx={mini.cx} cy={mini.cy} r={mini.R} className="mini__outline" />
      {miniEquator.back.map((d, i) => <path key={`b${i}`} d={d} className="mini__equator is-back" />)}
      {miniEquator.front.map((d, i) => <path key={`f${i}`} d={d} className="mini__equator" />)}
      <line x1={c.x} y1={c.y} x2={t.x} y2={t.y} className="mini__target" />
      <circle cx={t.x} cy={t.y} r={4.5} className="mini__target-tip" />
      <line x1={c.x} y1={c.y} x2={y.x} y2={y.y} className="mini__hand" />
      <circle cx={y.x} cy={y.y} r={3} className="mini__tip" />
    </svg>
  );
}

/** Ease a unit vector toward its new value along the sphere. */
function useGlide(to: Vec3): Vec3 {
  const reduced = useReducedMotion();
  const [v, setV] = useState<Vec3>(to);
  const from = useRef<Vec3>(to);
  const key = to.map((n) => n.toFixed(5)).join();
  useEffect(() => {
    if (reduced) { setV(to); from.current = to; return; }
    const start = performance.now(), a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 260);
      const e = 1 - Math.pow(1 - k, 3);
      const m: Vec3 = [a[0] + (to[0] - a[0]) * e, a[1] + (to[1] - a[1]) * e, a[2] + (to[2] - a[2]) * e];
      const len = Math.hypot(...m) || 1;
      const next: Vec3 = [m[0] / len, m[1] / len, m[2] / len];
      from.current = next;
      setV(next);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}
