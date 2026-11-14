# qlock
[live preview](https://starmarb.github.io/qlock/) · [design system](https://starmarb.github.io/qlock/system.html) · [original p5.js version](https://starmarb.github.io/qlock/classic/)

qlock tells the time and date as the state of two qubits, drawn together on one Bloch sphere.

- **Time qubit** (black): the hour sets θ, the minute sets φ. Midnight is |0⟩.
- **Date qubit** (pink): the month sets θ, the day sets φ. 1 January is |0⟩.

A single qubit's state is fixed by just two angles, and both are already telling the time, so the date gets its own qubit. The full state is |t⟩ ⊗ |d⟩.

Under the clock:
- **Time and Date rows:** click one to look at only that qubit on the sphere, in the state, and in the sandbox. Click the other row to switch, or Show both to bring both back. The page always opens with both.
- **Sandbox:** try to make this state with gates. Both qubits start at |0⟩ and you add gates (H, X, Y, Z, S, T, their inverses, and R<sub>y</sub>/R<sub>z</sub> at any angle) to steer each one to the clock's state. A small sphere per qubit shows your hand against the target, with how close you are. "Show Answers" reveals three solutions (two rotations, one U gate, or the shortest Clifford + T sequence found) and can load any of them into the sandbox.

The About page has a labelled diagram of the sphere with a slider to scrub through the day or the year, so you can see where each hour, minute, month, and day puts the hand.

## How it's built

React and TypeScript for the page, Three.js with hand-written GLSL for the sphere, KaTeX for the math. Version 1 was a p5.js sketch; it still lives in `public/classic/`.

### The sphere (`src/sphere/`)

The glass shell is one sphere mesh drawn twice, back faces first and then front faces, so the far side of the sphere shows through dimmer than the near side. There are no line meshes or textures on it. The fragment shader works out everything from where each pixel sits on the unit sphere:

| On the glass | How |
| --- | --- |
| Equator and meridians | distance to each great circle, anti-aliased with `fwidth` so lines stay one pixel wide at any size |
| 15° graticule | the same, on latitude and longitude, fading near the poles where meridians bunch up |
| Dashed latitude rings | a ring at each hand's latitude, which is what the hour (or month) sets |
| Glow where a hand meets the glass | Gaussian falloff on the angle to each hand |
| Ambient ripples | thin rings drifting outward from each hand tip, off when reduced motion is on |
| Showing one qubit | each qubit's marks are scaled by a 0–1 uniform that eases when you toggle it, so hands and their marks fade rather than pop |

Colours come from the same CSS tokens as the rest of the page, read into uniforms, so a theme change reaches the GPU without any colour written twice. The whole sphere is 9 draw calls.

### Why it runs in the browser, not as a video

The picture depends on the exact minute and date, the angle you've turned the sphere to, your light or dark theme, and which qubits you've chosen to show. A video can't show any of that.

Keeping it light:
- Frames are only drawn while something is moving (camera easing, a hand fading in or out, or the ripples). With reduced motion on and nothing moving, the GPU is idle.
- Drawing stops when the sphere is scrolled off screen or the tab is hidden.
- Pixel ratio is capped at 2.
- Without WebGL, the page shows a still SVG of the same view.
- Add `?debug` to see frame rate, CPU time per frame, and draw calls.

### React and the scene (`src/components/BlochSphere.tsx`)

React owns the lifecycle and `BlochScene` owns the GPU. The scene is created once and updated through a small API (`setHands`, `setShown`, `setColors`), so a re-render never rebuilds a buffer or recompiles a shader. The |0⟩ and |1⟩ labels follow the camera by writing transforms straight to the DOM each frame, without going through React state.

### Page layout as JSON (`src/ui/`)

The clock page is `clock.layout.json`, a list of sections by type. `render.tsx` maps each type to a component and checks its props, so an unknown or malformed section is skipped with a console warning instead of breaking the page. Retitling, reordering, or removing a panel is a JSON edit. `layout.schema.json` describes the format for editors.

### Design system (`src/styles/`, `src/ds/`)

Tokens for colour, type, spacing, shape, and motion live in `tokens.css`, with dark mode and reduced motion handled there. Components (Button, Tabs, Meter, Readout, Swatch, Tex) document their states in `components.css`, and [`system.html`](https://starmarb.github.io/qlock/system.html) shows every token and state on one page.

## Running it

```
npm install
npm run dev      # local server
npm test         # unit tests for the quantum math and the gate simulator
npm run build    # production build in dist/
```

Pushing to `main` builds and deploys to GitHub Pages through `.github/workflows/deploy.yml`. (In the repo settings, Pages → Source should be set to "GitHub Actions".)

URL switches for testing:
- `?at=2026-12-31T23:59` starts the clock at another moment
- `?theme=dark` or `?theme=light` forces a colour scheme
- `?debug` shows frame stats

## Still in the works
- Entangling the two qubits, so the time and date are no longer independent

A personal project by Sammi Kwon.
