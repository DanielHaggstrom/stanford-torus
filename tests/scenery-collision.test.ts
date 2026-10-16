import assert from "node:assert/strict";
import test from "node:test";
import { FLOOR_RADIUS, stepFreeFlight, type MotionState, type Vec3 } from "../src/physics.ts";
import { buildSceneryCollision, type StaticCollider } from "../src/scenery-collision.ts";

const axes: StaticCollider["axes"] = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }];
const building: StaticCollider = {
  center: { x: 208, y: 10, z: 0 },
  halfSize: { x: 2, y: 3, z: 3 },
  axes,
  kind: "building",
};
const motion = (position: Vec3, velocity: Vec3 = { x: 0, y: 0, z: 0 }): MotionState => ({ position, velocity });
const near = (actual: number, expected: number, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
function nearVector(actual: Vec3, expected: Vec3, tolerance = 1e-5) {
  near(actual.x, expected.x, tolerance);
  near(actual.y, expected.y, tolerance);
  near(actual.z, expected.z, tolerance);
}

test("a fast player sweep cannot tunnel through a thin trunk", () => {
  const tree = { ...building, halfSize: { x: 3, y: 0.12, z: 0.12 } };
  const world = buildSceneryCollision([tree]);
  const previous = motion({ x: 210, y: 10, z: -10 }, { x: 0, y: 0, z: 100 });
  const next = motion({ x: 210, y: 10, z: 10 }, previous.velocity);
  const result = world.resolvePlayer(previous, next);
  assert.ok(result.hit);
  assert.ok(result.state.position.z < -0.4);
  near(result.state.velocity.z, 0);
});

test("walking into a wall slides along it and removes only inward velocity", () => {
  const world = buildSceneryCollision([building]);
  const previous = motion({ x: 210, y: 10, z: -5 });
  const next = motion({ x: 210, y: 11, z: 1 }, { x: 0, y: 2, z: 12 });
  const result = world.resolvePlayer(previous, next);
  assert.ok(result.hit);
  // Local up tilts slightly toward the centre of the ring at this longitude.
  // The upper part of the body therefore reaches the wall before the feet.
  assert.ok(result.state.position.z < -3.3 && result.state.position.z > -3.34);
  near(result.state.position.y, 11, 0.003);
  near(result.state.velocity.y, 2);
  near(result.state.velocity.z, 0, 0.001);
  assert.equal(result.grounded, false);
});

test("a jump lands on the roof and can walk across or jump away", () => {
  const world = buildSceneryCollision([building]);
  const previous = motion({ x: 203, y: 10, z: 0 }, { x: 10, y: 0, z: 0 });
  const result = world.resolvePlayer(previous, motion({ x: 208, y: 10, z: 0 }, previous.velocity));
  assert.ok(result.grounded);
  near(result.state.position.x, 206, 0.003);
  near(result.state.velocity.x, 0);
  near(world.supportHeight(result.state.position)!, 4);
  const walked = world.resolvePlayer(result.state, motion({ ...result.state.position, y: 11 }, { x: 0, y: 2, z: 0 }));
  assert.ok(walked.grounded);
  near(walked.state.position.x, result.state.position.x, 0.002);
  near(walked.state.position.y, 11, 0.002);
  const jumped = world.resolvePlayer(walked.state, motion({ ...walked.state.position, x: 205 }, { x: -5, y: 0, z: 0 }));
  assert.equal(jumped.hit, false);
  assert.equal(jumped.grounded, false);
});

test("scenery support respects step height and ends at the building edge", () => {
  const world = buildSceneryCollision([building]);
  assert.equal(world.supportHeight({ x: FLOOR_RADIUS, y: 10, z: 0 }), null, "a four metre building cannot be stepped onto from ground");
  near(world.supportHeight({ x: 206, y: 12.9, z: 0 })!, 4);
  assert.equal(world.supportHeight({ x: 206, y: 13.2, z: 0 }), null);
});

test("flying uses body collision without becoming grounded", () => {
  const world = buildSceneryCollision([building]);
  const previous = motion({ x: 203, y: 10, z: 0 });
  const result = world.resolvePlayer(previous, motion({ x: 208, y: 10, z: 0 }, { x: 40, y: 0, z: 0 }), { flying: true });
  assert.ok(result.hit);
  assert.equal(result.grounded, false);
  assert.ok(result.state.position.x < 206.01);
});

test("an oriented building collides correctly away from the initial district", () => {
  const rotated: StaticCollider = {
    center: { x: 0, y: 10, z: 208 },
    halfSize: { x: 2, y: 3, z: 3 },
    axes: [{ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }],
  };
  const world = buildSceneryCollision([rotated]);
  const result = world.resolvePlayer(motion({ x: 0, y: 10, z: 203 }), motion({ x: 0, y: 10, z: 208 }, { x: 0, y: 0, z: 10 }));
  assert.ok(result.grounded);
  near(result.state.position.z, 206, 0.003);
  near(world.supportHeight(result.state.position)!, 4);
});

test("sloped roof support agrees with the rounded capsule sole", () => {
  const angle = Math.PI / 6;
  const roof: StaticCollider = {
    center: { x: 206, y: 10, z: 0 },
    halfSize: { x: 0.1, y: 2, z: 4 },
    axes: [
      { x: Math.cos(angle), y: 0, z: -Math.sin(angle) },
      { x: 0, y: 1, z: 0 },
      { x: Math.sin(angle), y: 0, z: Math.cos(angle) },
    ],
  };
  const world = buildSceneryCollision([roof]);
  const point = { x: 205.7, y: 10, z: 0 };
  const elevation = world.supportHeight(point)!;
  assert.ok(elevation > 4.1 && elevation < 4.3);
  const onRoof = motion({ x: FLOOR_RADIUS - elevation, y: 10, z: 0 });
  const standing = world.resolvePlayer(onRoof, onRoof);
  assert.ok(standing.grounded);
  assert.equal(standing.hit, false);
  nearVector(standing.state.position, onRoof.position);
});

test("projectiles hit thin scenery at the same exact endpoint in preview and many live steps", () => {
  const thin: StaticCollider = { center: { x: 200, y: 0, z: 0 }, halfSize: { x: 10, y: 1, z: 0.015 }, axes, kind: "thin panel" };
  const world = buildSceneryCollision([thin]);
  const initial = motion({ x: 200, y: 0, z: -10 }, { x: 0, y: 0, z: 90 });
  const predicted = world.firstImpact(initial, 5);
  assert.equal(predicted?.kind, "scenery");
  const preview = world.sampleTrajectory(initial, { duration: 5, step: 0.04 });
  nearVector(preview.at(-1)!, predicted!.position, 1e-8);
  near(predicted!.position.z, -0.015, 1e-8);
  for (const delta of [1 / 120, 1 / 30, 0.13]) {
    let state = initial;
    let elapsed = 0;
    let hit = null;
    for (let count = 0; count < 1000; count++) {
      const next = world.advanceBallistic(state, delta);
      if (next.impact) { elapsed += next.impact.time; hit = next; break; }
      state = next.state;
      elapsed += delta;
    }
    assert.ok(hit);
    near(elapsed, predicted!.time, 1e-8);
    nearVector(hit.state.position, predicted!.position, 1e-8);
  }
});

test("the first surface wins: scenery before deck, deck before distant scenery", () => {
  const world = buildSceneryCollision([building]);
  const initial = motion({ x: 202, y: 10, z: 0 }, { x: 8, y: 0, z: 0 });
  assert.equal(world.firstImpact(initial, 3)?.kind, "scenery");
  const emptyLane = motion({ x: 202, y: 0, z: 0 }, { x: 8, y: 0, z: 0 });
  assert.equal(world.firstImpact(emptyLane, 3)?.kind, "floor");
  const side = motion({ x: 195, y: 20, z: 0 }, { x: 0, y: 10, z: 0 });
  assert.equal(world.firstImpact(side, 3)?.kind, "enclosure");
});

test("a courtyard remains open between individual building components", () => {
  const wings = [
    { ...building, center: { x: 208, y: 6, z: 0 }, halfSize: { x: 2, y: 1, z: 4 } },
    { ...building, center: { x: 208, y: 14, z: 0 }, halfSize: { x: 2, y: 1, z: 4 } },
  ];
  const world = buildSceneryCollision(wings);
  const initial = motion({ x: 209, y: 10, z: -8 });
  const result = world.resolvePlayer(initial, motion({ x: 209, y: 10, z: 8 }, { x: 0, y: 0, z: 10 }));
  assert.equal(result.hit, false);
  near(result.state.position.z, 8);
});

test("a probe initially inside scenery stops immediately, and free samples still use exact rotating motion", () => {
  const world = buildSceneryCollision([building]);
  const initial = motion({ x: 208, y: 10, z: 0 }, { x: -5, y: 0, z: 5 });
  near(world.firstImpact(initial, 1)!.time, 0);
  const free = world.sampleTrajectory(initial, { duration: 1, step: 0.1, stopAtCollision: false });
  nearVector(free.at(-1)!, stepFreeFlight(initial, 1).position);
});
