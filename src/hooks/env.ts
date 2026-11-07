import { useEffect, useState } from "react";
import { readClock, type ClockState } from "../quantum";

// URL switches for testing: ?at=2026-12-31T23:59 starts the clock at another
// moment, ?theme=dark|light forces a theme, ?debug shows frame stats.
const params = new URLSearchParams(location.search);
let clockOffset = 0;
const at = params.get("at");
if (at) {
  const d = new Date(at);
  if (!isNaN(d.getTime())) clockOffset = d.getTime() - Date.now();
}
const theme = params.get("theme");
if (theme === "dark" || theme === "light") document.documentElement.dataset.theme = theme;
export const debug = params.has("debug");
export const now = () => new Date(Date.now() + clockOffset);

/** The clock state, re-read every second and replaced only when the minute changes. */
export function useClock(): ClockState {
  const [state, setState] = useState(() => readClock(now()));
  useEffect(() => {
    const id = setInterval(() => {
      const next = readClock(now());
      setState((prev) => (prev.key === next.key ? prev : next));
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return state;
}

export interface ThemeColors { ink: string; muted: string; rule: string; date: string; bg: string }

function readColors(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return { ink: v("--color-ink"), muted: v("--color-muted"), rule: v("--color-rule"), date: v("--color-date"), bg: v("--color-bg") };
}

/** Colour tokens from CSS, kept in sync with the OS theme and ?theme. */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const update = () => setColors(readColors());
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { mq.removeEventListener("change", update); mo.disconnect(); };
  }, []);
  return colors;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}
