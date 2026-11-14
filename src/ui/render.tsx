// JSON-driven page rendering.
//
// A page is a JSON document listing sections by type. Each type maps to one
// component in the registry below, and each component declares the props it
// accepts with a small validator, so a malformed or unknown section is
// skipped with a console warning instead of crashing the page. Adding a panel
// means adding one registry entry; reordering or retitling the page means
// editing JSON, not React.

import { Fragment, type ReactNode } from "react";
import { BlochSphere } from "../components/BlochSphere";
import { ReadoutPanel, StatePanel } from "../components/panels";
import { Sandbox, type CircuitMode } from "../components/Sandbox";
import type { QubitName } from "../quantum";

export interface Section { type: string; [prop: string]: unknown }
export interface Layout { version: number; title: string; sections: Section[] }

type Check<P> = (s: Section) => P | string; // props, or a reason it is invalid

interface Entry<P> { check: Check<P>; render: (props: P) => ReactNode }
const entry = <P,>(check: Check<P>, render: (props: P) => ReactNode): Entry<P> => ({ check, render });

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isQubit = (v: unknown): v is QubitName => v === "time" || v === "date";
const isMode = (v: unknown): v is CircuitMode =>
  !!v && typeof v === "object" &&
  ["rot", "u", "ht"].includes((v as CircuitMode).id) &&
  isStr((v as CircuitMode).label) && isStr((v as CircuitMode).caption);

export const registry: Record<string, Entry<any>> = {
  lede: entry(
    (s) => (isStr(s.text) ? { text: s.text } : "needs text"),
    ({ text }) => <p className="lede">{text}</p>,
  ),
  sphere: entry(
    (s) => ({ caption: isStr(s.caption) ? s.caption : "" }),
    ({ caption }) => <BlochSphere caption={caption} />,
  ),
  readout: entry(
    (s) => (Array.isArray(s.rows) && s.rows.every(isQubit) ? { rows: s.rows as QubitName[] } : "rows must be time and/or date"),
    ({ rows }) => <ReadoutPanel rows={rows} />,
  ),
  state: entry(() => ({}), () => <StatePanel />),
  circuit: entry(
    (s) => (isStr(s.title) && isStr(s.intro) && Array.isArray(s.modes) && s.modes.length > 0 && s.modes.every(isMode)
      ? { title: s.title, intro: s.intro, modes: s.modes as CircuitMode[] }
      : "needs a title, an intro, and at least one mode with id, label and caption"),
    (p) => <Sandbox {...p} />,
  ),
};

export function renderLayout(layout: Layout): ReactNode[] {
  return layout.sections.map((section, i) => {
    const e = registry[section.type];
    if (!e) {
      console.warn(`[qlock] unknown section type "${section.type}" at index ${i}; skipped`);
      return null;
    }
    const props = e.check(section);
    if (typeof props === "string") {
      console.warn(`[qlock] section "${section.type}" at index ${i} ${props}; skipped`);
      return null;
    }
    return <Fragment key={`${section.type}-${i}`}>{e.render(props)}</Fragment>;
  });
}

