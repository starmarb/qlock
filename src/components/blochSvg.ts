// Orthographic projection of the Bloch sphere into SVG, for the flat
// diagrams (the About page, the sandbox's small spheres, the no-WebGL
// fallback). z is up, so |0⟩ sits at the top.

export type Vec3 = [number, number, number];
export interface Pt { x: number; y: number; depth: number } // depth > 0 faces the viewer

export interface View {
  project: (p: Vec3, scale?: number) => Pt;
  /** Split a curve into front and back runs, as SVG path data. */
  curve: (f: (t: number) => Vec3, t0: number, t1: number, steps?: number) => { front: string[]; back: string[] };
  R: number; cx: number; cy: number;
}

export function makeView({ az = 32, el = 18, R, cx, cy }: { az?: number; el?: number; R: number; cx: number; cy: number }): View {
  const a = (az * Math.PI) / 180, e = (el * Math.PI) / 180;
  const right: Vec3 = [-Math.sin(a), Math.cos(a), 0];
  const up: Vec3 = [-Math.sin(e) * Math.cos(a), -Math.sin(e) * Math.sin(a), Math.cos(e)];
  const toward: Vec3 = [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)];
  const dot = (p: Vec3, q: Vec3) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];

  const project = (p: Vec3, scale = 1): Pt => {
    const q: Vec3 = [p[0] * scale, p[1] * scale, p[2] * scale];
    return { x: cx + R * dot(q, right), y: cy - R * dot(q, up), depth: dot(p, toward) };
  };

  const curve: View["curve"] = (f, t0, t1, steps = 96) => {
    const front: string[] = [], back: string[] = [];
    let run = "", runFront: boolean | null = null;
    const flush = () => {
      if (run && runFront !== null) (runFront ? front : back).push(run);
      run = "";
    };
    let prev: Pt | null = null;
    for (let i = 0; i <= steps; i++) {
      const p = project(f(t0 + ((t1 - t0) * i) / steps));
      const isFront = p.depth >= -1e-9;
      if (runFront !== isFront) {
        flush();
        runFront = isFront;
        // start the new run where the old one ended so there is no gap
        run = prev ? `M${prev.x.toFixed(2)},${prev.y.toFixed(2)}L${p.x.toFixed(2)},${p.y.toFixed(2)}` : `M${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      } else {
        run += `L${p.x.toFixed(2)},${p.y.toFixed(2)}`;
      }
      prev = p;
    }
    flush();
    return { front, back };
  };

  return { project, curve, R, cx, cy };
}

export const onSphere = (theta: number, phi: number): Vec3 =>
  [Math.sin(theta) * Math.cos(phi), Math.sin(theta) * Math.sin(phi), Math.cos(theta)];
