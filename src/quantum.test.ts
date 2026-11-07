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
