import assert from "node:assert/strict";
import test from "node:test";
import {
  AXIS_SUNLIGHT_THRESHOLD,
  getAxisPose,
} from "../src/axis-tracking.ts";
import {
  getOrbitState,
  ORBIT_PERIOD_SECONDS,
  YEAR_SECONDS,
} from "../src/orbit.ts";
import { ANGULAR_SPEED, ROTATION_PERIOD, rotateY } from "../src/physics.ts";
import type { Vec3 } from "../src/physics.ts";

function near(actual: number, expected: number, tolerance = 1e-10): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);
}

function nearVector(actual: Vec3, expected: Vec3): void {
  near(actual.x, expected.x);
  near(actual.y, expected.y);
  near(actual.z, expected.z);
}

function normalFromPose(yaw: number, tilt: number): Vec3 {
  return rotateY({ x: 0, y: -Math.sin(tilt), z: Math.cos(tilt) }, yaw);
}

function firstShadowSample(orbit: number): number {
  for (let step = 0; step < 100; step += 1) {
    const seconds = ORBIT_PERIOD_SECONDS * (orbit + step / 100);
    if (getOrbitState(seconds, "inertial").sunlight === 0) return seconds;
  }
  assert.fail(`No eclipse found in orbit ${orbit}`);
}

test("the solar face points at the Sun and its radiator reverse faces away", () => {
  for (let sample = -24; sample <= 24; sample += 1) {
    const seconds = (sample / 24) * YEAR_SECONDS;
    const orbit = getOrbitState(seconds, "inertial");
    if (orbit.sunlight <= AXIS_SUNLIGHT_THRESHOLD) continue;
    const pose = getAxisPose(seconds);
    assert.equal(pose.sunlit, true);
    assert.equal(pose.trackingSeconds, seconds);
    const normal = normalFromPose(pose.yaw, pose.tilt);
    nearVector(normal, orbit.sunDirection);
    nearVector(pose.solarNormal, normal);
    near(
      -normal.x * orbit.sunDirection.x -
        normal.y * orbit.sunDirection.y -
        normal.z * orbit.sunDirection.z,
      -1,
    );
    assert.ok(Number.isFinite(pose.yaw) && Number.isFinite(pose.tilt));
  }
});

test("the opening solar pose follows the fixed attitude rather than station spin", () => {
  const initial = getAxisPose(0);
  const later = getAxisPose(ROTATION_PERIOD / 3);
  const habitatLocalNormal = normalFromPose(
    later.yaw - ANGULAR_SPEED * ROTATION_PERIOD / 3,
    later.tilt,
  );
  const inertialNormal = rotateY(
    habitatLocalNormal,
    ANGULAR_SPEED * ROTATION_PERIOD / 3,
  );
  nearVector(inertialNormal, later.solarNormal);
  nearVector(habitatLocalNormal, getOrbitState(ROTATION_PERIOD / 3).sunDirection);
  assert.ok(Math.abs(later.yaw - initial.yaw) < 0.0001);
  assert.ok(Math.abs(later.tilt - initial.tilt) < 0.0001);
});

test("both drive angles hold the last sunlit pose throughout an eclipse", () => {
  const first = getAxisPose(2600);
  assert.equal(first.sunlit, false);
  assert.ok(first.trackingSeconds < 2600);
  assert.ok(
    getOrbitState(first.trackingSeconds, "inertial").sunlight >
      AXIS_SUNLIGHT_THRESHOLD,
  );
  assert.ok(
    getOrbitState(first.trackingSeconds + 0.000002, "inertial").sunlight <=
      AXIS_SUNLIGHT_THRESHOLD,
  );
  for (const seconds of [3900, 2800, 3500, 3000, 2600]) {
    assert.equal(getOrbitState(seconds, "inertial").sunlight, 0);
    assert.deepEqual(getAxisPose(seconds), first);
  }
  const after = getAxisPose(4100);
  assert.equal(after.sunlit, true);
  assert.equal(after.trackingSeconds, 4100);
  assert.ok(Math.abs(after.tilt - first.tilt) > 0.0001);
});

test("large skips and reverse evaluation recover the same eclipse entry pose", () => {
  const expected = getAxisPose(3000);
  // Evict the first interval, reaching each later eclipse without intermediate
  // frames, then revisit its start from the opposite end of the eclipse.
  for (let orbit = 1; orbit <= 12; orbit += 1) {
    const seconds = firstShadowSample(orbit);
    const pose = getAxisPose(seconds);
    assert.equal(pose.sunlit, false);
    assert.ok(pose.trackingSeconds < seconds);
    nearVector(
      pose.solarNormal,
      getOrbitState(pose.trackingSeconds, "inertial").sunDirection,
    );
    assert.deepEqual(getAxisPose(seconds + 20), pose);
  }
  assert.deepEqual(getAxisPose(3900), expected);
  assert.deepEqual(getAxisPose(2600), expected);
  const negativeTime = firstShadowSample(-2);
  const beforeEpoch = getAxisPose(negativeTime);
  assert.equal(beforeEpoch.sunlit, false);
  assert.ok(beforeEpoch.trackingSeconds < negativeTime);
  assert.deepEqual(getAxisPose(negativeTime + 20), beforeEpoch);
});

test("angle wrapping and steep Sun directions preserve continuous face normals", () => {
  // Search one year for the yaw wrap and maximum tilt, then compare the actual
  // transformed normal on either side; Euler angles may legitimately wrap.
  let previous = getAxisPose(0);
  let largestTiltTime = 0;
  let largestTilt = 0;
  let wrapTime: number | undefined;
  for (let step = 1; step <= 360; step += 1) {
    const seconds = (step * YEAR_SECONDS) / 360;
    const pose = getAxisPose(seconds);
    if (Math.abs(pose.yaw - previous.yaw) > Math.PI) wrapTime = seconds;
    if (Math.abs(pose.tilt) > largestTilt) {
      largestTilt = Math.abs(pose.tilt);
      largestTiltTime = seconds;
    }
    previous = pose;
  }
  assert.ok(wrapTime !== undefined);
  assert.ok(largestTilt > 1.1);
  for (const center of [wrapTime, largestTiltTime]) {
    for (const seconds of [center - 1, center, center + 1]) {
      const pose = getAxisPose(seconds);
      nearVector(normalFromPose(pose.yaw, pose.tilt), pose.solarNormal);
      near(Math.hypot(pose.solarNormal.x, pose.solarNormal.y, pose.solarNormal.z), 1);
    }
  }
});
