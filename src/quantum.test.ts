import { test } from "node:test";
import assert from "node:assert/strict";
import { readClock, p0, jointProbabilities, measure, cliffordT, blochVector, percent } from "./quantum.ts";

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("midnight on 1 January is |0⟩ for both qubits", () => {
  const s = readClock(new Date(2026, 0, 1, 0, 0));
  assert.equal(s.time.theta.n, 0);
  assert.equal(s.date.theta.n, 0);
  close(p0(s.time.theta.value), 1);
});

test("noon sits on the equator: an even chance of 0 or 1", () => {
  const s = readClock(new Date(2026, 5, 15, 12, 0));
  close(s.time.theta.value, Math.PI / 2);
  close(p0(s.time.theta.value), 0.5);
});

test("φ never changes the odds", () => {
  const a = readClock(new Date(2026, 5, 15, 9, 0));
  const b = readClock(new Date(2026, 5, 15, 9, 0));
  close(p0(a.time.theta.value), p0(b.time.theta.value));
  // same θ, different φ, same z on the sphere
  close(blochVector(1, 0)[2], blochVector(1, 2.5)[2]);
});

test("p0 matches (1 + z) / 2 on the sphere", () => {
  for (const th of [0, 0.3, 1, 2, Math.PI]) close(p0(th), (1 + blochVector(th, 0.7)[2]) / 2);
});

test("joint probabilities sum to 1 and multiply", () => {
  const j = jointProbabilities(1.1, 2.3);
  close(j.reduce((s, o) => s + o.p, 0), 1);
  close(j[0].p, p0(1.1) * p0(2.3));
});

test("measure follows the odds", () => {
  assert.equal(measure(Math.PI / 2, () => 0.49), 0);
  assert.equal(measure(Math.PI / 2, () => 0.51), 1);
  assert.equal(measure(0, () => 0.9999), 0);
});

test("Clifford + T reaches |+⟩ exactly with one H", () => {
  const r = cliffordT(Math.PI / 2, 0);
  assert.deepEqual(r.gates.map((g) => g.name), ["H"]);
  close(r.fidelity, 1);
});

test("percent formatting at the edges", () => {
  assert.equal(percent(1), "100.0%");
  assert.equal(percent(0.0004), "<0.1%");
  assert.equal(percent(0.9996), ">99.9%");
});

import { runGates, fidelity, blochOf, answerGates, cliffordT as ct } from "./quantum.ts";

test("Ry(θ) then Rz(φ) reaches the clock state exactly", () => {
  const s = readClock(new Date(2026, 10, 7, 14, 5));
  for (const q of [s.time, s.date]) {
    const k = runGates(answerGates("rot", q));
    close(fidelity(k, q.theta.value, q.phi.value), 1);
  }
});

test("one U gate reaches the clock state exactly", () => {
  const s = readClock(new Date(2026, 2, 20, 6, 30));
  const k = runGates(answerGates("u", s.date));
  close(fidelity(k, s.date.theta.value, s.date.phi.value), 1);
});

test("replaying the Clifford + T answer gives the fidelity the search reported", () => {
  const s = readClock(new Date(2026, 10, 7, 14, 5));
  const r = ct(s.time.theta.value, s.time.phi.value);
  const k = runGates(answerGates("ht", s.time));
  close(fidelity(k, s.time.theta.value, s.time.phi.value), r.fidelity, 1e-9);
});

test("H then S points along +y", () => {
  const [x, y, z] = blochOf(runGates([{ kind: "H" }, { kind: "S" }]));
  close(x, 0); close(y, 1); close(z, 0);
});

test("X flips |0⟩ to |1⟩", () => {
  close(blochOf(runGates([{ kind: "X" }]))[2], -1);
});

import { piText } from "./quantum.ts";
test("piText prefers simple fractions", () => {
  assert.equal(piText(Math.PI / 2), "π/2");
  assert.equal(piText((3 * Math.PI) / 4), "3π/4");
  assert.equal(piText(2 * Math.PI), "2π");
  assert.equal(piText((211 * Math.PI) / 360), "0.586π");
});
