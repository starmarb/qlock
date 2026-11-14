import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { QUBITS, type ClockState, type QubitName } from "../quantum";
import { useClock } from "../hooks/env";

export type Shown = Record<QubitName, boolean>;

interface QlockValue {
  clock: ClockState;
  /** Which qubits are on show. At least one always is. */
  shown: Shown;
  /** The qubits on show, in page order. */
  visible: QubitName[];
  /**
   * Show only this qubit. Clicking the qubit that is already shown on its own
   * brings both back.
   */
  focus: (q: QubitName) => void;
  /** Show both qubits. */
  showBoth: () => void;
}

const BOTH: Shown = { time: true, date: true };
const only = (q: QubitName): Shown => ({ time: q === "time", date: q === "date" });

const Ctx = createContext<QlockValue | null>(null);

/**
 * Shared state for every panel on the page: the live clock and which qubits
 * are on show. Panels are rendered from JSON, so they read from here rather
 * than taking props from a parent that knows about them.
 */
export function QlockProvider({ children }: { children: ReactNode }) {
  const clock = useClock();
  // Every visit opens on both qubits.
  const [shown, setShown] = useState<Shown>(BOTH);

  const focus = useCallback((q: QubitName) => {
    setShown((s) => (s[q] && !(s.time && s.date) ? BOTH : only(q)));
  }, []);
  const showBoth = useCallback(() => setShown(BOTH), []);

  const value = useMemo<QlockValue>(() => ({
    clock,
    shown,
    visible: QUBITS.filter((q) => shown[q]),
    focus,
    showBoth,
  }), [clock, shown, focus, showBoth]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useQlock(): QlockValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQlock must be used inside <QlockProvider>");
  return v;
}
