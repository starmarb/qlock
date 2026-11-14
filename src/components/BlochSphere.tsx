import { useEffect, useRef, useState } from "react";
import { BlochScene, webglAvailable, type SceneStats } from "../sphere/BlochScene";
import { blochVector } from "../quantum";
import { debug, useReducedMotion, useThemeColors } from "../hooks/env";
import { useQlock } from "./QlockContext";

/**
 * React owns the lifecycle; BlochScene owns the GPU. The scene is created once
 * and fed new hand angles, colours and which qubits are shown through effects,
 * so a re-render never rebuilds a buffer or recompiles a shader.
 */
export function BlochSphere({ caption }: { caption: string }) {
  const { clock, shown } = useQlock();
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
    const scene = new BlochScene(stageRef.current, colors, { reducedMotion, shown });
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
  useEffect(() => { sceneRef.current?.setShown(shown); }, [shown]);

  const label = shown.time && shown.date
    ? "Bloch sphere showing the time and date qubits"
    : `Bloch sphere showing the ${shown.time ? "time" : "date"} qubit`;

  return (
    <figure className="sphere">
      {supported ? (
        <div className="sphere__stage" ref={stageRef} role="img" aria-label={label}>
          <span className="sphere__pole sphere__pole--zero" ref={zeroRef} aria-hidden="true">|0⟩</span>
          <span className="sphere__pole" ref={oneRef} aria-hidden="true">|1⟩</span>
        </div>
      ) : (
        <FallbackSphere timeDir={shown.time ? timeDir : null} dateDir={shown.date ? dateDir : null} label={label} />
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

/** A still SVG of the same view for browsers without WebGL. */
function FallbackSphere({ timeDir, dateDir, label }: {
  timeDir: [number, number, number] | null;
  dateDir: [number, number, number] | null;
  label: string;
}) {
  // fixed oblique projection: x toward the viewer-left, y right, z up
  const P = ([x, y, z]: [number, number, number]) => [200 + 150 * (y - 0.45 * x), 200 - 150 * (z - 0.3 * x)];
  const hand = (dir: [number, number, number] | null, color: string) => {
    if (!dir) return null;
    const [x, y] = P(dir);
    return (
      <>
        <line x1="200" y1="200" x2={x} y2={y} stroke={color} strokeWidth="2.5" />
        <circle cx={x} cy={y} r="5" fill={color} />
      </>
    );
  };
  return (
    <div className="sphere__stage sphere__fallback" role="img" aria-label={label}>
      <svg viewBox="0 0 400 400">
        <circle cx="200" cy="200" r="150" fill="none" stroke="var(--color-rule)" />
        <ellipse cx="200" cy="200" rx="150" ry="45" fill="none" stroke="var(--color-rule)" />
        {hand(dateDir, "var(--color-date)")}
        {hand(timeDir, "var(--color-ink)")}
        <text x="212" y="44" fill="var(--color-ink)" fontFamily="var(--font-math)">|0⟩</text>
        <text x="212" y="372" fill="var(--color-muted)" fontFamily="var(--font-math)">|1⟩</text>
      </svg>
    </div>
  );
}
