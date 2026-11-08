import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "katex/dist/katex.min.css";
import "./styles/page.css";
import { Shell } from "./components/Shell";
import { Tex } from "./ds";
import { BlochDiagram } from "./components/BlochDiagram";
import "./hooks/env"; // honours ?theme

const K = ({ s }: { s: string }) => <Tex src={s} />;

function About() {
  return (
    <Shell page="about">
      <h2>“qubit” + “clock” = qlock</h2>
      <p>qlock is a whimsical application of quantum computing concepts to everyday life. In quantum computers across the world, a qubit holds a state that will collapse to either 0 or 1 when measured. Here, it simply tells us the time.</p>

      <h2>Reading the time</h2>
      <p>Any state of one qubit can be written with two angles, and drawn as a point on the Bloch sphere:</p>
      <Tex as="div" className="math" display src="\ket{\psi} = \cos\tfrac{\theta}{2}\,\ket{0} + e^{i\phi}\sin\tfrac{\theta}{2}\,\ket{1}" />
      <p>The hour sets <K s="\theta" />, how far the arrow has tipped away from <K s="\ket{0}" />: midnight points straight at <K s="\ket{0}" />, noon lies on the equator, and the day ends just short of <K s="\ket{1}" />. The minute sets <K s="\phi" />, how far the arrow has turned around the sphere, once every hour.</p>
      <BlochDiagram />

      <h2>Reading the date</h2>
      <p>Two angles are all a single qubit has, and both are already telling the time, so the date gets a qubit of its own, drawn as the pink arrow on the same sphere. The month sets its <K s="\theta" /> and the day sets its <K s="\phi" />, so 1 January is <K s="\ket{0}" /> and the year ends near <K s="\ket{1}" />. Switch the diagram above to the date qubit to see it. Together the two qubits make one state, <K s="\ket{t} \otimes \ket{d}" />.</p>

      <h2>Measuring the clock</h2>
      <p>Measuring a qubit collapses it to <K s="\ket{0}" /> or <K s="\ket{1}" />. The chance of reading 0 is</p>
      <Tex as="div" className="math" display src="P(0) = \cos^2\tfrac{\theta}{2} = \tfrac{1 + z}{2}" />
      <p>where <K s="z" /> is the arrow's height on the sphere. <K s="\phi" /> never changes the odds, so every point on a line of latitude has the same chance. That is what the dashed rings on the sphere show. At midnight the time qubit always reads 0; at noon it is a coin toss; just before midnight it almost always reads 1.</p>
      <p>The two qubits never interact, so the chance of a joint reading like <K s="\ket{10}" /> is just the two chances multiplied. Press “Measure 100 times” and watch the tally settle toward the expected odds.</p>

      <h2>Building the state with gates</h2>
      <p>Every qubit in a quantum computer starts in <K s="\ket{0}" />. Below the clock are three ways to reach the current state from there: two rotations, a single general <K s="U" /> gate, or a sequence of the discrete gates real hardware runs, which gets very close but usually not exactly there.</p>

      <h2>How it is drawn</h2>
      <p>The sphere is rendered live in the browser with Three.js and custom GLSL shaders. Everything on the glass is computed per pixel from where that pixel sits on the sphere: the great circles, the graticule, the odds rings, the glow where each hand touches the glass, the wave that spreads out when you measure, and thin ripples that drift outward from each hand tip.</p>
      <p>It has to run live rather than as a video because the picture depends on the exact minute, the date, where you have turned the sphere, your light or dark theme, and the random result of each measurement. A video could show none of that. To keep it light, the page only draws frames while something is moving, stops when the sphere is scrolled away or the tab is hidden, caps the pixel ratio at 2, and holds still entirely if your system asks for reduced motion. Add <code>?debug</code> to the address to see the frame rate.</p>
    </Shell>
  );
}

createRoot(document.getElementById("root")!).render(<StrictMode><About /></StrictMode>);
