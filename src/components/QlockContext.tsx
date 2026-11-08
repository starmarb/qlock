import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { p0, type ClockState, type Outcome, type QubitName } from "../quantum";
import { useClock } from "../hooks/env";

export type Bits = `${Outcome}${Outcome}`; // time bit, then date bit

/**
 * One measurement, drawn as a dart thrown at a unit square. The square is
 * split at x = P(time reads 0) and y = P(date reads 0), so where the dart
 * lands is the outcome: u decides the time bit and v the date bit.
 */
export interface Dart { id: number; u: number; v: number; bits: Bits; order: number }

export interface Measurement {
  /** The outcome being shown on the sphere, or null while the clock runs live. */
  shown: Record<QubitName, Outcome> | null;
  /** Darts thrown at the current state, newest last (the oldest are dropped past MAX_DARTS). */
  darts: Dart[];
  tally: Record<Bits, number>;
  total: number;
}

const MAX_DARTS = 600;

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
  const [measurement, setMeasurement] = useState<Measurement>({ shown: null, darts: [], tally: emptyTally(), total: 0 });
  const nextId = useRef(0);

  // The splits move when the minute changes, so old darts would sit in the wrong cells. Start over.
  useEffect(() => {
    setMeasurement((m) => ({ ...m, darts: [], tally: emptyTally(), total: 0 }));
  }, [clock.key]);

  const sample = useCallback((n: number) => {
    const pt = p0(clock.time.theta.value), pd = p0(clock.date.theta.value);
    const fresh: Dart[] = [];
    for (let i = 0; i < n; i++) {
      const u = Math.random(), v = Math.random();
      const bits = `${u < pt ? 0 : 1}${v < pd ? 0 : 1}` as Bits;
      fresh.push({ id: nextId.current++, u, v, bits, order: i });
    }
    const last = fresh[fresh.length - 1];
    setMeasurement((m) => {
      const tally = { ...m.tally };
      for (const d of fresh) tally[d.bits]++;
      return {
        shown: { time: Number(last.bits[0]) as Outcome, date: Number(last.bits[1]) as Outcome },
        darts: [...m.darts, ...fresh].slice(-MAX_DARTS),
        tally,
        total: m.total + n,
      };
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
