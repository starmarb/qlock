import { useState } from "react";
import { Button, Swatch, Tex } from "../ds";
import { MONTHS, fracTex, readClock, type QubitName } from "../quantum";
import { now } from "../hooks/env";
import { makeView, onSphere, type Vec3 } from "./blochSvg";

// A labelled, flat Bloch sphere for the About page, with both hands on it.
// The labels mark where each hand sits at a few key moments: on the left
// meridian, the hour (black) and month (pink) that tip a hand that far; around
// the equator, the minute and day that turn it that far. Two sliders step
// through the day and the year in coarse jumps that land on those labels.

const W = 460, H = 410;
const view = makeView({ az: 32, el: 24, R: 140, cx: 236, cy: 200 });
const pad = (n: number) => String(n).padStart(2, "0");

const TIME_STEP = 15;           // minutes per slider step
const TIME_STOPS = (24 * 60) / TIME_STEP;
const DATE_STOPS = 12 * 4;      // four stops per month, a quarter turn apart

/** Day of the month for stop k (0–3) in a month of `days` days: a quarter turn apart. */
const dayAt = (k: number, days: number) => Math.round(1 + (k * days) / 4);
const daysIn = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();

export function BlochDiagram() {
  const today = now();
  const year = today.getFullYear();
  const nowTime = Math.round((today.getHours() * 60 + today.getMinutes()) / TIME_STEP) % TIME_STOPS;
  const nowDate = (() => {
    const m = today.getMonth(), days = daysIn(year, m);
    let best = 0;
    for (let k = 0; k < 4; k++) if (Math.abs(dayAt(k, days) - today.getDate()) < Math.abs(dayAt(best, days) - today.getDate())) best = k;
    return m * 4 + best;
  })();

  const [timeStop, setTimeStop] = useState(nowTime);
  const [dateStop, setDateStop] = useState(nowDate);
  const [focus, setFocus] = useState<QubitName>("time");

  const minutes = timeStop * TIME_STEP;
  const month0 = Math.floor(dateStop / 4);
  const monthDays = daysIn(year, month0);
  const day = dayAt(dateStop % 4, monthDays);
  const s = readClock(new Date(year, month0, day, Math.floor(minutes / 60), minutes % 60));

  const P = (v: Vec3, k = 1) => view.project(v, k);
  const c = P([0, 0, 0]);
  const hands = (["date", "time"] as QubitName[]).map((q) => {
    const tip = onSphere(s[q].theta.value, s[q].phi.value);
    return { q, t: P(tip), f: P([tip[0], tip[1], 0]) };
  });

  // labels along the φ = 0 meridian: where a hand sits on the hour, or on the 1st
  const latLabels = [0, 1, 2, 3, 4].map((k) => ({
    theta: (k / 4) * Math.PI,
    time: `${pad(k * 6)}:00`,
    date: k === 4 ? "year end" : `1 ${MONTHS[k * 3].slice(0, 3)}`,
  }));
  // labels around the equator: how far the minute or the day has turned the hand
  const lonLabels = [0, 1, 2, 3].map((k) => ({
    phi: (k * Math.PI) / 2,
    time: `:${pad(k * 15)}`,
    date: `day ${dayAt(k, monthDays)}`,
  }));

  const equator = view.curve((u) => [Math.cos(u), Math.sin(u), 0], 0, 2 * Math.PI, 144);
  const hourMeridian = view.curve((u) => onSphere(u, 0), 0, Math.PI, 72);
  const farMeridian = view.curve((u) => onSphere(u, Math.PI), 0, Math.PI, 72);
  const rings = [Math.PI / 4, (3 * Math.PI) / 4].map((th) => view.curve((u) => onSphere(th, u), 0, 2 * Math.PI, 120));

  // angle arcs for whichever hand was moved last
  const fq = s[focus];
  const thetaArc = view.curve((u) => { const p = onSphere(u, fq.phi.value); return [p[0] * 0.3, p[1] * 0.3, p[2] * 0.3]; }, 0, fq.theta.value, 40);
  const phiArc = view.curve((u) => [0.36 * Math.cos(u), 0.36 * Math.sin(u), 0], 0, fq.phi.value, 40);
  const thetaMid = P(onSphere(fq.theta.value / 2, fq.phi.value), 0.42);
  const phiMid = P([Math.cos(fq.phi.value / 2), Math.sin(fq.phi.value / 2), 0], 0.5);

  const timeText = `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  const dateText = `${day} ${MONTHS[month0]}`;
  const atNow = timeStop === nowTime && dateStop === nowDate;

  const paths = (runs: { front: string[]; back: string[] }, cls: string) => (
    <>
      {runs.back.map((d, i) => <path key={`b${i}`} d={d} className={`${cls} is-back`} />)}
      {runs.front.map((d, i) => <path key={`f${i}`} d={d} className={cls} />)}
    </>
  );
  const tick = (v: Vec3, i: number) => {
    const a = P(v), b = P(v, 1.07);
    return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`d-tick${a.depth < 0 ? " is-back" : ""}`} />;
  };

  return (
    <figure className="diagram">
      <svg className={`diagram__svg diagram--focus-${focus}`} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Bloch sphere at ${timeText} on ${dateText}. Time hand: θ = ${s.time.theta.n}π/${s.time.theta.d}, φ = ${s.time.phi.n}π/${s.time.phi.d}. Date hand: θ = ${s.date.theta.n}π/${s.date.theta.d}, φ = ${s.date.phi.n}π/${s.date.phi.d}.`}>
        <circle cx={view.cx} cy={view.cy} r={view.R} className="d-outline" />
        {rings.map((r, i) => <g key={i}>{paths(r, "d-ring")}</g>)}
        {paths(farMeridian, "d-grid")}
        {paths(equator, "d-equator")}
        {paths(hourMeridian, "d-meridian")}
        <line x1={P([0, 0, -1]).x} y1={P([0, 0, -1]).y} x2={P([0, 0, 1]).x} y2={P([0, 0, 1]).y} className="d-axis" />

        {latLabels.map((l, i) => tick(onSphere(l.theta, 0), i))}
        {lonLabels.map((l, i) => tick([Math.cos(l.phi), Math.sin(l.phi), 0], 10 + i))}

        {latLabels.map((l, i) => {
          const p = P(onSphere(l.theta, 0), 1.1);
          // stack the hour over the month; at the poles, push the pair clear of the pole
          const y0 = i === 0 ? p.y - 18 : i === 4 ? p.y + 10 : p.y - 3;
          return (
            <text key={l.time} x={p.x - 4} y={y0} textAnchor="end" className="d-label">
              <tspan className="d-l-time">{l.time}</tspan>
              <tspan x={p.x - 4} dy={14} className="d-l-date">{l.date}</tspan>
            </text>
          );
        })}
        {lonLabels.map((l) => {
          const v: Vec3 = [Math.cos(l.phi), Math.sin(l.phi), 0];
          const p = P(v, 1.14);
          const back = P(v).depth < 0;
          const anchor = p.x < view.cx - 20 ? "end" : p.x > view.cx + 20 ? "start" : "middle";
          // :00 shares its spot with 12:00, so it drops below the equator
          const y0 = l.phi === 0 ? p.y + 26 : p.y - 2;
          return (
            <text key={l.time} x={p.x} y={y0} textAnchor={anchor} className={`d-label${back ? " is-back" : ""}`}>
              <tspan className="d-l-time">{l.time}</tspan>
              <tspan x={p.x} dy={14} className="d-l-date">{l.date}</tspan>
            </text>
          );
        })}

        <circle cx={P([0, 0, 1]).x} cy={P([0, 0, 1]).y} r={3.5} className="d-pole" />
        <circle cx={P([0, 0, -1]).x} cy={P([0, 0, -1]).y} r={3.5} className="d-pole d-pole--one" />
        <text x={P([0, 0, 1]).x + 10} y={P([0, 0, 1]).y - 6} className="d-ket">|0⟩</text>
        <text x={P([0, 0, -1]).x + 10} y={P([0, 0, -1]).y + 16} className="d-ket d-ket--one">|1⟩</text>

        {hands.map((h) => (
          <g key={`s${h.q}`}>
            <line x1={c.x} y1={c.y} x2={h.f.x} y2={h.f.y} className="d-shadow" />
            <line x1={h.t.x} y1={h.t.y} x2={h.f.x} y2={h.f.y} className="d-shadow" />
          </g>
        ))}
        {paths(thetaArc, "d-arc")}
        {paths(phiArc, "d-arc")}
        {fq.theta.value > 0.15 && <text x={thetaMid.x + 4} y={thetaMid.y} className="d-greek">θ</text>}
        {fq.phi.value > 0.25 && <text x={phiMid.x} y={phiMid.y + 4} className="d-greek" textAnchor="middle">φ</text>}
        {hands.map((h) => (
          <g key={h.q} className={`d-hand-${h.q}${focus === h.q ? " is-focus" : ""}`}>
            <line x1={c.x} y1={c.y} x2={h.t.x} y2={h.t.y} className="d-hand" />
            <circle cx={h.t.x} cy={h.t.y} r={5} className="d-tip" />
          </g>
        ))}
        <circle cx={c.x} cy={c.y} r={2.5} className="d-origin" />
      </svg>

      <div className="diagram__scrub">
        <label htmlFor="diagram-time"><Swatch />Time</label>
        <input id="diagram-time" type="range" min={0} max={TIME_STOPS - 1} value={timeStop} className="is-time"
          onChange={(e) => { setTimeStop(Number(e.target.value)); setFocus("time"); }} onFocus={() => setFocus("time")} />
        <output htmlFor="diagram-time" className="diagram__value">{timeText}</output>

        <label htmlFor="diagram-date"><Swatch tone="date" />Date</label>
        <input id="diagram-date" type="range" min={0} max={DATE_STOPS - 1} value={dateStop} className="is-date"
          onChange={(e) => { setDateStop(Number(e.target.value)); setFocus("date"); }} onFocus={() => setFocus("date")} />
        <output htmlFor="diagram-date" className="diagram__value">{dateText}</output>
      </div>
      <div className="diagram__reset">
        <Button variant="quiet" disabled={atNow} onClick={() => { setTimeStop(nowTime); setDateStop(nowDate); }}>Back to now</Button>
      </div>

      <figcaption className="diagram__caption">
        The hour and the month set <Tex src="\theta" />, how far each hand tips away from <Tex src="\ket{0}" />.
        The minute and the day set <Tex src="\phi" />, how far it turns around the equator. Right now the{" "}
        {focus === "time" ? "time" : "date"} hand is at{" "}
        <Tex src={`\\theta = ${fracTex(fq.theta)},\\ \\phi = ${fracTex(fq.phi)}`} />.
      </figcaption>
    </figure>
  );
}
