import assert from "node:assert/strict";
import test from "node:test";
import { createFlightAssist, driftAssistedFlight } from "../src/flight-assist.ts";
import { predictionPoint } from "../src/trajectory-frame.ts";
import { ANGULAR_SPEED, rotateY, rotationVelocity, stepFreeFlight, type MotionState, type Vec3 } from "../src/physics.ts";

function near(actual: Vec3, expected: Vec3, tolerance = 1e-7) {
  for (const axis of ["x", "y", "z"] as const)
    assert.ok(Math.abs(actual[axis] - expected[axis]) < tolerance, `${axis}: ${actual[axis]} != ${expected[axis]}`);
}
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const initialPosition = { x: 600, y: -70, z: 30 };
const inertialVelocity = { x: 6, y: 1, z: -4 };
const initial: MotionState = { position: initialPosition, velocity: subtract(inertialVelocity, rotationVelocity(initialPosition)) };

test("render-time flight pose keeps live probes steady across uneven frames and time rates", () => {
  const probe: MotionState = {
    position: initialPosition,
    velocity: { ...initial.velocity, z: initial.velocity.z - 28 },
  };
  let largestStaleError = 0;
  for (const rate of [1, 5, 10]) {
    let now = 0;
    for (let frame = 0; frame < 200; frame++) {
      now += [1 / 144, 1 / 60, 1 / 165, 1 / 90][frame % 4] * rate;
      const tickTime = Math.floor(now * 120) / 120;
      const tick = stepFreeFlight(initial, tickTime);
      const pose = driftAssistedFlight(tick, now - tickTime, 0);
      const live = stepFreeFlight(probe, now);
      const relative = rotateY(subtract(live.position, pose.position), ANGULAR_SPEED * now);
      near(relative, { x: 0, y: 0, z: -28 * now });
      near(pose.velocity, stepFreeFlight(initial, now).velocity);
      const stale = rotateY(subtract(live.position, tick.position), ANGULAR_SPEED * now);
      largestStaleError = Math.max(largestStaleError, Math.hypot(stale.x, stale.y, stale.z + 28 * now));
    }
  }
  assert.ok(largestStaleError > 0.8, "the workload must reproduce the old camera/probe timing error");
});

test("space previews inherit render-time velocity without a fixed-tick direction wobble", () => {
  for (const now of [0.001, 0.007, 0.0084, 0.014, 1.003, 6.007]) {
    const tickTime = Math.floor(now * 120) / 120;
    const pose = driftAssistedFlight(stepFreeFlight(initial, tickTime), now - tickTime, 0);
    const direction = rotateY({ x: 0, y: 0, z: -1 }, -ANGULAR_SPEED * now);
    const shot: MotionState = {
      position: pose.position,
      velocity: { x: pose.velocity.x + direction.x * 90, y: pose.velocity.y, z: pose.velocity.z + direction.z * 90 },
    };
    for (const ahead of [0, 0.04, 1, 10]) {
      const shown = predictionPoint(stepFreeFlight(shot, ahead).position, ahead, 0);
      const relative = rotateY(subtract(shown, pose.position), ANGULAR_SPEED * now);
      near(relative, { x: 6 * ahead, y: ahead, z: -94 * ahead });
    }
  }
});

test("presentation drift is read-only and composes in every assisted frame", () => {
  const saved = structuredClone(initial);
  for (const weight of [0, 0.25, 0.75, 1]) {
    const full = driftAssistedFlight(initial, 0.008, weight);
    const split = driftAssistedFlight(driftAssistedFlight(initial, 0.003, weight), 0.005, weight);
    near(full.position, split.position);
    near(full.velocity, split.velocity);
  }
  assert.deepEqual(initial, saved);
  near(driftAssistedFlight(initial, 0.008, 0).position, stepFreeFlight(initial, 0.008).position);
  near(driftAssistedFlight(initial, 0.008, 1).position, {
    x: initial.position.x + initial.velocity.x * 0.008,
    y: initial.position.y + initial.velocity.y * 0.008,
    z: initial.position.z + initial.velocity.z * 0.008,
  });
});

test("deck-aligned orientation stays fixed between physics ticks and across time skips", () => {
  const direction = { x: 0, y: 0, z: 1 }, up = { x: -1, y: 0, z: 0 };
  const assist = createFlightAssist({ x: 210, y: 0, z: 0 }, direction, up);
  assist.update({ x: 210, y: 0, z: 0 }, 1 / 120, 1 / 120, 1 / 120);
  for (const remainder of [0.001, 0.004, 0.008]) {
    near(assist.basis(1 / 120 + remainder).direction, direction);
    near(assist.basis(1 / 120 + remainder).up, up);
  }
  const before = assist.basis(0.014);
  assist.rebaseTime(0.014, 2000);
  near(assist.basis(2000).direction, before.direction);
  near(assist.basis(2000).up, before.up);
});
