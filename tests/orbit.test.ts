import assert from "node:assert/strict";
import test from "node:test";
import { ANGULAR_SPEED, rotateY } from "../src/physics.ts";
import {
  EARTH_RADIUS,
  EARTH_SIDEREAL_DAY,
  HABITAT_AXIS_TILT_DEG,
  MOON_DISTANCE,
  ORBIT_PERIOD_SECONDS,
  ORBIT_RADIUS,
  getOrbitState,
  inertialToHabitat,
  isInEarthShadow,
  solarVisibility,
  SUN_DISTANCE,
} from "../src/orbit.ts";
import { isLand } from "../src/continents.ts";

function near(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} ≠ ${expected}`,
  );
}

test("the 2,000 km orbit has a Keplerian period of about 127 minutes", () => {
  assert.ok(ORBIT_PERIOD_SECONDS / 60 > 126 && ORBIT_PERIOD_SECONDS / 60 < 128);
  near(getOrbitState(0).altitudeKm, 2000);
  for (const seconds of [0, 321, 7600, 32000]) {
    const state = getOrbitState(seconds);
    near(
      Math.hypot(
        state.earthPosition.x,
        state.earthPosition.y,
        state.earthPosition.z,
      ),
      ORBIT_RADIUS,
      1e-7,
    );
    near(
      Math.hypot(
        state.sunDirection.x,
        state.sunDirection.y,
        state.sunDirection.z,
      ),
      1,
    );
  }
});

test("Earth subtends its geometric angular diameter, almost 100 degrees", () => {
  const state = getOrbitState(0);
  near(Math.sin(state.earthAngularRadius), EARTH_RADIUS / ORBIT_RADIUS);
  const diameter = (state.earthAngularRadius * 360) / Math.PI;
  assert.ok(diameter > 99 && diameter < 100);
});

test("sky positions account for station spin without an extra orbital-frame yaw", () => {
  const start = getOrbitState(0);
  const next = getOrbitState(ORBIT_PERIOD_SECONDS);
  const fixed = rotateY(
    next.earthPosition,
    ANGULAR_SPEED * ORBIT_PERIOD_SECONDS,
  );
  near(fixed.x, start.earthPosition.x, 1e-6);
  near(fixed.y, start.earthPosition.y, 1e-6);
  near(fixed.z, start.earthPosition.z, 1e-6);
  const quarter = getOrbitState(ORBIT_PERIOD_SECONDS / 4);
  const unspun = rotateY(
    quarter.earthPosition,
    (ANGULAR_SPEED * ORBIT_PERIOD_SECONDS) / 4,
  );
  near(unspun.x, 0, 1e-5);
  near(unspun.y, 0, 1e-5);
  near(unspun.z, ORBIT_RADIUS, 1e-5);
});

test("the habitat axis tilts Earth's sky track away from the ring plane", () => {
  const start = getOrbitState(0);
  const offset = Math.asin(-start.earthPosition.y / ORBIT_RADIUS);
  near((offset * 180) / Math.PI, HABITAT_AXIS_TILT_DEG);
  assert.ok(
    offset > 0.25,
    "Earth starts visibly to the side of the ring plane",
  );
  const quarter = getOrbitState(ORBIT_PERIOD_SECONDS / 4);
  near(quarter.earthPosition.y, 0, 1e-6);
});

test("the tilted spinning sky frame preserves distances and handedness", () => {
  for (const seconds of [0, 17, 2300]) {
    const x = inertialToHabitat({ x: 1, y: 0, z: 0 }, seconds);
    const y = inertialToHabitat({ x: 0, y: 1, z: 0 }, seconds);
    const z = inertialToHabitat({ x: 0, y: 0, z: 1 }, seconds);
    for (const axis of [x, y, z]) near(Math.hypot(axis.x, axis.y, axis.z), 1);
    near(x.x * y.x + x.y * y.y + x.z * y.z, 0);
    near(x.y * y.z - x.z * y.y, z.x);
    near(x.z * y.x - x.x * y.z, z.y);
    near(x.x * y.y - x.y * y.x, z.z);
  }
});

test("Earth blocks direct sunlight on the far side of the orbit", () => {
  assert.equal(getOrbitState(0).sunlight, 1);
  assert.equal(getOrbitState(ORBIT_PERIOD_SECONDS / 2).sunlight, 0);
  assert.equal(getOrbitState(ORBIT_PERIOD_SECONDS / 2).eclipsed, true);
  assert.equal(getOrbitState(ORBIT_PERIOD_SECONDS / 4).sunlight, 1);
});

test("eclipse geometry distinguishes the shadow cylinder from the whole night hemisphere", () => {
  const sun = { x: SUN_DISTANCE, y: 0, z: 0 };
  assert.equal(isInEarthShadow({ x: -ORBIT_RADIUS, y: 0, z: 0 }, sun), true);
  assert.equal(isInEarthShadow({ x: ORBIT_RADIUS, y: 0, z: 0 }, sun), false);
  assert.equal(
    isInEarthShadow({ x: -ORBIT_RADIUS, y: EARTH_RADIUS * 1.1, z: 0 }, sun),
    false,
  );
  assert.equal(
    solarVisibility({ x: -ORBIT_RADIUS, y: EARTH_RADIUS * 1.1, z: 0 }, sun),
    1,
  );
  const limb = solarVisibility(
    { x: -ORBIT_RADIUS, y: EARTH_RADIUS, z: 0 },
    sun,
  );
  assert.ok(
    limb > 0.4 && limb < 0.6,
    "finite solar disk smooths the limb crossing",
  );
});

test("Moon keeps its geocentric distance but has station-relative parallax", () => {
  const angularRadii: number[] = [];
  for (const seconds of [
    0,
    ORBIT_PERIOD_SECONDS / 4,
    ORBIT_PERIOD_SECONDS / 2,
  ]) {
    const state = getOrbitState(seconds);
    near(
      Math.hypot(
        state.moonPosition.x - state.earthPosition.x,
        state.moonPosition.y - state.earthPosition.y,
        state.moonPosition.z - state.earthPosition.z,
      ),
      MOON_DISTANCE,
      1e-6,
    );
    angularRadii.push(state.moonAngularRadius);
  }
  assert.ok(Math.max(...angularRadii) - Math.min(...angularRadii) > 0.00005);
});

test("Earth's map rotates once per sidereal day independently of habitat rotation", () => {
  const state = getOrbitState(EARTH_SIDEREAL_DAY);
  const expected = inertialToHabitat({ x: 1, y: 0, z: 0 }, EARTH_SIDEREAL_DAY);
  near(state.earthPrimeDirection.x, expected.x);
  near(state.earthPrimeDirection.y, expected.y);
  near(state.earthPrimeDirection.z, expected.z);
  const dot =
    state.earthPrimeDirection.x * state.earthNorthDirection.x +
    state.earthPrimeDirection.y * state.earthNorthDirection.y +
    state.earthPrimeDirection.z * state.earthNorthDirection.z;
  near(dot, 0);
});

test("simplified continent geometry recognizes major land and ocean locations", () => {
  for (const [longitude, latitude] of [
    [-3.7, 40.4],
    [-74, 40.7],
    [-47.9, -15.8],
    [18.4, -33.9],
    [151.2, -33.9],
    [139.7, 35.7],
    [0, -85],
  ]) {
    assert.equal(
      isLand(longitude, latitude),
      true,
      `${longitude}, ${latitude} should be land`,
    );
  }
  for (const [longitude, latitude] of [
    [-140, 0],
    [-40, 15],
    [80, -20],
  ]) {
    assert.equal(
      isLand(longitude, latitude),
      false,
      `${longitude}, ${latitude} should be ocean`,
    );
  }
});
