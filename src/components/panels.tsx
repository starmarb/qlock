import { useEffect, useMemo, useState } from "react";
import { Button, Meter, Readout, ReadoutRow, Swatch, Tabs, Tex } from "../ds";
import {
  MONTHS, QUBITS, amplitudesTex, cliffordT, fracTex, gatesFor, jointProbabilities, p0, percent,
  sequenceNote, type Gate, type GateMode, type QubitName,
} from "../quantum";
import { useQlock, type Bits } from "./QlockContext";

const pad = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// Readout: the time and date as you'd normally read them, plus their angles.

export function ReadoutPanel({ rows }: { rows: QubitName[] }) {
  const { clock: s } = useQlock();
  const content: Record<QubitName, { label: string; value: string; tex: string }> = {
    time: {
      label: "Time",
      value: `${pad(s.h)}:${pad(s.m)}`,
      tex: `\\theta = ${fracTex(s.time.theta)},\\;\\; \\phi = ${fracTex(s.time.phi)}`,
    },
    date: {
      label: "Date",
      value: `${s.D} ${MONTHS[s.M - 1]}`,
      tex: `\\theta = ${fracTex(s.date.theta)},\\;\\; \\phi = ${fracTex(s.date.phi)}`,
    },
  };
  return (
    <section className="readout" aria-label="Time and date">
      <Readout>
        {rows.map((q) => (
          <ReadoutRow key={q} label={content[q].label} value={content[q].value}
            swatch={q === "date" ? "date" : "ink"} aside={<Tex src={content[q].tex} />} />
        ))}
      </Readout>
    </section>
  );
}

// ---------------------------------------------------------------------------
// State: the amplitudes in Dirac notation.

