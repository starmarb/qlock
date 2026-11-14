import { ReadoutToggle, Tex } from "../ds";
import { MONTHS, amplitudesTex, fracTex, type QubitName } from "../quantum";
import { useQlock } from "./QlockContext";

const pad = (n: number) => String(n).padStart(2, "0");

// ---------------------------------------------------------------------------
// Readout: the time and date as you'd normally read them, plus their angles.
// Each row is also a toggle: click one to look at that qubit on its own,
// click again to see both.

export function ReadoutPanel({ rows }: { rows: QubitName[] }) {
  const { clock: s, shown, focus } = useQlock();
  const both = shown.time && shown.date;
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
  const hint = (q: QubitName) =>
    both ? `Show only the ${q} qubit` : shown[q] ? "Show both qubits" : `Show the ${q} qubit too`;

  return (
    <section className="readout" aria-label="Time and date">
      <div className="ds-readout ds-readout--toggles" role="group" aria-label="Qubits to show">
        {rows.map((q) => (
          <ReadoutToggle key={q} label={content[q].label} value={content[q].value}
            tone={q === "date" ? "date" : "ink"} on={shown[q]} onClick={() => focus(q)} hint={hint(q)}
            aside={<Tex src={content[q].tex} />} />
        ))}
      </div>
      <p className="readout__hint" aria-live="polite">
        {both
          ? "Click Time or Date to look at that qubit on its own."
          : `Showing only the ${shown.time ? "time" : "date"} qubit. Click either row to see both again.`}
      </p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// State: the amplitudes in Dirac notation, for whichever qubits are shown.

export function StatePanel() {
  const { clock: s, shown } = useQlock();
  const d = "\\htmlClass{date-ket}{\\ket{d}}";
  const t = "\\ket{t}";
  const tAmp = amplitudesTex(s.time.theta.value, s.time.phi.value);
  const dAmp = amplitudesTex(s.date.theta.value, s.date.phi.value);
  const src = shown.time && shown.date
    ? "\\begin{aligned}" +
      `\\ket{\\psi} &= ${t} \\otimes ${d} \\\\[4pt]` +
      `${t} &= ${tAmp} \\\\[2pt]` +
      `${d} &= ${dAmp}` +
      "\\end{aligned}"
    : shown.time
      ? `${t} = ${tAmp}`
      : `${d} = ${dAmp}`;
  return (
    <section className="state" aria-labelledby="state-heading">
      <h2 id="state-heading">It is <Tex src="\ket{\psi}" /> o’clock</h2>
      <Tex as="div" className="math" src={src} display />
    </section>
  );
}
