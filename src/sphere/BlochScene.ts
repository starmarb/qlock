import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { shellVertex, shellFragment, solidVertex, solidFragment } from "./shaders";
import type { QubitName } from "../quantum";

export interface SceneColors { ink: string; muted: string; rule: string; date: string }

export interface SceneStats { fps: number; frameMs: number; drawCalls: number; rendering: boolean }

const HAND_RADIUS = 0.013;
const TIP_RADIUS = 0.04;
const FADE_MS = 260;
const QUBITS: QubitName[] = ["time", "date"];

interface Hand {
  group: THREE.Group;
  tip: THREE.Mesh;
  material: THREE.ShaderMaterial;
  dir: THREE.Vector3;  // where the clock says the hand points
  on: boolean;         // whether this qubit is being shown
  fade: number;        // 0..1, eased toward `on`
}

/**
 * Owns the WebGL renderer for the Bloch sphere. React mounts it into a div and
 * talks to it through a small imperative API (setHands, setShown, setColors);
 * it never re-creates the scene on re-render.
 *
 * Frames are only drawn when something changes: the camera moves, a hand fades
 * in or out, or the ambient ripples are running. With reduced motion on and
 * nothing moving, the GPU is idle.
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
  private lastStep = performance.now();
  private disposed = false;

  // frame stats for ?debug
  private frames = 0;
  private statWindowStart = performance.now();
  private lastFrameMs = 0;
  stats: SceneStats = { fps: 0, frameMs: 0, drawCalls: 0, rendering: false };
  onFrame?: () => void;

  /** Called each frame with the screen position of the |0⟩ and |1⟩ poles. */
  onPoles?: (zero: { x: number; y: number }, one: { x: number; y: number }) => void;

  constructor(host: HTMLElement, colors: SceneColors, opts: { reducedMotion: boolean; shown: Record<QubitName, boolean> }) {
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
      uTimeDir: { value: new THREE.Vector3(0, 0, 1) },
      uDateDir: { value: new THREE.Vector3(0, 0, 1) },
      uTimeOn: { value: 1 },
      uDateOn: { value: 1 },
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
    const makeHand = (on: boolean): Hand => {
      const material = new THREE.ShaderMaterial({
        vertexShader: solidVertex,
        fragmentShader: solidFragment,
        uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: on ? 1 : 0 } },
        transparent: true,
      });
      const group = new THREE.Group();
      const tip = new THREE.Mesh(tipGeo, material);
      tip.position.set(0, 1, 0);
      group.add(new THREE.Mesh(rodGeo, material), tip);
      group.visible = on;
      this.bloch.add(group);
      return { group, tip, material, dir: new THREE.Vector3(0, 0, 1), on, fade: on ? 1 : 0 };
    };
    this.hands = { time: makeHand(opts.shown.time), date: makeHand(opts.shown.date) };
    // draw the date hand first so the time hand wins where they overlap
    this.hands.date.group.renderOrder = 0;
    this.hands.time.group.renderOrder = 3;

    const dotMaterial = () => new THREE.ShaderMaterial({
      vertexShader: solidVertex,
      fragmentShader: solidFragment,
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 1 } },
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
    for (const q of QUBITS) {
      const h = this.hands[q];
      h.dir.set(...dirs[q]).normalize();
      h.group.quaternion.setFromUnitVectors(Y, h.dir);
    }
    this.invalidate();
  }

  /** Show or hide each qubit's hand and its marks on the glass. */
  setShown(shown: Record<QubitName, boolean>) {
    for (const q of QUBITS) this.hands[q].on = shown[q];
    if (!this.motion) for (const q of QUBITS) this.hands[q].fade = shown[q] ? 1 : 0;
    this.lastStep = performance.now();
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
    this.invalidate();
  }

  setReducedMotion(reduced: boolean) {
    this.motion = !reduced;
    for (const m of [this.shellBack, this.shellFront]) m.uniforms.uMotion.value = this.motion ? 1 : 0;
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

  private fading(): boolean {
    return QUBITS.some((q) => this.hands[q].fade !== (this.hands[q].on ? 1 : 0));
  }

  private needsContinuous(): boolean {
    return this.motion || this.fading();
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
    this.renderer.render(this.scene, this.camera);
    this.reportPoles();
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
    const dt = Math.max(0, now - this.lastStep);
    this.lastStep = now;
    for (const q of QUBITS) {
      const h = this.hands[q];
      const target = h.on ? 1 : 0;
      if (h.fade !== target) {
        const d = dt / FADE_MS;
        h.fade = target > h.fade ? Math.min(1, h.fade + d) : Math.max(0, h.fade - d);
      }
      const eased = h.fade * h.fade * (3 - 2 * h.fade);
      h.material.uniforms.uOpacity.value = eased;
      h.group.visible = h.fade > 0.001;
    }

    const clock = (now - this.start) / 1000;
    const ease = (f: number) => f * f * (3 - 2 * f);
    for (const m of [this.shellBack, this.shellFront]) {
      m.uniforms.uTimeDir.value.copy(this.hands.time.dir);
      m.uniforms.uDateDir.value.copy(this.hands.date.dir);
      m.uniforms.uTimeOn.value = ease(this.hands.time.fade);
      m.uniforms.uDateOn.value = ease(this.hands.date.fade);
      m.uniforms.uClock.value = clock;
    }
  }

  private reportPoles() {
    if (!this.onPoles) return;
    const r = this.renderer.domElement.getBoundingClientRect();
    const project = (m: THREE.Mesh) => {
      const v = new THREE.Vector3();
      m.getWorldPosition(v).project(this.camera);
      return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height };
    };
    this.onPoles(project(this.poles.zero), project(this.poles.one));
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

// Hands are built along +y and aimed at a unit vector in the Bloch frame.
const Y = new THREE.Vector3(0, 1, 0);

export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
