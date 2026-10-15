import assert from "node:assert/strict";
import test from "node:test";
import {
  CHARGE_DELAY_SECONDS,
  CHARGE_DURATION_SECONDS,
  FULL_LAUNCH_SPEED,
  TAP_LAUNCH_SPEED,
  chargeFraction,
  launchSpeed,
} from "../src/launcher.ts";
import {
  FLOOR_RADIUS,
  advanceBallistic,
  firstHabitatImpact,
  sampleTrajectory,
  type MotionState,
  type Vec3,
} from "../src/physics.ts";

function near(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} ≠ ${expected}`,
  );
}

function nearVector(actual: Vec3, expected: Vec3): void {
  near(actual.x, expected.x, 1e-8);
  near(actual.y, expected.y, 1e-8);
  near(actual.z, expected.z, 1e-8);
}

test("quick taps retain minimum speed through the charging delay", () => {
  for (const heldSeconds of [-1, 0, 0.05, 0.15, 0.199, CHARGE_DELAY_SECONDS]) {
    assert.equal(chargeFraction(heldSeconds), 0);
    assert.equal(launchSpeed(heldSeconds), TAP_LAUNCH_SPEED);
  }
});

test("charging starts immediately after the delay and rises linearly", () => {
  near(chargeFraction(CHARGE_DELAY_SECONDS + 0.000001), 0.000001);
  near(launchSpeed(CHARGE_DELAY_SECONDS + 0.000001), 28.000062);
  near(chargeFraction(CHARGE_DELAY_SECONDS + 0.5), 0.5);
  near(launchSpeed(CHARGE_DELAY_SECONDS + 0.5), 59);
  near(launchSpeed(CHARGE_DELAY_SECONDS + 10 / 62), 38);
});

test("full charge takes one second beyond the tap delay and saturates", () => {
  const fullChargeTime = CHARGE_DELAY_SECONDS + CHARGE_DURATION_SECONDS;
  assert.equal(fullChargeTime, 1.2);
  assert.ok(chargeFraction(fullChargeTime - 0.000001) < 1);
  for (const heldSeconds of [fullChargeTime, 2, 60, Infinity]) {
    assert.equal(chargeFraction(heldSeconds), 1);
    assert.equal(launchSpeed(heldSeconds), FULL_LAUNCH_SPEED);
  }
  assert.equal(chargeFraction(Number.NaN), 0);
});

test("charged moving shots follow the preview at 1×, 5×, and 10×", () => {
  const playerVelocity = { x: -1.2, y: 1.8, z: 7.3 };
  const aimDirections = [
    { x: -0.8, y: 0, z: 0.6, impactKind: "floor" },
    { x: -0.8, y: 0.6, z: 0, impactKind: "side" },
  ];
  for (const heldSeconds of [CHARGE_DELAY_SECONDS + 10 / 62, 1.2]) {
    const speed = launchSpeed(heldSeconds);
    for (const aim of aimDirections) {
      const initial: MotionState = {
        position: { x: FLOOR_RADIUS - 1.7, y: 0, z: 0 },
        velocity: {
          x: aim.x * speed + playerVelocity.x,
          y: aim.y * speed + playerVelocity.y,
          z: aim.z * speed + playerVelocity.z,
        },
      };
      const impact = firstHabitatImpact(initial, 30);
      assert.equal(impact?.kind, aim.impactKind);
      assert.ok(impact);
      // Shared checkpoints let different live update rates be compared with
      // the same preview, including its exact first-contact endpoint.
      const previewStep = 0.5;
      const preview = sampleTrajectory(initial, {
        duration: 30,
        step: previewStep,
      });
      for (const timeRate of [1, 5, 10]) {
        let state = initial;
        let elapsed = 0;
        for (let index = 1; index < preview.length; index++) {
          const checkpoint = Math.min(index * previewStep, impact.time);
          while (elapsed < checkpoint - 1e-12) {
            const dt = Math.min(timeRate / 60, checkpoint - elapsed);
            const advanced = advanceBallistic(state, dt);
            state = advanced.state;
            elapsed += advanced.impact?.time ?? dt;
            if (advanced.impact) break;
          }
          nearVector(state.position, preview[index]);
        }
        near(elapsed, impact.time);
        nearVector(state.position, impact.position);
      }
    }
  }
});
