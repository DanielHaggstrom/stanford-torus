import assert from "node:assert/strict";
import test from "node:test";
import {
  ANGULAR_SPEED,
  rotationVelocity,
  stepFreeFlight,
  type MotionState,
} from "../src/physics.ts";
import {
  EXPLORATION_RADIUS,
  PLAYER_BOUNDARY_RADIUS,
  constrainToExplorationSphere,
  firstExplorationExit,
  getBoundaryClearance,
} from "../src/exploration-boundary.ts";

function near(actual: number, expected: number, tolerance = 1e-8): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
}

test("the exploration limit leaves ample space around the habitat", () => {
  near(getBoundaryClearance({ x: 210, y: 0, z: 0 }), 540);
  near(getBoundaryClearance({ x: 0, y: 177, z: 0 }), 573);
  assert.ok(PLAYER_BOUNDARY_RADIUS + 1.8 < EXPLORATION_RADIUS);
});

test("interior movement keeps its position and velocity unchanged", () => {
  const state = {
    position: { x: 300, y: 40, z: 10 },
    velocity: { x: 15, y: -7, z: 3 },
  };
  const result = constrainToExplorationSphere(state);
  assert.equal(result.state, state);
  assert.equal(result.hit, false);
  near(result.distanceToBoundary, PLAYER_BOUNDARY_RADIUS - Math.hypot(300, 40, 10));
});

test("the player is clamped on every axis with outward speed removed", () => {
  for (const axis of ["x", "y", "z"] as const) {
    for (const sign of [-1, 1]) {
      const state: MotionState = {
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 2, y: 3, z: 4 },
      };
      state.position[axis] = sign * 800;
      state.velocity[axis] = sign * 20;
      const result = constrainToExplorationSphere(state);
      assert.equal(result.hit, true);
      near(result.state.position[axis], sign * PLAYER_BOUNDARY_RADIUS);
      near(result.state.velocity[axis], 0);
      for (const tangent of ["x", "y", "z"] as const) {
        if (tangent !== axis) near(result.state.velocity[tangent], state.velocity[tangent]);
      }
      near(result.distanceToBoundary, 0);
    }
  }
});

test("oblique contact preserves tangential sliding and inward escape", () => {
  const result = constrainToExplorationSphere({
    position: { x: 480, y: 640, z: 0 },
    velocity: { x: -2, y: 14, z: 7 },
  });
  near(Math.hypot(...Object.values(result.state.position)), PLAYER_BOUNDARY_RADIUS);
  near(result.state.velocity.x, -8);
  near(result.state.velocity.y, 6);
  near(result.state.velocity.z, 7);
  const inward = { x: -6, y: -8, z: 5 };
  assert.deepEqual(
    constrainToExplorationSphere({ position: result.state.position, velocity: inward }).state.velocity,
    inward,
  );
});

test("contact removes outward speed even when already exactly at the boundary", () => {
  const result = constrainToExplorationSphere({
    position: { x: 0, y: PLAYER_BOUNDARY_RADIUS, z: 0 },
    velocity: { x: 10, y: 15, z: 0 },
  });
  assert.equal(result.hit, true);
  assert.deepEqual(result.state.velocity, { x: 10, y: 0, z: 0 });
  assert.throws(() => constrainToExplorationSphere(result.state, 0), RangeError);
});

test("fast probes cannot tunnel through the sphere in a single frame", () => {
  const state = { position: { x: 0, y: 0, z: 0 }, velocity: { x: 2000, y: 0, z: 0 } };
  near(firstExplorationExit(state, 1, 0)!, 0.375);
  assert.equal(firstExplorationExit(state, 0.3, 0), null);
});

test("the exit is exact for the free-flight path at different habitat spin rates", () => {
  const state = {
    position: { x: 210, y: -20, z: 35 },
    velocity: { x: 63, y: -41, z: 27 },
  };
  for (const spin of [0, ANGULAR_SPEED, -ANGULAR_SPEED, 1]) {
    const time = firstExplorationExit(state, 60, spin);
    assert.notEqual(time, null);
    const hit = stepFreeFlight(state, time!, spin).position;
    near(Math.hypot(hit.x, hit.y, hit.z), EXPLORATION_RADIUS, 1e-7);
    const before = stepFreeFlight(state, Math.max(0, time! - 0.001), spin).position;
    const after = stepFreeFlight(state, time! + 0.001, spin).position;
    assert.ok(Math.hypot(before.x, before.y, before.z) < EXPLORATION_RADIUS);
    assert.ok(Math.hypot(after.x, after.y, after.z) > EXPLORATION_RADIUS);
  }
});

test("an inward launch from the boundary exits on the far side", () => {
  const state = {
    position: { x: EXPLORATION_RADIUS, y: 0, z: 0 },
    velocity: { x: -100, y: 0, z: 0 },
  };
  near(firstExplorationExit(state, 20, 0)!, 15);
  assert.equal(firstExplorationExit(state, 10, 0), null);
  near(firstExplorationExit({ ...state, velocity: { x: 100, y: 0, z: 0 } }, 1, 0)!, 0);
});

test("outside probes disappear immediately and stationary boundary probes remain", () => {
  assert.equal(firstExplorationExit({
    position: { x: 0, y: 751, z: 0 },
    velocity: { x: 0, y: -2000, z: 0 },
  }, 1), 0);
  const position = { x: EXPLORATION_RADIUS, y: 0, z: 0 };
  const rotational = rotationVelocity(position);
  assert.equal(firstExplorationExit({
    position,
    velocity: { x: -rotational.x, y: 0, z: -rotational.z },
  }, 30), null);
  // Tangent motion immediately moves outside, so it is an exit rather than a bounce.
  assert.equal(firstExplorationExit({ position, velocity: { x: 0, y: 10, z: 0 } }, 1, 0), 0);
});

test("a very near-surface outward crossing retains numerical precision", () => {
  const state = {
    position: { x: EXPLORATION_RADIUS - 0.00001, y: 0, z: 0 },
    velocity: { x: 10000, y: 0, z: 0 },
  };
  near(firstExplorationExit(state, 1, 0)!, 1e-9, 1e-15);
  assert.throws(() => firstExplorationExit(state, -1), RangeError);
});
