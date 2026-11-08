import { Button } from "../ds";
import { jointProbabilities, p0, percent } from "../quantum";
import { useQlock, type Bits } from "./QlockContext";

// "If you measured now": the odds drawn as a square split by each qubit's
// chances, and each measurement as a dart that lands somewhere in it. The cell
// a dart lands in is what the clock reads, so the cells fill up in proportion
// to their odds as you keep measuring.

const S = 300;              // the square, in SVG units
const TOP = 46, RIGHT = 92; // room for the labels
const W = S + RIGHT, H = TOP + S + 2;

export function MeasurePanel({ title, note }: { title: string; note: string }) {
  const { clock, measurement, measureOnce, measureMany, backToNow } = useQlock();
  const pt = p0(clock.time.theta.value), pd = p0(clock.date.theta.value);
  const joint = jointProbabilities(clock.time.theta.value, clock.date.theta.value);
  const { shown, darts, tally, total } = measurement;
  const hit = shown ? (`${shown.time}${shown.date}` as Bits) : null;
  const latest = darts[darts.length - 1];

  const xSplit = pt * S, ySplit = TOP + pd * S;
  const cells = joint.map((j) => {
    const [t, d] = j.bits;
    const x = t === 0 ? 0 : xSplit, w = t === 0 ? xSplit : S - xSplit;
    const y = d === 0 ? TOP : ySplit, h = d === 0 ? ySplit - TOP : TOP + S - ySplit;
    return { bits: j.bits.join("") as Bits, t, d, p: j.p, x, y, w, h };
  });

  const chance = hit ? cells.find((c) => c.bits === hit)!.p : 0;

  return (
    <section className="measure" aria-labelledby="measure-heading">
      <h2 id="measure-heading">{title}</h2>
      <p className="measure__note">{note}</p>

      <div className="measure__body">
        <svg className="mosaic" viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Time reads 0 with ${percent(pt)} chance; date reads 0 with ${percent(pd)} chance.${total ? ` ${total} measurements so far.` : ""}`}>
          {/* cells: the time-reads-1 column is tinted with ink, the date-reads-1 row with pink */}
          {cells.map((c) => (
            <g key={c.bits} className={`mosaic__cell${hit === c.bits ? " is-hit" : ""}`}>
              <rect x={c.x} y={c.y} width={c.w} height={c.h} className="mosaic__base" />
              {c.t === 1 && <rect x={c.x} y={c.y} width={c.w} height={c.h} className="mosaic__tint mosaic__tint--time" />}
              {c.d === 1 && <rect x={c.x} y={c.y} width={c.w} height={c.h} className="mosaic__tint mosaic__tint--date" />}
              <rect x={c.x} y={c.y} width={c.w} height={c.h} className="mosaic__frame" />
            </g>
          ))}

          {/* darts */}
          <g className="mosaic__darts">
            {darts.map((d) => (
              <circle key={d.id} cx={d.u * S} cy={TOP + d.v * S} r={2.4}
                className={`dart dart--${d.bits}`} style={{ animationDelay: `${Math.min(d.order * 7, 900)}ms` }} />
            ))}
            {latest && shown && (
              <g key={`hit-${latest.id}`} style={{ animationDelay: `${Math.min(latest.order * 7, 900)}ms` }} className="dart-hit">
                <circle cx={latest.u * S} cy={TOP + latest.v * S} r={14} className="dart-hit__ring" />
                <circle cx={latest.u * S} cy={TOP + latest.v * S} r={4.5} className="dart-hit__dot" />
              </g>
            )}
          </g>

          {/* cell labels sit above the darts so they stay readable */}
          {cells.map((c) => {
            const big = c.w >= 64 && c.h >= 46, small = !big && c.w >= 26 && c.h >= 20;
            if (!big && !small) return null;
            const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
            return (
              <g key={`l${c.bits}`} className="mosaic__label">
                <text x={cx} y={big ? cy - (total > 0 ? 10 : 4) : cy + 4} textAnchor="middle" className={`mosaic__ket${big ? "" : " is-small"}`}>
                  |<tspan className="k-time">{c.bits[0]}</tspan><tspan className="k-date">{c.bits[1]}</tspan>⟩
                </text>
                {big && <text x={cx} y={cy + (total > 0 ? 8 : 14)} textAnchor="middle" className="mosaic__pct">
                  {percent(c.p)} chance
                </text>}
                {big && total > 0 && <text x={cx} y={cy + 22} textAnchor="middle" className="mosaic__pct mosaic__pct--count">
                  {c.w >= 132 ? `${tally[c.bits]} of ${total} landed here` : `${tally[c.bits]} landed`}
                </text>}
              </g>
            );
          })}

          {/* the two splits, each in its qubit's colour */}
          <line x1={xSplit} y1={TOP - 8} x2={xSplit} y2={TOP + S} className="mosaic__split mosaic__split--time" />
          <line x1={0} y1={ySplit} x2={S + 8} y2={ySplit} className="mosaic__split mosaic__split--date" />

          {/* time odds along the top */}
          <text x={0} y={14} className="mosaic__axis mosaic__axis--time">time</text>
          <text x={0} y={TOP - 14} className="mosaic__odds">reads 0 · {percent(pt)}</text>
          <text x={S} y={TOP - 14} className="mosaic__odds" textAnchor="end">{percent(1 - pt)} · reads 1</text>

          {/* date odds down the right, labelling the top and bottom rows */}
          <text x={S + 14} y={14} className="mosaic__axis mosaic__axis--date">date</text>
          <text x={S + 14} y={TOP + 10} className="mosaic__odds">reads 0</text>
          <text x={S + 14} y={TOP + 25} className="mosaic__odds mosaic__odds--muted">{percent(pd)}</text>
          <text x={S + 14} y={TOP + S - 17} className="mosaic__odds">reads 1</text>
          <text x={S + 14} y={TOP + S - 2} className="mosaic__odds mosaic__odds--muted">{percent(1 - pd)}</text>
        </svg>

        <div className="measure__side">
          <div className="reading" aria-live="polite">
            <div className={`reading__ket${shown ? " is-measured" : ""}`} key={shown ? latest?.id : "psi"}>
              {shown ? (
                <>|<span className="k-time">{shown.time}</span><span className="k-date">{shown.date}</span>⟩</>
              ) : (
                <>|ψ⟩</>
              )}
            </div>
            <p className="reading__text">
              {shown ? (
                <>Time read <b>{shown.time}</b>, date read <b>{shown.date}</b> with a {percent(chance)} chance.</>
              ) : (
                <>Not measured yet, so both qubits are still in superposition.</>
              )}
            </p>
            {total > 0 && (
              <p className="reading__count">
                {total} measurement{total === 1 ? "" : "s"} so far, one dot each. The dots clear when the minute
                changes, because the odds move with the clock.
              </p>
            )}
          </div>
          <div className="measure__actions">
            <Button onClick={measureOnce}>Measure</Button>
            <Button variant="quiet" onClick={() => measureMany(100)}>Measure 100 times</Button>
            <Button variant="quiet" onClick={backToNow} disabled={!shown}>Back to now</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
