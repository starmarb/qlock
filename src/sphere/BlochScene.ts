import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { shellVertex, shellFragment, solidVertex, solidFragment } from "./shaders";
import type { QubitName, Outcome } from "../quantum";

export interface SceneColors { ink: string; muted: string; rule: string; date: string }

export interface SceneStats { fps: number; frameMs: number; drawCalls: number; rendering: boolean }

const HAND_RADIUS = 0.013;
const TIP_RADIUS = 0.04;
const COLLAPSE_MS = 650;
const PULSE_MS = 1400;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface Hand {
  group: THREE.Group;
  rod: THREE.Mesh;
  tip: THREE.Mesh;
  material: THREE.ShaderMaterial;
  live: THREE.Vector3;     // where the clock says the hand points
  shown: THREE.Vector3;    // where it is drawn right now
  from: THREE.Vector3;     // start of the current animation
  to: THREE.Vector3;       // end of the current animation
  animStart: number;       // ms, < 0 when idle
  collapsed: boolean;
}

/**
 * Owns the WebGL renderer for the Bloch sphere. React mounts it into a div and
 * talks to it through a small imperative API (setHands, setColors, collapse,
 * release); it never re-creates the scene on re-render.
 *
 * Frames are only drawn when something changes: the camera moves, a hand
 * animates, or the ambient wave is running. With reduced motion on and nothing
 * moving, the GPU is idle.
 */
export class BlochScene {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private bloch = new THREE.Group();   // Bloch frame: z up, rotated into three's y-up world
  private shellBack: THREE.ShaderMaterial;
  private shellFront: THREE.ShaderMaterial;
  private hands: Record<QubitName, Hand>;
  private poles: { zero: THREE.Mesh; one: THREE.Mesh; origin: THREE.Mesh };
  private host: HTMLElement;
  private resizeObserver: ResizeObserver;
  private visibilityObserver: IntersectionObserver;
  private raf = 0;
  private dirty = true;
  private onScreen = true;
  private motion = true;
  private start = performance.now();
  private pulseStart = -1;
  private disposed = false;

  // frame stats for ?debug
  private frames = 0;
  private statWindowStart = performance.now();
  private lastFrameMs = 0;
  stats: SceneStats = { fps: 0, frameMs: 0, drawCalls: 0, rendering: false };
  onFrame?: () => void;

  /** Called each frame with the screen position of the |0⟩ and |1⟩ poles. */
  onPoles?: (zero: { x: number; y: number }, one: { x: number; y: number }) => void;