export function StatePanel() {
  const { clock: s } = useQlock();
  const d = "\\htmlClass{date-ket}{\\ket{d}}";
  const src =
    "\\begin{aligned}" +
    `\\ket{\\psi} &= \\ket{t} \\otimes ${d} \\\\[4pt]` +
    `\\ket{t} &= ${amplitudesTex(s.time.theta.value, s.time.phi.value)} \\\\[2pt]` +
    `${d} &= ${amplitudesTex(s.date.theta.value, s.date.phi.value)}` +
    "\\end{aligned}";
  return (
    <section className="state" aria-labelledby="state-heading">
      <h2 id="state-heading">It is <Tex src="\ket{\psi}" /> o’clock</h2>
      <Tex as="div" className="math" src={src} display />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Odds: the chance of each reading, a measure button, and a running tally
// that drifts toward the expected odds as you measure more.

export function OddsPanel({ title, note }: { title: string; note: string }) {
  const { clock, measurement, measureOnce, measureMany, backToNow } = useQlock();
  const odds = { time: p0(clock.time.theta.value), date: p0(clock.date.theta.value) };
  const joint = jointProbabilities(clock.time.theta.value, clock.date.theta.value);
  const { shown, tally, total } = measurement;

  const result = shown
    ? (() => {
        const bits = `${shown.time}${shown.date}` as Bits;
        const p = joint.find((j) => j.bits.join("") === bits)!.p;
        return <>Read <strong>|{bits}⟩</strong>: time collapsed to |{shown.time}⟩ and date to |{shown.date}⟩. That outcome had a {percent(p)} chance.</>;
      })()
    : total > 0
      ? <>Back to the live time. The tally keeps counting until the minute changes.</>
      : <>{note}</>;

  return (
    <section className="odds" aria-labelledby="odds-heading">
      <h2 id="odds-heading">{title}</h2>
      <div className="odds__qubits">
        {QUBITS.map((q) => (
          <div className="odds__qubit" key={q}>
            <div className="odds__qubit-label"><Swatch tone={q === "date" ? "date" : "ink"} dashed />{q}</div>
            <div className="odds__pair">
              <span><Tex src="\ket{0}" /> {percent(odds[q])}</span>
              <span><Tex src="\ket{1}" /> {percent(1 - odds[q])}</span>
            </div>
            <Meter value={odds[q]} tone={q === "date" ? "date" : "ink"} label={`Chance the ${q} qubit reads 0`} />
          </div>
        ))}
      </div>

      <div className="odds__joint" role="table" aria-label="Both qubits together">
        <div className="odds__joint-head" role="row">
          <span role="columnheader">Reading</span>
          <span role="columnheader">Expected, with the observed share marked</span>
          <span role="columnheader" className="odds__num">Expected</span>
          <span role="columnheader" className="odds__num">Seen</span>
        </div>
        {joint.map((j) => {
          const bits = j.bits.join("") as Bits;
          const seen = tally[bits];
          return (
            <div className="odds__joint-row" role="row" key={bits}
              data-hit={shown ? `${shown.time}${shown.date}` === bits : false}>
              <span role="cell" className="odds__ket">|{bits}⟩</span>
              <span role="cell"><Meter value={j.p} observed={total ? seen / total : undefined} label={`Chance of reading ${bits}`} /></span>
              <span role="cell" className="odds__num">{percent(j.p)}</span>
              <span role="cell" className="odds__num odds__num--muted">{total ? seen : "–"}</span>
            </div>
          );
        })}
      </div>

      <div className="odds__actions">
        <Button onClick={measureOnce}>Measure</Button>
        <Button variant="quiet" onClick={() => measureMany(100)}>Measure 100 times</Button>
        <Button variant="quiet" onClick={backToNow} disabled={!shown}>Back to now</Button>
      </div>
      <p className="odds__result" aria-live="polite">
        {result}{total > 0 && <> {total} measurement{total === 1 ? "" : "s"} this minute.</>}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Circuit: three ways to build the current state from |0⟩.

export interface CircuitMode { id: GateMode; label: string; caption: string }

const STORAGE_KEY = "qlock-gates";

export function CircuitPanel({ title, modes }: { title: string; modes: CircuitMode[] }) {
  const { clock: s } = useQlock();
  const [mode, setMode] = useState<GateMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as GateMode | null;
      if (saved && modes.some((m) => m.id === saved)) return saved;
    } catch { /* storage unavailable */ }
    return modes[0].id;
  });
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* ignore */ } }, [mode]);

  // the discrete-gate search only runs when the state changes
  const ht = useMemo(() => ({
    time: cliffordT(s.time.theta.value, s.time.phi.value),
    date: cliffordT(s.date.theta.value, s.date.phi.value),
  }), [s.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const wires = QUBITS.map((q) => ({
    name: q,
    gates: mode === "ht" ? ht[q].gates : gatesFor(mode, s[q]),
    note: mode === "ht" ? sequenceNote(ht[q]) : undefined,
  }));
  const current = modes.find((m) => m.id === mode)!;

  return (
    <section className="gates" aria-labelledby="gates-heading">
      <h2 id="gates-heading">{title}</h2>
      <Tabs idPrefix="gates" label="Gate set" items={modes} value={mode} onChange={setMode} />
      <div className="circuit-wrap" role="tabpanel" id="gates-panel" aria-labelledby={`gates-tab-${mode}`}>
        <CircuitSvg wires={wires} packed={mode === "ht"} />
      </div>
      {mode === "ht" && (
        <p className="circuit-note">
          {wires.map((w, i) => <span key={w.name}>{i > 0 && <br />}<span className={w.name}>{w.name}</span> {w.note}</span>)}
        </p>
      )}
      <p className="caption" dangerouslySetInnerHTML={{ __html: current.caption }} />
    </section>
  );
}

// Text widths for gate boxes, measured with canvas so layout needs no DOM pass.
let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(text: string, px: number): number {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  if (!measureCtx) return text.length * px * 0.6;
  measureCtx.font = `${px}px "IBM Plex Sans", system-ui, sans-serif`;
  return measureCtx.measureText(text).width;
}
function gateWidth(g: Gate): number {
  const main = textWidth(g.name, 13) + (g.sub ? textWidth(g.sub, 10) : 0) + (g.args ? textWidth(`(${g.args})`, 13) : 0);
  return Math.max(GATE_H, main + PAD_X * 2);
}

const KET_X = 42, WIRE_X0 = 66, GAP = 6, PAD_X = 9, GATE_H = 28, ROW = 46, TOP = 18;

function CircuitSvg({ wires, packed }: { wires: { name: QubitName; gates: Gate[] }[]; packed: boolean }) {
  // re-measure once the web font has loaded
  const [, setFontsReady] = useState(0);
  useEffect(() => { document.fonts?.ready.then(() => setFontsReady((n) => n + 1)); }, []);

  const measured = wires.map((w) => w.gates.map(gateWidth));
  // The two qubits never interact, so long Clifford + T sequences are packed
  // tightly on each wire; the short exact circuits line up in columns.
  const cols = Math.max(0, ...wires.map((w) => w.gates.length));
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...measured.map((m) => m[c] || 0)));
  const widthOf = (i: number, c: number) => (packed ? measured[i][c] : colW[c]);
  const gatesWidth = Math.max(0, ...wires.map((w, i) => w.gates.reduce((sum, _g, c) => sum + widthOf(i, c) + GAP, 0)));
  const wireEnd = WIRE_X0 + GAP + Math.max(gatesWidth, 40) + 10;
  const width = Math.ceil(wireEnd + 2);
  const height = TOP + (wires.length - 1) * ROW + GATE_H / 2 + 6;

  const aria = wires.map((w) =>
    `${w.name}: ${w.gates.length ? w.gates.map((g) => g.name + (g.sub || "") + (g.args ? `(${g.args})` : "")).join(", ") : "no gates"}`,
  ).join("; ");

  return (
    <svg className="circuit" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={aria}>
      {wires.map((w, i) => {
        const y = TOP + i * ROW;
        const cls = w.name === "date" ? "date" : "";
        let x = WIRE_X0 + GAP;
        return (
          <g key={w.name}>
            <text className={`label name ${cls}`} x={0} y={y + 4.5}>{w.name}</text>
            <text className="ket" x={KET_X} y={y + 5}>|0⟩</text>
            <line className={`wire ${cls}`} x1={WIRE_X0} y1={y} x2={wireEnd} y2={y} />
            {w.gates.map((g, c) => {
              const gw = measured[i][c];
              const cx = x + widthOf(i, c) / 2;
              x += widthOf(i, c) + GAP;
              return (
                <g className={`gate ${cls}`} key={c}>
                  <rect x={cx - gw / 2} y={y - GATE_H / 2} width={gw} height={GATE_H} rx={2} />
                  <text x={cx} y={y + 4.5} textAnchor="middle">
                    {g.name}
                    {g.sub && <tspan dy={4} fontSize={10}>{g.sub}</tspan>}
                    {g.args && <tspan dy={g.sub ? -4 : 0}>({g.args})</tspan>}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

