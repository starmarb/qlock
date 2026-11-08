import { Readout, ReadoutRow, Tex } from "../ds";
import { MONTHS, amplitudesTex, fracTex, type QubitName } from "../quantum";
import { useQlock } from "./QlockContext";

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
