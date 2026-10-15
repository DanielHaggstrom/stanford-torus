import assert from "node:assert/strict";
import test from "node:test";
import { nextOrbitOccurrence } from "../src/time-skip.ts";
import {
  ORBIT_PERIOD_SECONDS,
  ORBIT_START_PHASE,
  getOrbitState,
} from "../src/orbit.ts";

function near(actual: number, expected: number, tolerance = 1e-8): void {
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);
}

test("orbital skips select the next occurrence rather than rewinding", () => {
  near(nextOrbitOccurrence(25, 0.75, 100), 75);
  near(nextOrbitOccurrence(75, 0.25, 100), 125);
  near(nextOrbitOccurrence(325, 0.1, 100), 410);
});

test("the current phase and the 0/1 seam advance a complete orbit", () => {
  near(nextOrbitOccurrence(25, 0.25, 100), 125);
  near(nextOrbitOccurrence(0, 1, 100), 100);
  near(nextOrbitOccurrence(100, 0, 100), 200);
  near(nextOrbitOccurrence(1000 / 3, 1 / 3, 1000), 1000 + 1000 / 3);
});

test("an initial phase offset participates in the same forward clock", () => {
  near(nextOrbitOccurrence(0, 0.5, 400, 0.25), 100);
  near(nextOrbitOccurrence(100, 0.5, 400, 0.25), 500);
  near(nextOrbitOccurrence(100, 0.1, 400, 0.25), 340);
  near(nextOrbitOccurrence(100, 1.1, 400, 1.25), 340);
});

test("consecutive selections stay chronological over many orbital days", () => {
  const period = 7622.14;
  const startPhase = 0.125;
  let clock = 3 * 86400;
  for (const phase of [0.9, 0.1, 0.4, 0.4, 0, 0.999, 0]) {
    const next = nextOrbitOccurrence(clock, phase, period, startPhase);
    assert.ok(next > clock);
    assert.ok(next - clock <= period + 1e-7);
    const actual = (((next / period + startPhase) % 1) + 1) % 1;
    const error = Math.abs(actual - phase);
    assert.ok(Math.min(error, 1 - error) < 1e-10);
    clock = next;
  }
});

test("the destination clock updates the habitat orbit and all celestial bodies", () => {
  const before = getOrbitState(0, "inertial");
  const clock = nextOrbitOccurrence(
    0,
    0.6,
    ORBIT_PERIOD_SECONDS,
    ORBIT_START_PHASE,
  );
  const after = getOrbitState(clock, "inertial");
  near(after.orbitalPhase, 0.6);
  const distance = (a: typeof before.earthPosition, b: typeof a) =>
    Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  assert.ok(distance(after.earthPosition, before.earthPosition) > 1_000_000);
  assert.ok(
    distance(after.earthPrimeDirection, before.earthPrimeDirection) > 0.1,
  );
  // Remove the habitat's translation to check the slow independent Moon and
  // Sun motions, rather than only seeing parallax from the changed observer.
  for (const body of ["moonPosition", "sunPosition"] as const) {
    const initialGeocentric = {
      x: before[body].x - before.earthPosition.x,
      y: before[body].y - before.earthPosition.y,
      z: before[body].z - before.earthPosition.z,
    };
    const laterGeocentric = {
      x: after[body].x - after.earthPosition.x,
      y: after[body].y - after.earthPosition.y,
      z: after[body].z - after.earthPosition.z,
    };
    assert.ok(distance(laterGeocentric, initialGeocentric) > 100_000, body);
  }
});

test("revisiting a phase advances Earth's rotation and Moon rather than resetting the sky", () => {
  const first = getOrbitState(0, "inertial");
  const next = nextOrbitOccurrence(
    0,
    first.orbitalPhase,
    ORBIT_PERIOD_SECONDS,
    ORBIT_START_PHASE,
  );
  const later = getOrbitState(next, "inertial");
  near(next, ORBIT_PERIOD_SECONDS);
  near(later.orbitalPhase, first.orbitalPhase);
  near(later.earthPosition.x, first.earthPosition.x, 1e-6);
  near(later.earthPosition.y, first.earthPosition.y, 1e-6);
  near(later.earthPosition.z, first.earthPosition.z, 1e-6);
  assert.ok(
    Math.hypot(
      later.earthPrimeDirection.x - first.earthPrimeDirection.x,
      later.earthPrimeDirection.y - first.earthPrimeDirection.y,
      later.earthPrimeDirection.z - first.earthPrimeDirection.z,
    ) > 0.5,
  );
  assert.ok(
    Math.hypot(
      later.moonPosition.x - first.moonPosition.x,
      later.moonPosition.y - first.moonPosition.y,
      later.moonPosition.z - first.moonPosition.z,
    ) > 1_000_000,
  );
});

test("invalid orbital clock inputs are rejected", () => {
  for (const period of [0, -1, NaN, Infinity]) {
    assert.throws(() => nextOrbitOccurrence(0, 0.5, period), RangeError);
  }
  assert.throws(() => nextOrbitOccurrence(NaN, 0.5, 100), RangeError);
  assert.throws(() => nextOrbitOccurrence(0, Infinity, 100), RangeError);
  assert.throws(() => nextOrbitOccurrence(0, 0.5, 100, NaN), RangeError);
});
