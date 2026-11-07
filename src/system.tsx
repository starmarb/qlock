import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles/page.css";
import { Shell } from "./components/Shell";
import { Button, Meter, Readout, ReadoutRow, Swatch, Tabs, Tex } from "./ds";
import { useThemeColors } from "./hooks/env";
import layout from "./ui/clock.layout.json";

// The design system sheet: every token and every component state on one page,
// so a change can be checked in light and dark before it reaches the clock.

const COLOR_TOKENS = [
  ["--color-bg", "Page background"],
  ["--color-ink", "Text, time qubit, primary actions"],
  ["--color-muted", "Secondary text, |1⟩ pole"],
  ["--color-rule", "Dividers, sphere grid"],
  ["--color-faint", "Fills, meter tracks"],
  ["--color-date", "Date qubit"],
];

const TYPE = [
  ["--text-wordmark", "|qlock⟩", "var(--font-math)"],
  ["--text-xl", "14:05", ""],
  ["--text-lg", "It is |ψ⟩ o’clock", ""],
  ["--text-base", "Body text", ""],
  ["--text-md", "Labels and tabs", ""],
  ["--text-sm", "Captions", ""],
  ["--text-xs", "Fine print", ""],
];

function System() {
  const colors = useThemeColors();
  const [tab, setTab] = useState<"a" | "b" | "c">("a");
  const value = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  void colors; // re-render on theme change so the hex values below stay current

  return (
    <Shell page="system">
      <h2>Design system</h2>
      <p>The tokens and components every qlock page is built from. The shader scene reads the same colour tokens, so the sphere follows any change here. Add <code>?theme=dark</code> or <code>?theme=light</code> to check both themes.</p>

      <div className="sheet__group">
        <h2>Colour</h2>
        <div className="sheet__swatches">
          {COLOR_TOKENS.map(([name, use]) => (
            <div className="sheet__chip" key={name}>
              <div className="sheet__chip-color" style={{ background: `var(${name})` }} />
              <div className="sheet__chip-meta"><b>{name}</b>{value(name)}<br />{use}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="sheet__group">
        <h2>Type</h2>
        <div className="sheet__type">
          {TYPE.map(([name, sample, family]) => (
            <div key={name}>
              <span>{name}</span>
              <span style={{ fontSize: `var(${name})`, fontFamily: family || undefined }}>{sample}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="sheet__group">
        <h2>Button</h2>
        <p className="sheet__note">Primary for the one main action in a panel; quiet for the rest. Hover, press and tab through to see each state.</p>
        <div className="sheet__row">
          <div className="sheet__cell">Primary<Button>Measure</Button></div>
          <div className="sheet__cell">Quiet<Button variant="quiet">Measure 100 times</Button></div>
          <div className="sheet__cell">Disabled<Button variant="quiet" disabled>Back to now</Button></div>
          <div className="sheet__cell">Busy<Button busy>Measuring</Button></div>
        </div>
      </div>

      <div className="sheet__group">
        <h2>Tabs</h2>
        <p className="sheet__note">One indicator slides between tabs. Arrow keys move, Home and End jump.</p>
        <div style={{ marginTop: "var(--space-4)" }}>
          <Tabs idPrefix="demo" label="Demo tabs" value={tab} onChange={setTab}
            items={[{ id: "a", label: "Rotations" }, { id: "b", label: "One U gate" }, { id: "c", label: "Clifford + T" }]} />
        </div>
      </div>

      <div className="sheet__group">
        <h2>Meter</h2>
        <p className="sheet__note">A probability from 0 to 1. The grey mark is the share observed so far.</p>
        <div className="sheet__row" style={{ display: "grid", gap: "var(--space-3)" }}>
          <Meter value={0.73} label="Ink meter" />
          <Meter value={0.31} tone="date" label="Date meter" />
          <Meter value={0.5} observed={0.56} label="Meter with observed share" />
        </div>
      </div>

      <div className="sheet__group">
        <h2>Readout and swatches</h2>
        <div style={{ marginTop: "var(--space-4)" }}>
          <Readout>
            <ReadoutRow label="Time" swatch="ink" value="14:05" aside={<Tex src="\theta = 169\pi/288" />} />
            <ReadoutRow label="Date" swatch="date" value="7 November" aside={<Tex src="\theta = 17\pi/20" />} />
          </Readout>
        </div>
        <div className="sheet__row">
          <div className="sheet__cell"><span><Swatch />Hand</span></div>
          <div className="sheet__cell"><span><Swatch tone="date" />Hand</span></div>
          <div className="sheet__cell"><span><Swatch dashed />Odds ring</span></div>
          <div className="sheet__cell"><span><Swatch tone="date" dashed />Odds ring</span></div>
        </div>
      </div>

      <div className="sheet__group">
        <h2>Page layout as data</h2>
        <p className="sheet__note">The clock page is this JSON, rendered section by section by <code>src/ui/render.tsx</code>. Unknown or malformed sections are skipped with a warning.</p>
        <pre className="sheet__json">{JSON.stringify(layout.sections.map((s) => ({ type: s.type })), null, 2)}</pre>
      </div>
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><System /></StrictMode>);
