import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
   * Clicking a qubit while both are shown isolates it. Clicking either one
   * while a single qubit is isolated brings both back.
   */
  focus: (q: QubitName) => void;
}

const STORE = "qlock-shown";
const BOTH: Shown = { time: true, date: true };

function loadShown(): Shown {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (raw && typeof raw.time === "boolean" && typeof raw.date === "boolean" && (raw.time || raw.date)) return raw;
  } catch { /* storage unavailable or corrupt */ }
  return BOTH;
}

const Ctx = createContext<QlockValue | null>(null);

/**
 * Shared state for every panel on the page: the live clock and which qubits
 * are on show. Panels are rendered from JSON, so they read from here rather
 * than taking props from a parent that knows about them.
 */
export function QlockProvider({ children }: { children: ReactNode }) {
  const clock = useClock();
  const [shown, setShown] = useState<Shown>(loadShown);

  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(shown)); } catch { /* ignore */ } }, [shown]);

  const focus = useCallback((q: QubitName) => {
    setShown((s) => (s.time && s.date ? { time: q === "time", date: q === "date" } : BOTH));
  }, []);

  const value = useMemo<QlockValue>(() => ({
    clock,
    shown,
    visible: QUBITS.filter((q) => shown[q]),
    focus,
  }), [clock, shown, focus]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useQlock(): QlockValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQlock must be used inside <QlockProvider>");
  return v;
}
