import assert from "node:assert/strict";
import test from "node:test";
import {
  ANGULAR_SPEED,
  FLOOR_RADIUS,
  GRAVITY,
  HALF_WIDTH,
  advanceBallistic,
  firstHabitatImpact,
  resolveHabitatCollision,
  rotateY,
  rotatingAcceleration,
  rotationVelocity,
  sampleTrajectory,
  stepFreeFlight,
  type MotionState,
  type Vec3,
} from "../src/physics.ts";

function near(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} ≠ ${expected}`,
  );
}

function nearVector(actual: Vec3, expected: Vec3, tolerance = 1e-9): void {
  near(actual.x, expected.x, tolerance);
  near(actual.y, expected.y, tolerance);
  near(actual.z, expected.z, tolerance);
}

function inertialVelocity(state: MotionState, elapsed: number): Vec3 {
  const rotation = rotationVelocity(state.position);
  return rotateY(
    {
      x: state.velocity.x + rotation.x,
      y: state.velocity.y,
      z: state.velocity.z + rotation.z,
    },
    ANGULAR_SPEED * elapsed,
  );
}

test("the chosen spin produces Earth gravity at the outer deck", () => {
  nearVector(
    rotatingAcceleration({ x: FLOOR_RADIUS, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
    {
      x: GRAVITY,
      y: 0,
      z: 0,
    },
  );
});

test("inward jump is deflected prograde by Coriolis acceleration", () => {
  const position = { x: FLOOR_RADIUS - 1.7, y: 0, z: 0 };
  const velocity = { x: -7, y: 0, z: 0 };
  const acceleration = rotatingAcceleration(position, velocity);
  assert.ok(acceleration.z < 0, "+Y rotation is prograde toward -Z at +X");
  const step = 1e-3;
  const next = stepFreeFlight({ position, velocity }, step);
  const previous = stepFreeFlight({ position, velocity }, -step);
  near(
    (next.velocity.z - previous.velocity.z) / (2 * step),
    acceleration.z,
    1e-6,
  );
});

test("free motion preserves constant inertial velocity across many steps", () => {
  const initial = {
    position: { x: 181, y: -6, z: 20 },
    velocity: { x: -9, y: 3, z: 18 },
  };
  const expectedVelocity = inertialVelocity(initial, 0);
  let state = initial;
  const steps = 1200;
  const dt = 1 / 120;
  for (let index = 0; index < steps; index++) state = stepFreeFlight(state, dt);
  nearVector(inertialVelocity(state, steps * dt), expectedVelocity, 1e-9);
  nearVector(
    state.position,
    stepFreeFlight(initial, steps * dt).position,
    1e-8,
  );
});

test("exact free flight reverses and becomes straight-line motion at zero spin", () => {
  const initial = {
    position: { x: 160, y: 2, z: -18 },
    velocity: { x: -4, y: 6, z: 9 },
  };
  const returned = stepFreeFlight(stepFreeFlight(initial, 12), -12);
  nearVector(returned.position, initial.position);
  nearVector(returned.velocity, initial.velocity);
  nearVector(stepFreeFlight(initial, 2, 0).position, { x: 152, y: 14, z: 0 });
});

test("deck collision keeps tangential motion and stops penetration", () => {
  const collision = resolveHabitatCollision({
    position: { x: FLOOR_RADIUS + 3, y: 0, z: 0 },
    velocity: { x: 12, y: 2, z: 7 },
  });
  assert.ok(collision.hitFloor);
  assert.ok(!collision.hitSide);
  nearVector(collision.state.position, { x: FLOOR_RADIUS, y: 0, z: 0 });
  nearVector(collision.state.velocity, { x: 0, y: 2, z: 7 });
  const jump = resolveHabitatCollision({
    position: { x: FLOOR_RADIUS, y: 0, z: 0 },
    velocity: { x: -7, y: 0, z: 0 },
  });
  near(jump.state.velocity.x, -7);
});

test("continuous collision catches a projectile crossing the whole habitat in one step", () => {
  const initial = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 1000, y: 0, z: 0 },
  };
  const advanced = advanceBallistic(initial, 1);
  assert.equal(advanced.impact?.kind, "floor");
  near(advanced.impact!.time, FLOOR_RADIUS / 1000);
  near(
    Math.hypot(advanced.state.position.x, advanced.state.position.z),
    FLOOR_RADIUS,
  );
});

test("inward launch from the deck lands later instead of hitting immediately", () => {
  const initial = {
    position: { x: FLOOR_RADIUS, y: 0, z: 0 },
    velocity: { x: -7, y: 0, z: 0 },
  };
  const impact = firstHabitatImpact(initial, 3);
  assert.equal(impact?.kind, "floor");
  assert.ok(impact!.time > 1 && impact!.time < 2);
  assert.ok(impact!.position.z < 0);
});

test("axial side wall is the first collision when firing across the deck", () => {
  const initial = {
    position: { x: 190, y: 0, z: 0 },
    velocity: { x: 0, y: 100, z: 0 },
  };
  const impact = firstHabitatImpact(initial, 2);
  assert.equal(impact?.kind, "side");
  near(impact!.time, HALF_WIDTH / 100);
  near(impact!.position.y, HALF_WIDTH);
  nearVector(impact!.normal, { x: 0, y: -1, z: 0 });
});

test("ghost endpoint and live projectile match with different simulation step sizes", () => {
  const initial = {
    position: { x: FLOOR_RADIUS - 1.7, y: 0, z: 0 },
    velocity: { x: -18, y: 5, z: 22 },
  };
  const ghost = sampleTrajectory(initial, { duration: 12, step: 0.07 });
  let state = initial;
  let hit = false;
  for (let index = 0; index < 2400 && !hit; index++) {
    const advanced = advanceBallistic(state, 1 / 144);
    state = advanced.state;
    hit = advanced.impact !== null;
  }
  assert.ok(hit);
  nearVector(state.position, ghost.at(-1)!, 1e-8);
});

test("trajectory sampler includes exact duration and rejects an invalid sample step", () => {
  const initial = {
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 2, y: 0, z: 0 },
  };
  const points = sampleTrajectory(initial, {
    duration: 1,
    step: 0.3,
    angularSpeed: 0,
  });
  assert.equal(points.length, 5);
  nearVector(points.at(-1)!, { x: 2, y: 0, z: 0 });
  assert.throws(
    () => sampleTrajectory(initial, { duration: 1, step: 0 }),
    RangeError,
  );
});
