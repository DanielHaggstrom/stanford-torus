import assert from "node:assert/strict";
import test from "node:test";
import { advanceAssistedFlight, createFlightAssist } from "../src/flight-assist.ts";
import { ANGULAR_SPEED, FLOOR_RADIUS, ROTATION_PERIOD, rotateY, rotationVelocity, stepFreeFlight, type Vec3 } from "../src/physics.ts";

const INSIDE = { x: FLOOR_RADIUS, y: 0, z: 0 };
const OUTSIDE = { x: 80, y: 0, z: 0 };
const DIRECTION = { x: 0, y: 0, z: 1 };
const UP = { x: -1, y: 0, z: 0 };

function near(a: number, b: number, tolerance = 1e-8): void {
  assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
}

function nearVector(a: Vec3, b: Vec3, tolerance = 1e-8): void {
  near(a.x, b.x, tolerance);
  near(a.y, b.y, tolerance);
  near(a.z, b.z, tolerance);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

test("space orientation stays inertial through an entire habitat rotation", () => {
  const assist = createFlightAssist(OUTSIDE, DIRECTION, UP);
  assert.equal(assist.frame, "space");
  assert.equal(assist.habitatWeight, 0);
  const step = ROTATION_PERIOD / 120;
  for (let i = 1; i <= 120; i++) {
    const time = step * i;
    assist.update(OUTSIDE, time, step, step);
    const basis = assist.basis(time);
    nearVector(rotateY(basis.direction, ANGULAR_SPEED * time), DIRECTION);
    nearVector(rotateY(basis.up, ANGULAR_SPEED * time), UP);
  }
});

test("inside orientation follows habitat spin and retains a comfortable deck horizon", () => {
  const assist = createFlightAssist(INSIDE, DIRECTION, UP);
  for (let i = 1; i <= 600; i++) {
    const time = i / 60;
    assist.update(INSIDE, time, 1 / 60, 1 / 60);
    nearVector(assist.basis(time).direction, DIRECTION);
    nearVector(assist.basis(time).up, UP);
  }
  assert.equal(assist.frame, "habitat");
  assert.equal(assist.habitatWeight, 1);
});

test("crossing the enclosure blends continuously over one real second", () => {
  const assist = createFlightAssist(INSIDE, DIRECTION, UP);
  const before = assist.basis(0);
  assist.update(OUTSIDE, 0, 0, 0);
  assert.equal(assist.frame, "space");
  assert.equal(assist.habitatWeight, 1);
  nearVector(assist.basis(0).direction, before.direction);
  for (let i = 1; i <= 60; i++) {
    const previous = assist.basis((i - 1) / 60).direction;
    assist.update(OUTSIDE, i / 60, 1 / 60, 1 / 60);
    const current = assist.basis(i / 60).direction;
    assert.ok(dot(previous, current) > 0.999);
    near(assist.habitatWeight, Math.max(0, 1 - i / 60));
  }
  assert.equal(assist.habitatWeight, 0);
});

test("frame hysteresis avoids repeated changes while hovering near the roof", () => {
  const assist = createFlightAssist(INSIDE, DIRECTION, UP);
  const nearRoofInside = { x: FLOOR_RADIUS + 1.7 - 34, y: 0, z: 0 };
  const nearRoofOutside = { x: FLOOR_RADIUS + 1.7 - 36, y: 0, z: 0 };
  for (const position of [nearRoofInside, nearRoofOutside, nearRoofInside]) assist.update(position, 0, 0, 0);
  assert.equal(assist.frame, "habitat");
  assist.update({ x: FLOOR_RADIUS + 1.7 - 39, y: 0, z: 0 }, 0, 0, 1);
  assert.equal(assist.frame, "space");
  assist.update(nearRoofInside, 0, 0, 0);
  assert.equal(assist.frame, "space");
  assist.update({ x: FLOOR_RADIUS + 1.7 - 30, y: 0, z: 0 }, 0, 0, 1);
  assert.equal(assist.frame, "habitat");
  assist.update({ x: FLOOR_RADIUS + 2, y: 0, z: 0 }, 0, 0, 0);
  assert.equal(assist.frame, "space", "below the deck is vacuum");
});

test("mouse-right yaw and upward pitch remain consistent and pitch is bounded", () => {
  const assist = createFlightAssist(OUTSIDE, DIRECTION, UP);
  assist.look(Math.PI / 2, 0);
  nearVector(assist.basis(0).direction, { x: 0, y: -1, z: 0 });
  assist.look(0, 100);
  near(Math.asin(dot(assist.basis(0).direction, UP)), 1.48);
  assist.look(0, -100);
  near(Math.asin(dot(assist.basis(0).direction, UP)), -1.48);
  near(dot(assist.basis(0).direction, assist.basis(0).right), 0);
  near(dot(assist.basis(0).up, assist.basis(0).right), 0);
});

test("the axis and even a vertical initial direction cannot create invalid orientation", () => {
  const assist = createFlightAssist({ x: 0, y: 0, z: 0 }, UP, UP);
  for (let i = 1; i <= 30; i++) {
    assist.update({ x: 0, y: i, z: 0 }, i, 1, 1);
    const basis = assist.basis(i);
    for (const vector of [basis.up, basis.direction, basis.right]) near(Math.hypot(vector.x, vector.y, vector.z), 1);
  }
});

test("time skips preserve local inside orientation and inertial outside orientation", () => {
  for (const position of [INSIDE, OUTSIDE]) {
    const assist = createFlightAssist(position, DIRECTION, UP, 7);
    const before = assist.basis(7);
    assist.rebaseTime(7, 701);
    const after = assist.basis(701);
    if (assist.frame === "habitat") nearVector(after.direction, before.direction);
    else nearVector(rotateY(after.direction, ANGULAR_SPEED * 701), rotateY(before.direction, ANGULAR_SPEED * 7));
  }
});

test("fully matched flight can hover without deck drift or artificial gravity", () => {
  const state = { position: INSIDE, velocity: { x: 0, y: 0, z: 0 } };
  const next = advanceAssistedFlight(state, { x: 0, y: 0, z: 0 }, 0.5, 1);
  nearVector(next.position, INSIDE);
  nearVector(next.velocity, state.velocity);
  assert.notEqual(next.position, state.position);
});

test("space flight without thruster correction exactly matches ballistic motion", () => {
  const state = { position: { x: 80, y: 3, z: -20 }, velocity: { x: -3, y: 8, z: 9 } };
  const surface = rotationVelocity(state.position);
  const desired = { x: state.velocity.x + surface.x, y: state.velocity.y, z: state.velocity.z + surface.z };
  const next = advanceAssistedFlight(state, desired, 0.6, 0);
  const expected = stepFreeFlight(state, 0.6);
  nearVector(next.position, expected.position);
  nearVector(next.velocity, expected.velocity);
});

test("changing assistance cannot produce an instantaneous velocity impulse", () => {
  const state = { position: INSIDE, velocity: { x: -1, y: 3, z: 5 } };
  for (const habitatWeight of [0, 0.2, 0.8, 1]) {
    const next = advanceAssistedFlight(state, { x: 100, y: 20, z: 8 }, 0, habitatWeight);
    assert.deepEqual(next, state);
    assert.notEqual(next.position, state.position);
    assert.notEqual(next.velocity, state.velocity);
    const tiny = advanceAssistedFlight(state, { x: 0, y: 0, z: 0 }, 1e-8, habitatWeight);
    nearVector(tiny.velocity, state.velocity, 1e-6);
  }
});

test("thrusters have bounded acceleration and precision flight has gentler braking", () => {
  const state = { position: { x: 0, y: 40, z: 0 }, velocity: { x: 100, y: 0, z: 0 } };
  const normal = advanceAssistedFlight(state, { x: 0, y: 0, z: 0 }, 0.1, 0);
  const precision = advanceAssistedFlight(state, { x: 0, y: 0, z: 0 }, 0.1, 0, true);
  const inertialSpeed = (next: typeof state) => {
    const surface = rotationVelocity(next.position);
    return Math.hypot(next.velocity.x + surface.x, next.velocity.y, next.velocity.z + surface.z);
  };
  near(inertialSpeed(normal), 97);
  near(inertialSpeed(precision), 99.2);
});
