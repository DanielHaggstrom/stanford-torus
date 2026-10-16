import assert from "node:assert/strict";
import test from "node:test";
import { flightSpeed, updateMotionRamp, walkSpeed } from "../src/movement.ts";

test("continuous movement reaches cruising speed after two real seconds at any frame rate", () => {
  for (const frameRate of [30, 60, 120]) {
    let ramp = 0;
    for (let frame = 0; frame < frameRate; frame++) {
      ramp = updateMotionRamp(ramp, true, 1 / frameRate);
    }
    assert.ok(Math.abs(walkSpeed(ramp) - 7) < 1e-10);
    for (let frame = 0; frame < frameRate; frame++) {
      ramp = updateMotionRamp(ramp, true, 1 / frameRate);
    }
    assert.ok(Math.abs(walkSpeed(ramp) - 10) < 1e-10);
  }
});

test("accelerated simulation can preserve the two-second real-time ramp", () => {
  for (const simulationRate of [1, 5, 10]) {
    let ramp = 0;
    const simulationStep = 1 / 120;
    for (let step = 0; step < simulationRate * 120; step++) {
      ramp = updateMotionRamp(ramp, true, simulationStep / simulationRate);
    }
    assert.ok(Math.abs(ramp - 0.5) < 1e-10);
    assert.ok(Math.abs(flightSpeed(ramp) - 25) < 1e-10);
  }
});

test("releasing movement resets the next first step without retaining running speed", () => {
  const ramp = updateMotionRamp(1, false, 1 / 120);
  assert.equal(ramp, 0);
  assert.equal(walkSpeed(ramp), 4);
  assert.ok(walkSpeed(updateMotionRamp(ramp, true, 0.1)) < 4.1);
});

test("walking and flight stay within their intended pace ranges", () => {
  assert.equal(walkSpeed(-3), 4);
  assert.equal(walkSpeed(3), 10);
  assert.equal(flightSpeed(-3), 14);
  assert.equal(flightSpeed(3), 36);
  assert.equal(flightSpeed(-3, true), 1.5);
  assert.equal(flightSpeed(3, true), 3);
  assert.equal(flightSpeed(0.5, true), 2.25);
  assert.equal(updateMotionRamp(0.8, true, 20), 1);
  assert.equal(updateMotionRamp(0.4, true, -5), 0.4);
  assert.equal(updateMotionRamp(Number.NaN, true, 0), 0);
  assert.equal(flightSpeed(Number.NaN), 14);
});