  constructor(host: HTMLElement, colors: SceneColors, opts: { reducedMotion: boolean }) {
    this.host = host;
    this.motion = !opts.reducedMotion;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    this.resetCamera();

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableZoom = false;       // leave the scroll wheel to the page
    this.controls.enablePan = false;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.rotateSpeed = 0.7;
    this.controls.addEventListener("change", () => this.invalidate());
    this.renderer.domElement.addEventListener("dblclick", () => {
      this.resetCamera();
      this.controls.update();
      this.invalidate();
    });

    // Bloch z (|0⟩) points up the screen: rotate -90° about x so z → y.
    this.bloch.rotation.x = -Math.PI / 2;
    this.scene.add(this.bloch);

    // Shell: same geometry twice, back faces first so the near glass sits on top.
    const shellGeo = new THREE.SphereGeometry(1, 160, 80);
    const shellUniforms = () => ({
      uInk: { value: new THREE.Color() },
      uRule: { value: new THREE.Color() },
      uDate: { value: new THREE.Color() },
      uPulseColor: { value: new THREE.Color() },
      uTimeDir: { value: new THREE.Vector3(0, 0, 1) },
      uDateDir: { value: new THREE.Vector3(0, 0, 1) },
      uPulseOrigin: { value: new THREE.Vector3(0, 0, 1) },
      uPulse: { value: -1 },
      uClock: { value: 0 },
      uMotion: { value: this.motion ? 1 : 0 },
      uBack: { value: 0 },
      uDark: { value: 0 },
    });
    const shellMaterial = (side: THREE.Side, back: number) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: shellVertex,
        fragmentShader: shellFragment,
        uniforms: shellUniforms(),
        transparent: true,
        depthWrite: false,
        side,
      });
      m.uniforms.uBack.value = back;
      return m;
    };
    this.shellBack = shellMaterial(THREE.BackSide, 1);
    this.shellFront = shellMaterial(THREE.FrontSide, 0);
    const back = new THREE.Mesh(shellGeo, this.shellBack);
    const front = new THREE.Mesh(shellGeo, this.shellFront);
    back.renderOrder = 1;
    front.renderOrder = 2;
    this.bloch.add(back, front);

    // Hands: a rod from the centre plus a round tip.
    const rodGeo = new THREE.CylinderGeometry(HAND_RADIUS, HAND_RADIUS, 1, 16, 1);
    rodGeo.translate(0, 0.5, 0); // span y ∈ [0, 1] so it can be aimed like a vector
    const tipGeo = new THREE.SphereGeometry(TIP_RADIUS, 24, 16);
    const makeHand = (): Hand => {
      const material = new THREE.ShaderMaterial({
        vertexShader: solidVertex,
        fragmentShader: solidFragment,
        uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 1 } },
      });
      const group = new THREE.Group();
      const rod = new THREE.Mesh(rodGeo, material);
      const tip = new THREE.Mesh(tipGeo, material);
      group.add(rod, tip);
      this.bloch.add(group);
      const up = new THREE.Vector3(0, 0, 1);
      return {
        group, rod, tip, material,
        live: up.clone(), shown: up.clone(), from: up.clone(), to: up.clone(),
        animStart: -1, collapsed: false,
      };
    };
    this.hands = { time: makeHand(), date: makeHand() };
    // draw the date hand first so the time hand wins where they overlap
    this.hands.date.group.renderOrder = 0;

    const dotMaterial = (opacity = 1) => new THREE.ShaderMaterial({
      vertexShader: solidVertex,
      fragmentShader: solidFragment,
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: opacity } },
      transparent: opacity < 1,
    });
    const poleGeo = new THREE.SphereGeometry(0.03, 20, 12);
    this.poles = {
      zero: new THREE.Mesh(poleGeo, dotMaterial()),
      one: new THREE.Mesh(poleGeo, dotMaterial()),
      origin: new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 10), dotMaterial()),
    };
    this.poles.zero.position.set(0, 0, 1);
    this.poles.one.position.set(0, 0, -1);
    this.bloch.add(this.poles.zero, this.poles.one, this.poles.origin);

    this.setColors(colors);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    // Stop drawing while the sphere is scrolled away or the tab is hidden.
    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.onScreen = entry.isIntersecting;
      this.kick();
    });
    this.visibilityObserver.observe(host);
    document.addEventListener("visibilitychange", this.kick);

    this.kick();
  }

  // ---------------------------------------------------------------------------
  // public API

  setHands(dirs: Record<QubitName, [number, number, number]>) {
    for (const name of ["time", "date"] as QubitName[]) {
      const h = this.hands[name];
      h.live.set(...dirs[name]).normalize();
      if (!h.collapsed && h.animStart < 0) h.shown.copy(h.live);
    }
    this.invalidate();
  }

  setColors(c: SceneColors) {
    const dark = new THREE.Color(c.ink).getHSL({ h: 0, s: 0, l: 0 }).l > 0.5 ? 1 : 0;
    for (const m of [this.shellBack, this.shellFront]) {
      m.uniforms.uInk.value.set(c.ink);
      m.uniforms.uRule.value.set(c.rule);
      m.uniforms.uDate.value.set(c.date);
      m.uniforms.uDark.value = dark;
    }
    this.hands.time.material.uniforms.uColor.value.set(c.ink);
    this.hands.date.material.uniforms.uColor.value.set(c.date);
    (this.poles.zero.material as THREE.ShaderMaterial).uniforms.uColor.value.set(c.ink);
    (this.poles.one.material as THREE.ShaderMaterial).uniforms.uColor.value.set(c.muted);
    (this.poles.origin.material as THREE.ShaderMaterial).uniforms.uColor.value.set(c.ink);
    this.colors = c;
    this.invalidate();
  }
  private colors?: SceneColors;

  setReducedMotion(reduced: boolean) {
    this.motion = !reduced;
    for (const m of [this.shellBack, this.shellFront]) m.uniforms.uMotion.value = this.motion ? 1 : 0;
    this.kick();
  }

  /** Snap each hand to the pole it was measured at, with a wave on the glass. */
  collapse(outcomes: Record<QubitName, Outcome>) {
    const now = performance.now();
    for (const name of ["time", "date"] as QubitName[]) {
      const h = this.hands[name];
      h.from.copy(h.shown);
      h.to.set(0, 0, outcomes[name] === 0 ? 1 : -1);
      h.animStart = now;
      h.collapsed = true;
    }
    // the wave starts from the time hand, in the colour of the qubit that moved further
    const tMove = this.hands.time.from.angleTo(this.hands.time.to);
    const dMove = this.hands.date.from.angleTo(this.hands.date.to);
    const lead = dMove > tMove ? "date" : "time";
    const color = lead === "date" ? this.colors!.date : this.colors!.ink;
    for (const m of [this.shellBack, this.shellFront]) {
      m.uniforms.uPulseOrigin.value.copy(this.hands[lead].from);
      m.uniforms.uPulseColor.value.set(color);
    }
    this.pulseStart = now;
    this.kick();
  }

  /** Return the hands to the live time. */
  release() {
    const now = performance.now();
    for (const name of ["time", "date"] as QubitName[]) {
      const h = this.hands[name];
      h.from.copy(h.shown);
      h.to.copy(h.live);
      h.animStart = now;
      h.collapsed = false;
    }
    this.kick();
  }

  resetCamera() {
    // A three-quarter view like a textbook Bloch sphere, |0⟩ at the top.
    this.camera.position.set(2.6, 1.55, 4.1).setLength(4.55);
    this.camera.lookAt(0, 0, 0);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.visibilityObserver.disconnect();
    document.removeEventListener("visibilitychange", this.kick);
    this.controls.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------------------
  // frame loop

  invalidate() {
    this.dirty = true;
    this.kick();
  }

  private needsContinuous(): boolean {
    const animating = this.hands.time.animStart >= 0 || this.hands.date.animStart >= 0 || this.pulseStart >= 0;
    return animating || this.motion;
  }

  private kick = () => {
    if (this.disposed || this.raf) return;
    const visible = this.onScreen && document.visibilityState !== "hidden";
    if (!visible) return;
    if (this.dirty || this.needsContinuous()) this.raf = requestAnimationFrame(this.frame);
  };

  private frame = (now: number) => {
    this.raf = 0;
    const t0 = performance.now();

    const damping = this.controls.update(); // true while the camera is still easing
    this.step(now);
    this.render(now);
    this.dirty = false;

    this.lastFrameMs = performance.now() - t0;
    this.frames++;
    if (now - this.statWindowStart >= 500) {
      this.stats = {
        fps: Math.round((this.frames * 1000) / (now - this.statWindowStart)),
        frameMs: this.lastFrameMs,
        drawCalls: this.renderer.info.render.calls,
        rendering: true,
      };
      this.frames = 0;
      this.statWindowStart = now;
      this.onFrame?.();
    }

    if (damping) this.dirty = true;
    this.kick();
    if (!this.raf) {
      this.stats = { ...this.stats, fps: 0, rendering: false };
      this.onFrame?.();
    }
  };

  private step(now: number) {
    for (const name of ["time", "date"] as QubitName[]) {
      const h = this.hands[name];
      if (h.animStart >= 0) {
        const t = Math.min(1, (now - h.animStart) / COLLAPSE_MS);
        slerpUnit(h.from, h.to, easeInOut(t), h.shown);
        if (t >= 1) h.animStart = -1;
      } else if (!h.collapsed) {
        h.shown.copy(h.live);
      }
      aimHand(h);
    }

    let pulse = -1;
    if (this.pulseStart >= 0) {
      pulse = (now - this.pulseStart) / PULSE_MS;
      if (pulse >= 1) { pulse = -1; this.pulseStart = -1; }
    }

    const clock = (now - this.start) / 1000;
    for (const m of [this.shellBack, this.shellFront]) {
      m.uniforms.uTimeDir.value.copy(this.hands.time.shown);
      m.uniforms.uDateDir.value.copy(this.hands.date.shown);
      m.uniforms.uPulse.value = pulse;
      m.uniforms.uClock.value = clock;
    }
  }

  private render(_now: number) {
    this.renderer.render(this.scene, this.camera);
    if (this.onPoles) {
      const project = (m: THREE.Mesh) => {
        const v = new THREE.Vector3();
        m.getWorldPosition(v).project(this.camera);
        const r = this.renderer.domElement.getBoundingClientRect();
        return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height };
      };
      this.onPoles(project(this.poles.zero), project(this.poles.one));
    }
  }

  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight || w;
    if (!w) return;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }
}

// Point a hand (built along +y) at a unit vector in the Bloch frame.
const Y = new THREE.Vector3(0, 1, 0);
function aimHand(h: Hand) {
  h.group.quaternion.setFromUnitVectors(Y, h.shown);
  h.tip.position.set(0, 1, 0);
}

// Spherical interpolation between unit vectors, safe at the antipode.
function slerpUnit(a: THREE.Vector3, b: THREE.Vector3, t: number, out: THREE.Vector3): THREE.Vector3 {
  const dot = THREE.MathUtils.clamp(a.dot(b), -1, 1);
  const omega = Math.acos(dot);
  if (omega < 1e-5) return out.copy(b);
  if (Math.PI - omega < 1e-3) {
    // a and b are opposite: swing through any perpendicular direction
    const perp = Math.abs(a.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const mid = perp.sub(a.clone().multiplyScalar(perp.dot(a))).normalize();
    return t < 0.5 ? slerpUnit(a, mid, t * 2, out) : slerpUnit(mid, b, (t - 0.5) * 2, out);
  }
  const s = Math.sin(omega);
  return out.copy(a).multiplyScalar(Math.sin((1 - t) * omega) / s)
    .add(b.clone().multiplyScalar(Math.sin(t * omega) / s));
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
