import assert from "node:assert/strict";
import test from "node:test";
import { flightSpeed, updateMotionRamp, walkSpeed } from "../src/movement.ts";

test("continuous movement reaches cruising speed after two seconds at any frame rate", () => {
  for (const frameRate of [30, 60, 120]) {
    let ramp = 0;
    for (let frame = 0; frame < frameRate; frame++) {
      ramp = updateMotionRamp(ramp, true, 1 / frameRate);
    }
    assert.ok(Math.abs(walkSpeed(ramp) - 3.5) < 1e-10);
    for (let frame = 0; frame < frameRate; frame++) {
      ramp = updateMotionRamp(ramp, true, 1 / frameRate);
    }
    assert.ok(Math.abs(walkSpeed(ramp) - 5) < 1e-10);
  }
});

test("releasing movement resets the next first step without retaining a sprint", () => {
  const ramp = updateMotionRamp(1, false, 1 / 120);
  assert.equal(ramp, 0);
  assert.equal(walkSpeed(ramp), 2);
  assert.equal(walkSpeed(ramp, true), 4);
  assert.ok(walkSpeed(updateMotionRamp(ramp, true, 0.1)) < 2.1);
});

test("walking and flight stay within their intended pace ranges", () => {
  assert.equal(walkSpeed(-3), 2);
  assert.equal(walkSpeed(3), 5);
  assert.equal(walkSpeed(3, true), 10);
  assert.equal(flightSpeed(-3), 6);
  assert.equal(flightSpeed(3), 15);
  assert.equal(flightSpeed(3, true), 36);
  assert.equal(updateMotionRamp(0.8, true, 20), 1);
  assert.equal(updateMotionRamp(0.4, true, -5), 0.4);
  assert.equal(updateMotionRamp(Number.NaN, true, 0), 0);
});
