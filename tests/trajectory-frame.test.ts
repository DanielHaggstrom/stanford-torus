import assert from "node:assert/strict";
import test from "node:test";
import { predictionPoint, trailPoint } from "../src/trajectory-frame.ts";
import { ANGULAR_SPEED, rotateY, rotationVelocity, stepFreeFlight, type Vec3 } from "../src/physics.ts";

function nearVector(actual: Vec3, expected: Vec3, tolerance = 1e-8): void {
  for (const axis of ["x", "y", "z"] as const) {
    assert.ok(Math.abs(actual[axis] - expected[axis]) <= tolerance, `${axis}: ${actual[axis]} != ${expected[axis]}`);
  }
}

const INITIAL = {
  position: { x: 190, y: 2, z: -30 },
  velocity: { x: 8, y: 3, z: 15 },
};
const surface = rotationVelocity(INITIAL.position);
const INERTIAL_VELOCITY = {
  x: INITIAL.velocity.x + surface.x,
  y: INITIAL.velocity.y,
  z: INITIAL.velocity.z + surface.z,
};

function inertialPoint(time: number): Vec3 {
  return {
    x: INITIAL.position.x + INERTIAL_VELOCITY.x * time,
    y: INITIAL.position.y + INERTIAL_VELOCITY.y * time,
    z: INITIAL.position.z + INERTIAL_VELOCITY.z * time,
  };
}

test("the space preview is a straight inertial path throughout its samples", () => {
  for (let i = 0; i <= 200; i++) {
    const time = i * 0.04;
    const rotatingPoint = stepFreeFlight(INITIAL, time).position;
    nearVector(predictionPoint(rotatingPoint, time, 0), inertialPoint(time));
  }
});

test("historical trail samples share the current inertial camera reference", () => {
  const now = 8;
  for (let i = 0; i <= 200; i++) {
    const sampledAt = i * 0.04;
    const recorded = stepFreeFlight(INITIAL, sampledAt).position;
    const expected = rotateY(inertialPoint(sampledAt), -ANGULAR_SPEED * now);
    nearVector(trailPoint(recorded, sampledAt, now, 0), expected);
  }
});

test("the habitat preview and trails retain their existing coordinates", () => {
  const point = { x: 150, y: -4, z: -80 };
  assert.deepEqual(predictionPoint(point, 12, 1), point);
  assert.deepEqual(trailPoint(point, 3, 15, 1), point);
  assert.notEqual(predictionPoint(point, 12, 1), point);
  assert.notEqual(trailPoint(point, 3, 15, 1), point);
  assert.deepEqual(predictionPoint(point, 0, 0), point);
  assert.deepEqual(trailPoint(point, 12, 12, 0), point);
});

test("reference blending is continuous and preserves distance from the hub", () => {
  const point = { x: 150, y: -4, z: -80 };
  const length = Math.hypot(point.x, point.y, point.z);
  for (const matched of [0, 0.25, 0.5, 0.75, 1]) {
    for (const transformed of [predictionPoint(point, 12, matched), trailPoint(point, 3, 15, matched)]) {
      assert.ok(Math.abs(Math.hypot(transformed.x, transformed.y, transformed.z) - length) < 1e-10);
      assert.equal(transformed.y, point.y);
    }
  }
  const first = predictionPoint(point, 12, 0.5);
  const next = predictionPoint(point, 12, 0.5 + 1e-8);
  nearVector(first, next, 1e-5);
  const firstTrail = trailPoint(point, 3, 15, 0.5);
  const nextTrail = trailPoint(point, 3, 15, 0.5 + 1e-8);
  nearVector(firstTrail, nextTrail, 1e-5);
});

test("out-of-range blend weights clamp to the corresponding reference", () => {
  const point = { x: 150, y: -4, z: -80 };
  assert.deepEqual(predictionPoint(point, 2, -3), predictionPoint(point, 2, 0));
  assert.deepEqual(predictionPoint(point, 2, 4), point);
  assert.deepEqual(trailPoint(point, 2, 5, -3), trailPoint(point, 2, 5, 0));
  assert.deepEqual(trailPoint(point, 2, 5, 4), point);
  assert.deepEqual(predictionPoint(point, 2, Number.NaN), point);
});
