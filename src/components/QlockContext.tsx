import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { measure, type ClockState, type Outcome, type QubitName } from "../quantum";
import { useClock } from "../hooks/env";

export type Bits = `${Outcome}${Outcome}`; // time bit, then date bit

export interface Measurement {
  /** The outcome being shown on the sphere, or null while the clock runs live. */
  shown: Record<QubitName, Outcome> | null;
  /** How many times each joint outcome has come up for the current state. */
  tally: Record<Bits, number>;
  total: number;
}

interface QlockValue {
  clock: ClockState;
  measurement: Measurement;
  measureOnce: () => void;
  measureMany: (n: number) => void;
  backToNow: () => void;
}

const emptyTally = (): Record<Bits, number> => ({ "00": 0, "01": 0, "10": 0, "11": 0 });

const Ctx = createContext<QlockValue | null>(null);

/**
 * Shared state for every panel on the page: the live clock and the
 * measurement record. Panels are rendered from JSON, so they read from here
 * rather than taking props from a parent that knows about them.
 */
export function QlockProvider({ children }: { children: ReactNode }) {
  const clock = useClock();
  const [measurement, setMeasurement] = useState<Measurement>({ shown: null, tally: emptyTally(), total: 0 });

  // A tally only makes sense against one state, so start over each minute.
  useEffect(() => {
    setMeasurement((m) => ({ ...m, tally: emptyTally(), total: 0 }));
  }, [clock.key]);

  const sample = useCallback((n: number) => {
    setMeasurement((m) => {
      const tally = { ...m.tally };
      let last: Record<QubitName, Outcome> = { time: 0, date: 0 };
      for (let i = 0; i < n; i++) {
        last = { time: measure(clock.time.theta.value), date: measure(clock.date.theta.value) };
        tally[`${last.time}${last.date}` as Bits]++;
      }
      return { shown: last, tally, total: m.total + n };
    });
  }, [clock]);

  const value = useMemo<QlockValue>(() => ({
    clock,
    measurement,
    measureOnce: () => sample(1),
    measureMany: (n) => sample(n),
    backToNow: () => setMeasurement((m) => ({ ...m, shown: null })),
  }), [clock, measurement, sample]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useQlock(): QlockValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useQlock must be used inside <QlockProvider>");
  return v;
}
