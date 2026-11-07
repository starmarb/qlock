import { useEffect, useRef, useState } from "react";
import { BlochScene, webglAvailable, type SceneStats } from "../sphere/BlochScene";
import { blochVector } from "../quantum";
import { debug, useReducedMotion, useThemeColors } from "../hooks/env";
import { useQlock } from "./QlockContext";

/**
 * React owns the lifecycle; BlochScene owns the GPU. The scene is created once
 * and fed new hand angles, colours and measurements through effects, so a
 * re-render never rebuilds a buffer or recompiles a shader.
 */
export function BlochSphere({ caption }: { caption: string }) {
  const { clock, measurement } = useQlock();
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);
  const zeroRef = useRef<HTMLSpanElement>(null);
  const oneRef = useRef<HTMLSpanElement>(null);
  const sceneRef = useRef<BlochScene | null>(null);
  const [supported] = useState(webglAvailable);
  const [stats, setStats] = useState<SceneStats | null>(null);

  const timeDir = blochVector(clock.time.theta.value, clock.time.phi.value);
  const dateDir = blochVector(clock.date.theta.value, clock.date.phi.value);

  useEffect(() => {
    if (!supported || !stageRef.current) return;
    const scene = new BlochScene(stageRef.current, colors, { reducedMotion });
    scene.onPoles = (zero, one) => {
      // move the |0⟩ and |1⟩ labels with the camera, without a React render
      if (zeroRef.current) zeroRef.current.style.transform = `translate(${zero.x + 8}px, ${zero.y - 26}px)`;
      if (oneRef.current) oneRef.current.style.transform = `translate(${one.x + 8}px, ${one.y + 2}px)`;
    };
    if (debug) {
      scene.onFrame = () => setStats({ ...scene.stats });
      (window as unknown as { qlockScene: BlochScene }).qlockScene = scene; // for poking at in devtools
    }
    sceneRef.current = scene;
    return () => { scene.dispose(); sceneRef.current = null; };
    // created once; the effects below keep it current
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  useEffect(() => { sceneRef.current?.setHands({ time: timeDir, date: dateDir }); }, [clock.key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sceneRef.current?.setColors(colors); }, [colors]);
  useEffect(() => { sceneRef.current?.setReducedMotion(reducedMotion); }, [reducedMotion]);
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (measurement.shown) scene.collapse(measurement.shown);
    else scene.release();
  }, [measurement.shown]);

  const label = measurement.shown
    ? `Bloch sphere after measurement: time reads ${measurement.shown.time}, date reads ${measurement.shown.date}`
    : "Bloch sphere showing the time and date qubits";

  return (
    <figure className="sphere">
      {supported ? (
        <div className="sphere__stage" ref={stageRef} role="img" aria-label={label}>
          <span className="sphere__pole sphere__pole--zero" ref={zeroRef} aria-hidden="true">|0⟩</span>
          <span className="sphere__pole" ref={oneRef} aria-hidden="true">|1⟩</span>
        </div>
      ) : (
        <FallbackSphere timeDir={measurement.shown ? pole(measurement.shown.time) : timeDir}
          dateDir={measurement.shown ? pole(measurement.shown.date) : dateDir} label={label} />
      )}
      <figcaption>{supported ? caption : "Your browser has WebGL turned off, so this is a still drawing of the sphere."}</figcaption>
      {debug && stats && (
        <div className="debug" aria-hidden="true">
          {stats.rendering ? `${stats.fps} fps` : "idle (no frames)"}<br />
          {stats.frameMs.toFixed(2)} ms CPU / frame<br />
          {stats.drawCalls} draw calls<br />
          motion {reducedMotion ? "reduced" : "on"}
        </div>
      )}
    </figure>
  );
}

const pole = (bit: 0 | 1): [number, number, number] => [0, 0, bit === 0 ? 1 : -1];

/** A still SVG of the same view for browsers without WebGL. */
function FallbackSphere({ timeDir, dateDir, label }: {
  timeDir: [number, number, number];
  dateDir: [number, number, number];
  label: string;
}) {
  // fixed oblique projection: x toward the viewer-left, y right, z up
  const P = ([x, y, z]: [number, number, number]) => [200 + 150 * (y - 0.45 * x), 200 - 150 * (z - 0.3 * x)];
  const [tx, ty] = P(timeDir);
  const [dx, dy] = P(dateDir);
  return (
    <div className="sphere__stage sphere__fallback" role="img" aria-label={label}>
      <svg viewBox="0 0 400 400">
        <circle cx="200" cy="200" r="150" fill="none" stroke="var(--color-rule)" />
        <ellipse cx="200" cy="200" rx="150" ry="45" fill="none" stroke="var(--color-rule)" />
        <line x1="200" y1="200" x2={dx} y2={dy} stroke="var(--color-date)" strokeWidth="2.5" />
        <circle cx={dx} cy={dy} r="5" fill="var(--color-date)" />
        <line x1="200" y1="200" x2={tx} y2={ty} stroke="var(--color-ink)" strokeWidth="2.5" />
        <circle cx={tx} cy={ty} r="5" fill="var(--color-ink)" />
        <text x="212" y="44" fill="var(--color-ink)" fontFamily="var(--font-math)">|0⟩</text>
        <text x="212" y="372" fill="var(--color-muted)" fontFamily="var(--font-math)">|1⟩</text>
      </svg>
    </div>
  );
}
