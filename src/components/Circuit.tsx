import { useEffect, useState, type KeyboardEvent } from "react";
import type { Gate, QubitName } from "../quantum";

// A two-wire circuit diagram. Static for the answer view; in the sandbox it is
// the workspace: click a wire to build on it, click a gate to select it, and a
// dashed slot shows where the next gate will go.

export interface CircuitGate extends Gate { key: string | number; selected?: boolean }
export interface CircuitWire { name: QubitName; gates: CircuitGate[] }

export interface CircuitInteraction {
  active: QubitName;
  onWire: (q: QubitName) => void;
  onGate: (q: QubitName, key: string | number) => void;
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

export function Circuit({ wires, packed, interaction, label }: {
  wires: CircuitWire[];
  packed: boolean;
  interaction?: CircuitInteraction;
  label?: string;
}) {
  // re-measure once the web font has loaded
  const [, setFontsReady] = useState(0);
  useEffect(() => { document.fonts?.ready.then(() => setFontsReady((n) => n + 1)); }, []);

  const measured = wires.map((w) => w.gates.map(gateWidth));
  // Each wire is its own qubit and they never interact, so long sequences are
  // packed tightly per wire; short exact circuits line up in columns.
  const cols = Math.max(0, ...wires.map((w) => w.gates.length));
  const colW = Array.from({ length: cols }, (_, c) => Math.max(0, ...measured.map((m) => m[c] || 0)));
  const widthOf = (i: number, c: number) => (packed ? measured[i][c] : colW[c]);
  const rowWidth = (i: number) => wires[i].gates.reduce((sum, _g, c) => sum + widthOf(i, c) + GAP, 0);
  const slotW = interaction ? GATE_H + GAP : 0;
  const gatesWidth = Math.max(0, ...wires.map((_w, i) => rowWidth(i) + (interaction?.active === wires[i].name ? slotW : 0)));
  const wireEnd = WIRE_X0 + GAP + Math.max(gatesWidth, interaction ? 200 : 40) + 10;
  const width = Math.ceil(wireEnd + 2);
  const height = TOP + (wires.length - 1) * ROW + GATE_H / 2 + 6;

  const aria = label ?? wires.map((w) =>
    `${w.name}: ${w.gates.length ? w.gates.map((g) => g.name + (g.sub || "") + (g.args ? `(${g.args})` : "")).join(", ") : "no gates"}`,
  ).join("; ");

  const press = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); }
  };

  return (
    <svg className={`circuit${interaction ? " circuit--live" : ""}`} width={width} height={height}
      viewBox={`0 0 ${width} ${height}`} role={interaction ? "group" : "img"} aria-label={aria}>
      {wires.map((w, i) => {
        const y = TOP + i * ROW;
        const cls = w.name === "date" ? "date" : "";
        const active = interaction?.active === w.name;
        let x = WIRE_X0 + GAP;
        return (
          <g key={w.name} className={`wire-row${interaction ? (active ? " is-active" : " is-idle") : ""}`}>
            {interaction && (
              <rect className="wire-row__hit" x={0} y={y - ROW / 2} width={width} height={ROW}
                onClick={() => interaction.onWire(w.name)} />
            )}
            <text className={`label name ${cls}`} x={0} y={y + 4.5}
              {...(interaction ? {
                role: "button", tabIndex: 0, "aria-pressed": active,
                "aria-label": `Build on the ${w.name} qubit`,
                onClick: () => interaction.onWire(w.name), onKeyDown: press(() => interaction.onWire(w.name)),
              } : {})}>{w.name}</text>
            <text className="ket" x={KET_X} y={y + 5}>|0⟩</text>
            <line className={`wire ${cls}`} x1={WIRE_X0} y1={y} x2={wireEnd} y2={y} />
            {w.gates.map((g, c) => {
              const gw = measured[i][c];
              const cx = x + widthOf(i, c) / 2;
              x += widthOf(i, c) + GAP;
              const props = interaction ? {
                role: "button", tabIndex: 0, "aria-pressed": !!g.selected,
                "aria-label": `${g.name}${g.sub ?? ""}${g.args ? ` ${g.args}` : ""} gate on ${w.name}, position ${c + 1}`,
                onClick: () => interaction.onGate(w.name, g.key),
                onKeyDown: press(() => interaction.onGate(w.name, g.key)),
              } : {};
              return (
                <g className={`gate ${cls}${g.selected ? " is-selected" : ""}`} key={g.key} {...props}>
                  <rect x={cx - gw / 2} y={y - GATE_H / 2} width={gw} height={GATE_H} rx={2} />
                  <text x={cx} y={y + 4.5} textAnchor="middle">
                    {g.name}
                    {g.sub && <tspan dy={4} fontSize={10}>{g.sub}</tspan>}
                    {g.args && <tspan dy={g.sub ? -4 : 0}>({g.args})</tspan>}
                  </text>
                </g>
              );
            })}
            {active && (
              <g className={`slot ${cls}`} aria-hidden="true">
                <rect x={x} y={y - GATE_H / 2} width={GATE_H} height={GATE_H} rx={2} />
                <text x={x + GATE_H / 2} y={y + 5} textAnchor="middle">+</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
