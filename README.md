# qlock
[live preview](https://starmarb.github.io/qlock/)

qlock tells the time and date as the state of two qubits, drawn together on one Bloch sphere.

- **Time qubit** (black): the hour sets θ, the minute sets φ. Midnight is |0⟩.
- **Date qubit** (pink): the month sets θ, the day sets φ. 1 January is |0⟩.

A single qubit's state is fixed by just two angles, and both are already telling the time, so the date gets its own qubit. The full state is |t⟩ ⊗ |d⟩.

Under the clock are three ways to build the current state from |0⟩:
- **Rotations:** R<sub>y</sub>(θ) then R<sub>z</sub>(φ), exact up to a global phase.
- **One U gate:** U(θ, φ, 0).
- **Clifford + T:** the shortest sequence of H, S, T, Z and their inverses found (up to seven H gates) that reaches fidelity 0.999, with the fidelity shown.

For testing, add `?at=2026-12-31T23:59` to the URL to start the clock at another moment, or `?theme=dark` / `?theme=light` to force a colour scheme.

Still in the works:
- Calculating the probabilities of collapsing to 0 vs 1
- Adding an educational supplement to the concept itself.

This is a personal project of Sammi Kwon created using p5.js, [see the qlock on p5.js's web editor here](https://editor.p5js.org/starmarb/sketches/uDOVApKd2H)
