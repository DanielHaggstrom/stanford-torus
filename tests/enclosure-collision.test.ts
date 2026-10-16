import assert from "node:assert/strict";
import test from "node:test";
import { firstEnclosureImpact } from "../src/enclosure-collision.ts";
import { isInsideHabitat, ENCLOSURE_HEIGHT, ENCLOSURE_HALF_WIDTH, ENCLOSURE_HULL_DEPTH } from "../src/habitat-volume.ts";
import { ANGULAR_SPEED, FLOOR_RADIUS, rotationVelocity, stepFreeFlight, type MotionState, type Vec3 } from "../src/physics.ts";
import { buildSceneryCollision } from "../src/scenery-collision.ts";

const motion = (position: Vec3, velocity: Vec3): MotionState => ({ position, velocity });
const near = (actual: number, expected: number, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} differs from ${expected}`);
const nearVector = (actual: Vec3, expected: Vec3, tolerance = 1e-7) => {
  near(actual.x, expected.x, tolerance);
  near(actual.y, expected.y, tolerance);
  near(actual.z, expected.z, tolerance);
};

test("a probe hits the canopy instead of crossing into space", () => {
  const initial = motion({ x: 200, y: 0, z: 0 }, { x: -50, y: 0, z: 0 });
  const impact = firstEnclosureImpact(initial, 2, { angularSpeed: 0 });
  assert.equal(impact?.kind, "enclosure");
  near(impact!.time, 0.5);
  near(impact!.position.x, FLOOR_RADIUS - ENCLOSURE_HEIGHT);
  nearVector(impact!.normal, { x: 1, y: 0, z: 0 });
});

test("sideways probes follow the curved wall rather than a flat axial cutoff", () => {
  const initial = motion({ x: 195, y: 0, z: 0 }, { x: 0, y: 90, z: 0 });
  const impact = firstEnclosureImpact(initial, 2, { angularSpeed: 0 });
  const wallY = ENCLOSURE_HALF_WIDTH * Math.sqrt(1 - (15 / ENCLOSURE_HEIGHT) ** 2);
  assert.equal(impact?.kind, "enclosure");
  near(impact!.position.y, wallY);
  assert.ok(wallY < 22, "the shoulder bends inward at this height");
  assert.ok(impact!.normal.y < 0);
  const lowShot = motion({ x: 209, y: 21.8, z: 0 }, { x: 0, y: 90, z: 0 });
  const lowImpact = firstEnclosureImpact(lowShot, 2, { angularSpeed: 0 });
  assert.ok(lowImpact!.position.y > 23.9, "the lower shoulder extends beyond the old 22 metre wall");
});

test("shots from space hit the first real enclosure surface instead of stopping at spawn", () => {
  for (const initial of [
    motion({ x: 150, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }),
    motion({ x: 195, y: 40, z: 0 }, { x: 0, y: -100, z: 0 }),
    motion({ x: 240, y: 0, z: 0 }, { x: -100, y: 0, z: 0 }),
  ]) {
    const impact = firstEnclosureImpact(initial, 2, { angularSpeed: 0 });
    assert.ok(impact && impact.time > 0);
    nearVector(impact.position, stepFreeFlight(initial, impact.time, 0).position);
  }
  const away = motion({ x: 150, y: 0, z: 0 }, { x: -50, y: 0, z: 0 });
  assert.equal(firstEnclosureImpact(away, 1, { angularSpeed: 0 }), null);
  const outsideStrip = motion({ x: 240, y: 35, z: 0 }, { x: -500, y: 0, z: 0 });
  assert.equal(firstEnclosureImpact(outsideStrip, 2, { angularSpeed: 0 }), null);
});

test("a fast shot cannot tunnel through both walls within one update", () => {
  const initial = motion({ x: 190, y: -100, z: 0 }, { x: 0, y: 2000, z: 0 });
  assert.equal(isInsideHabitat(initial.position), false);
  assert.equal(isInsideHabitat(stepFreeFlight(initial, 0.1, 0).position), false);
  const impact = firstEnclosureImpact(initial, 0.1, { angularSpeed: 0 });
  const halfSpan = ENCLOSURE_HALF_WIDTH * Math.sqrt(1 - (20 / ENCLOSURE_HEIGHT) ** 2);
  assert.equal(impact?.kind, "enclosure");
  near(impact!.position.y, -halfSpan);
  near(impact!.time, (100 - halfSpan) / 2000);
});

test("external probes strike the visible underside hull before the deck", () => {
  const initial = motion({ x: 220, y: 0, z: 0 }, { x: -100, y: 0, z: 0 });
  const impact = firstEnclosureImpact(initial, 1, { angularSpeed: 0 });
  assert.equal(impact?.kind, "enclosure");
  near(impact!.position.x, FLOOR_RADIUS + ENCLOSURE_HULL_DEPTH);
  nearVector(impact!.normal, { x: -1, y: 0, z: 0 });
  const inside = motion({ x: 208, y: 0, z: 0 }, { x: 100, y: 0, z: 0 });
  const deck = firstEnclosureImpact(inside, 1, { angularSpeed: 0 });
  assert.equal(deck?.kind, "floor");
  near(deck!.position.x, FLOOR_RADIUS);
});

test("the lower hull curves all the way around the axial edges of the deck", () => {
  const across = 23;
  const initial = motion({ x: 215, y: across, z: 0 }, { x: -100, y: 0, z: 0 });
  const impact = firstEnclosureImpact(initial, 1, { angularSpeed: 0 });
  const underside = FLOOR_RADIUS + ENCLOSURE_HULL_DEPTH * Math.sqrt(1 - (across / ENCLOSURE_HALF_WIDTH) ** 2);
  assert.equal(impact?.kind, "enclosure");
  near(impact!.position.x, underside);
  assert.ok(impact!.normal.x < 0 && impact!.normal.y < 0);
  const edge = motion({ x: 210.5, y: 0, z: 0 }, { x: 0, y: 100, z: 0 });
  const sideImpact = firstEnclosureImpact(edge, 1, { angularSpeed: 0 });
  near(sideImpact!.position.y, ENCLOSURE_HALF_WIDTH * Math.sqrt(1 - (0.5 / ENCLOSURE_HULL_DEPTH) ** 2));
});

test("grazing canopy contact is found even though neither endpoint is inside", () => {
  const initial = motion({ x: 175, y: -10, z: 0 }, { x: 0, y: 20, z: 0 });
  const impact = firstEnclosureImpact(initial, 1, { angularSpeed: 0 });
  assert.equal(impact?.kind, "enclosure");
  near(impact!.time, 0.5);
  nearVector(impact!.position, { x: 175, y: 0, z: 0 });
  const miss = motion({ x: 174.999, y: -10, z: 0 }, { x: 0, y: 20, z: 0 });
  assert.equal(firstEnclosureImpact(miss, 1, { angularSpeed: 0 }), null);
});

test("launches from a surface can head inward, while outward and tangent shots contact immediately", () => {
  const canopy = { x: 175, y: 0, z: 0 };
  const inward = motion(canopy, { x: 5, y: 0, z: 0 });
  assert.equal(firstEnclosureImpact(inward, 1, { angularSpeed: 0 }), null);
  for (const velocity of [{ x: -5, y: 0, z: 0 }, { x: 0, y: 5, z: 0 }]) {
    near(firstEnclosureImpact(motion(canopy, velocity), 1, { angularSpeed: 0 })!.time, 0);
  }
  assert.equal(firstEnclosureImpact(motion(canopy, { x: 0, y: 0, z: 0 }), 1, { angularSpeed: 0 }), null);
  const floor = { x: 210, y: 0, z: 0 };
  assert.equal(firstEnclosureImpact(motion(floor, { x: -5, y: 0, z: 0 }), 1, { angularSpeed: 0 }), null);
  near(firstEnclosureImpact(motion(floor, { x: 5, y: 0, z: 0 }), 1, { angularSpeed: 0 })!.time, 0);
});

test("the canopy has no artificial closing wall across the empty hub", () => {
  const initial = motion({ x: 20, y: -50, z: 0 }, { x: 0, y: 100, z: 0 });
  assert.equal(firstEnclosureImpact(initial, 1, { angularSpeed: 0 }), null);
  const deck = firstEnclosureImpact(motion({ x: 200, y: 0, z: 0 }, { x: 40, y: 0, z: 0 }), 1, { angularSpeed: 0 });
  assert.equal(deck?.kind, "floor");
  near(deck!.position.x, 210);
});

test("rotating-frame preview and every live update rate share the exact enclosure endpoint", () => {
  const world = buildSceneryCollision([]);
  const cases = [
    motion({ x: 207, y: 0, z: 0 }, { x: -70, y: 12, z: 8 }),
    motion({ x: 196, y: 0, z: 0 }, { x: -5, y: -90, z: 20 }),
    motion({ x: 160, y: 35, z: 0 }, { x: 50, y: -30, z: 5 }),
    motion({ x: 220, y: 0, z: 0 }, { x: -90, y: 0, z: 0 }),
    motion({ x: 215, y: 23, z: 0 }, { x: -90, y: 0, z: 0 }),
  ];
  for (const initial of cases) {
    const predicted = world.firstImpact(initial, 30);
    assert.equal(predicted?.kind, "enclosure");
    nearVector(world.sampleTrajectory(initial, { duration: 30, step: 0.04 }).at(-1)!, predicted!.position);
    for (const delta of [1 / 120, 1 / 30, 0.13, 1]) {
      let current = initial;
      let elapsed = 0;
      let collided = false;
      for (let count = 0; count < 1000; count++) {
        const next = world.advanceBallistic(current, delta);
        if (next.impact) {
          near(elapsed + next.impact.time, predicted!.time);
          nearVector(next.state.position, predicted!.position);
          collided = true;
          break;
        }
        elapsed += delta;
        current = next.state;
      }
      assert.ok(collided);
    }
  }
});

test("inertial and rotating descriptions predict the same time and radial impact", () => {
  const initial = motion({ x: 200, y: 2, z: 10 }, { x: -50, y: 12, z: 10 });
  const spin = rotationVelocity(initial.position, ANGULAR_SPEED);
  const inertial = motion(initial.position, { x: initial.velocity.x + spin.x, y: initial.velocity.y, z: initial.velocity.z + spin.z });
  const rotating = firstEnclosureImpact(initial, 10)!;
  const fixed = firstEnclosureImpact(inertial, 10, { angularSpeed: 0 })!;
  near(rotating.time, fixed.time);
  near(Math.hypot(rotating.position.x, rotating.position.z), Math.hypot(fixed.position.x, fixed.position.z));
  near(rotating.position.y, fixed.position.y);
});
