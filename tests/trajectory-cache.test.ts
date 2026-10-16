import assert from "node:assert/strict";
import test from "node:test";
import { createTrajectoryCache } from "../src/trajectory-cache.ts";
import { buildSceneryCollision, type StaticCollider } from "../src/scenery-collision.ts";
import { stepFreeFlight, type MotionState } from "../src/physics.ts";

const launch = (): MotionState => ({
  position: { x: 208.3, y: 0, z: 0 },
  velocity: { x: -28, y: 0, z: 8 },
});
const copy = (shot: MotionState): MotionState => ({
  position: { ...shot.position }, velocity: { ...shot.velocity },
});

test("unchanged launch states share one prediction even when copied", () => {
  let predictions = 0;
  const cache = createTrajectoryCache(() => ({ sequence: ++predictions }));
  const shot = launch();
  const result = cache.get(shot);
  assert.strictEqual(cache.get(copy(shot)), result);
  assert.strictEqual(cache.get(copy(shot)), result);
  assert.equal(predictions, 1);
});

test("every component invalidates immediately, including changes smaller than a frame of walking", () => {
  let predictions = 0;
  const cache = createTrajectoryCache(() => ++predictions);
  const shot = launch();
  assert.equal(cache.get(shot), 1);
  for (const field of ["position", "velocity"] as const) {
    for (const axis of ["x", "y", "z"] as const) {
      const before = shot[field][axis];
      shot[field][axis] += Number.EPSILON * Math.max(1, Math.abs(before));
      assert.notEqual(shot[field][axis], before);
      assert.equal(cache.get(copy(shot)), predictions);
      assert.equal(predictions, 2 + (field === "velocity" ? 3 : 0) + ["x", "y", "z"].indexOf(axis));
    }
  }
  // A changing charge changes muzzle velocity even when the player stands still.
  shot.velocity.x -= 0.000001;
  assert.equal(cache.get(shot), 8);
});

test("mutating the original shot cannot mutate the stored launch key", () => {
  let predictions = 0;
  const cache = createTrajectoryCache(() => ++predictions);
  const shot = launch();
  assert.equal(cache.get(shot), 1);
  shot.position.y += 0.01;
  assert.equal(cache.get(shot), 2);
  shot.velocity.z += 0.01;
  assert.equal(cache.get(shot), 3);
  assert.equal(cache.get(shot), 3);
});

test("clearing forces a fresh prediction without changing the shot", () => {
  let predictions = 0;
  const cache = createTrajectoryCache(() => ++predictions);
  const shot = launch();
  assert.equal(cache.get(shot), 1);
  cache.clear();
  assert.equal(cache.get(shot), 2);
  assert.equal(cache.get(shot), 2);
});

test("walking at 120 Hz updates every preview and retains the solver's exact contact", () => {
  const building: StaticCollider = {
    center: { x: 202, y: 0, z: 0 },
    halfSize: { x: 0.5, y: 3, z: 3 },
    axes: [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }],
  };
  const world = buildSceneryCollision([building]);
  let predictions = 0;
  const cache = createTrajectoryCache((shot) => {
    predictions++;
    const impact = world.firstImpact(shot, 30);
    assert.ok(impact);
    return {
      impact,
      points: world.sampleTrajectory(shot, {
        duration: impact.time, step: 0.04, stopAtCollision: false,
      }),
    };
  });
  let previousEndpointY = -Infinity;
  for (let frame = 0; frame < 6; frame++) {
    const shot = launch();
    shot.position.y = 3 * frame / 120;
    shot.velocity.y = 3;
    const prediction = cache.get(shot);
    assert.equal(predictions, frame + 1, "movement must update before a 24 Hz interval elapses");
    assert.equal(prediction.impact.kind, "scenery");
    assert.deepEqual(prediction.points.at(-1), stepFreeFlight(shot, prediction.impact.time).position);
    assert.deepEqual(prediction.points.at(-1), prediction.impact.position);
    assert.ok(prediction.impact.position.y > previousEndpointY);
    previousEndpointY = prediction.impact.position.y;
    assert.strictEqual(cache.get(copy(shot)), prediction);
  }
});
