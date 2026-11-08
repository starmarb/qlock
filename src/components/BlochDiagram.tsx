import { useState } from "react";
import { Button, Tabs, Tex } from "../ds";
import { MONTHS, fracTex, readClock } from "../quantum";
import { now } from "../hooks/env";
import { makeView, onSphere, type Vec3 } from "./blochSvg";

// A labelled, flat Bloch sphere for the About page. It marks where each hour
// (or month) sits on the sphere and where each minute (or day) turns the
// hand, with a slider to scrub through the day or the year.

type Mode = "time" | "date";

const W = 460, H = 400;
const view = makeView({ az: 32, el: 24, R: 140, cx: 232, cy: 200 });
const pad = (n: number) => String(n).padStart(2, "0");
const isLeap = (y: number) => new Date(y, 1, 29).getDate() === 29;

export function BlochDiagram() {
  const [mode, setMode] = useState<Mode>("time");
  const today = now();
  const year = today.getFullYear();
  const yearDays = isLeap(year) ? 366 : 365;
  const dayOfYear = Math.floor((new Date(year, today.getMonth(), today.getDate()).getTime() - new Date(year, 0, 1).getTime()) / 864e5);
  const [minute, setMinute] = useState(today.getHours() * 60 + today.getMinutes());
  const [doy, setDoy] = useState(dayOfYear);

  const moment = mode === "time"
    ? new Date(year, today.getMonth(), today.getDate(), Math.floor(minute / 60), minute % 60)
    : new Date(year, 0, 1 + doy);
  const s = readClock(moment);
  const q = mode === "time" ? s.time : s.date;
  const tone = mode === "time" ? "ink" : "date";

  // labels along the φ = 0 meridian (where the hand sits on the hour, or on the 1st)
  const latLabels = mode === "time"
    ? [0, 6, 12, 18, 24].map((h) => ({ theta: (h / 24) * Math.PI, text: `${pad(h)}:00`, major: true }))
    : [0, 3, 6, 9, 12].map((m) => ({ theta: (m / 12) * Math.PI, text: m === 12 ? "year end" : `1 ${MONTHS[m].slice(0, 3)}`, major: true }));
  const latTicks = mode === "time" ? 24 : 12;

  // labels around the equator (how far the hand has turned)
  const days = s.days;
  const lonLabels = [0, 1, 2, 3].map((k) => ({
    phi: (k * Math.PI) / 2,
    text: mode === "time" ? `:${pad(k * 15)}` : `day ${Math.round(1 + (k * days) / 4)}`,
  }));
  const lonTicks = mode === "time" ? 60 : days;

  const tip = onSphere(q.theta.value, q.phi.value);
  const foot: Vec3 = [tip[0], tip[1], 0];
  const P = (v: Vec3, k = 1) => view.project(v, k);
  const c = P([0, 0, 0]);
  const t = P(tip), f = P(foot);

  const equator = view.curve((u) => [Math.cos(u), Math.sin(u), 0], 0, 2 * Math.PI, 144);
  const hourMeridian = view.curve((u) => onSphere(u, 0), 0, Math.PI, 72);
  const farMeridian = view.curve((u) => onSphere(u, Math.PI), 0, Math.PI, 72);
  const rings = [Math.PI / 4, (3 * Math.PI) / 4].map((th) => view.curve((u) => onSphere(th, u), 0, 2 * Math.PI, 120));
  const thetaArc = view.curve((u) => { const p = onSphere(u, q.phi.value); return [p[0] * 0.3, p[1] * 0.3, p[2] * 0.3]; }, 0, q.theta.value, 40);
  const phiArc = view.curve((u) => [0.36 * Math.cos(u), 0.36 * Math.sin(u), 0], 0, q.phi.value, 40);
  const thetaMid = P(onSphere(q.theta.value / 2, q.phi.value), 0.42);
  const phiMid = P([Math.cos(q.phi.value / 2), Math.sin(q.phi.value / 2), 0], 0.5);

  const label = mode === "time"
    ? `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
    : `${s.D} ${MONTHS[s.M - 1]}`;
  const resetValue = mode === "time" ? today.getHours() * 60 + today.getMinutes() : dayOfYear;
  const atNow = (mode === "time" ? minute : doy) === resetValue;

  const paths = (runs: { front: string[]; back: string[] }, cls: string) => (
    <>
      {runs.back.map((d, i) => <path key={`b${i}`} d={d} className={`${cls} is-back`} />)}
      {runs.front.map((d, i) => <path key={`f${i}`} d={d} className={cls} />)}
    </>
  );

  return (
    <figure className={`diagram${mode === "date" ? " is-date" : ""}`}>
      <Tabs idPrefix="diagram" label="Which qubit to show" value={mode} onChange={setMode}
        items={[{ id: "time", label: "Time qubit" }, { id: "date", label: "Date qubit" }]} />
      <div id="diagram-panel" role="tabpanel" aria-labelledby={`diagram-tab-${mode}`}>
        <svg className={`diagram__svg diagram--${tone}`} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`Bloch sphere for the ${mode} qubit at ${label}: θ = ${q.theta.n}π/${q.theta.d}, φ = ${q.phi.n}π/${q.phi.d}`}>
          <circle cx={view.cx} cy={view.cy} r={view.R} className="d-outline" />
          {rings.map((r, i) => <g key={i}>{paths(r, "d-ring")}</g>)}
          {paths(farMeridian, "d-grid")}
          {paths(equator, "d-equator")}
          {paths(hourMeridian, "d-meridian")}
          <line x1={P([0, 0, -1]).x} y1={P([0, 0, -1]).y} x2={P([0, 0, 1]).x} y2={P([0, 0, 1]).y} className="d-axis" />

          {/* ticks and labels on the φ = 0 meridian */}
          {Array.from({ length: latTicks + 1 }, (_, i) => {
            const th = (i / latTicks) * Math.PI;
            const a = P(onSphere(th, 0)), b = P(onSphere(th, 0), i % (latTicks / 4) === 0 ? 1.07 : 1.04);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="d-tick" />;
          })}
          {latLabels.map((l) => {
            const p = P(onSphere(l.theta, 0), 1.1);
            const dy = l.theta === 0 ? -2 : l.theta === Math.PI ? 12 : 4;
            return <text key={l.text} x={p.x - 4} y={p.y + dy} className="d-label d-label--lat" textAnchor="end">{l.text}</text>;
          })}

          {/* ticks and labels around the equator */}
          {Array.from({ length: lonTicks }, (_, i) => {
            const ph = (i / lonTicks) * 2 * Math.PI;
            const major = (i * 4) % lonTicks === 0;
            const a = P([Math.cos(ph), Math.sin(ph), 0]), b = P([Math.cos(ph), Math.sin(ph), 0], major ? 1.07 : 1.035);
            return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={`d-tick${a.depth < 0 ? " is-back" : ""}`} />;
          })}
          {lonLabels.map((l) => {
            const v: Vec3 = [Math.cos(l.phi), Math.sin(l.phi), 0];
            const p = P(v, 1.13);
            const back = P(v).depth < 0;
            const anchor = p.x < view.cx - 20 ? "end" : p.x > view.cx + 20 ? "start" : "middle";
            // the :00 mark shares its spot with 12:00, so its label drops below the equator
            const dy = l.phi === 0 ? 18 : 4;
            return <text key={l.text} x={p.x} y={p.y + dy} className={`d-label${back ? " is-back" : ""}`} textAnchor={anchor}>{l.text}</text>;
          })}

          {/* the poles */}
          <circle cx={P([0, 0, 1]).x} cy={P([0, 0, 1]).y} r={3.5} className="d-pole" />
          <circle cx={P([0, 0, -1]).x} cy={P([0, 0, -1]).y} r={3.5} className="d-pole d-pole--one" />
          <text x={P([0, 0, 1]).x + 10} y={P([0, 0, 1]).y - 6} className="d-ket">|0⟩</text>
          <text x={P([0, 0, -1]).x + 10} y={P([0, 0, -1]).y + 16} className="d-ket d-ket--one">|1⟩</text>

          {/* the hand, its shadow on the equator, and its two angles */}
          <line x1={c.x} y1={c.y} x2={f.x} y2={f.y} className="d-shadow" />
          <line x1={t.x} y1={t.y} x2={f.x} y2={f.y} className="d-shadow" />
          {paths(thetaArc, "d-arc")}
          {paths(phiArc, "d-arc")}
          {q.theta.value > 0.15 && <text x={thetaMid.x + 4} y={thetaMid.y} className="d-greek">θ</text>}
          {q.phi.value > 0.25 && <text x={phiMid.x} y={phiMid.y + 4} className="d-greek" textAnchor="middle">φ</text>}
          <line x1={c.x} y1={c.y} x2={t.x} y2={t.y} className="d-hand" />
          <circle cx={t.x} cy={t.y} r={5} className="d-tip" />
          <circle cx={c.x} cy={c.y} r={2.5} className="d-origin" />
        </svg>
      </div>

      <div className="diagram__scrub">
        <label htmlFor="diagram-scrub">{mode === "time" ? "Drag through the day" : "Drag through the year"}</label>
        <output htmlFor="diagram-scrub" className="diagram__value">{label}</output>
        <input id="diagram-scrub" type="range" min={0} max={mode === "time" ? 1439 : yearDays - 1}
          value={mode === "time" ? minute : doy}
          onChange={(e) => (mode === "time" ? setMinute : setDoy)(Number(e.target.value))} />
        <Button variant="quiet" disabled={atNow} onClick={() => (mode === "time" ? setMinute : setDoy)(resetValue)}>Back to now</Button>
      </div>

      <figcaption className="diagram__caption">
        {mode === "time" ? (
          <>The hour sets <Tex src={`\\theta = ${fracTex(q.theta)}`} />, how far the hand has tipped from <Tex src="\ket{0}" />.
            The minute sets <Tex src={`\\phi = ${fracTex(q.phi)}`} />, how far it has turned around the equator. On the hour,
            the hand lies on the labelled meridian; over the next 60 minutes it swings once around.</>
        ) : (
          <>The month sets <Tex src={`\\theta = ${fracTex(q.theta)}`} />, and the day of the month sets{" "}
            <Tex src={`\\phi = ${fracTex(q.phi)}`} />. On the 1st of each month the hand lies on the labelled meridian, then
            swings once around the sphere by the end of the month.</>
        )}
      </figcaption>
    </figure>
  );
}
