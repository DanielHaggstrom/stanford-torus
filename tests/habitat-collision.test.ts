import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as THREE from "three";
import { buildHabitat } from "../src/habitat.ts";
import { buildSceneryCollision, type StaticCollider } from "../src/scenery-collision.ts";
import { FLOOR_RADIUS, type MotionState, type Vec3 } from "../src/physics.ts";
import { getTramState, TRAM_ANTISPINWARD_OFFSET_SECONDS, TRAM_LEG_SECONDS, TRAM_STATION_COUNT, type TramDirection } from "../src/tram-motion.ts";
import { resolveTramCollision, walkingSupportHeight, type TramSupport } from "../src/tram-physics.ts";

const habitat = buildHabitat(new THREE.Scene());
const world = buildSceneryCollision(habitat.colliders);
after(() => habitat.dispose());
const add = (a: Vec3, b: Vec3, n = 1): Vec3 => ({ x: a.x + b.x * n, y: a.y + b.y * n, z: a.z + b.z * n });
const atAngle = (angle: number, across: number, height = 0): Vec3 => ({ x: Math.cos(angle) * (FLOOR_RADIUS - height), y: across, z: Math.sin(angle) * (FLOOR_RADIUS - height) });
const motion = (position: Vec3, velocity = { x: 0, y: 0, z: 0 }): MotionState => ({ position, velocity });
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test("the rendered habitat supplies finite orthonormal collision bounds", () => {
  assert.ok(habitat.colliders.length > 1000);
  for (const collider of habitat.colliders) {
    assert.ok(Object.values(collider.center).every(Number.isFinite));
    assert.ok(Object.values(collider.halfSize).every((size) => size > 0 && Number.isFinite(size)), collider.kind);
    for (let index = 0; index < 3; index++) {
      const axis = collider.axes[index];
      assert.ok(Math.abs(Math.hypot(axis.x, axis.y, axis.z) - 1) < 1e-6);
      const other = collider.axes[(index + 1) % 3];
      assert.ok(Math.abs(axis.x * other.x + axis.y * other.y + axis.z * other.z) < 1e-6);
    }
  }
});

test("a player can walk the full centre promenade without invisible scenery walls", () => {
  const steps = 1440;
  let previous = motion(atAngle(0, 0));
  for (let index = 1; index <= steps; index++) {
    const next = motion(atAngle(index * Math.PI * 2 / steps, 0));
    const result = world.resolvePlayer(previous, next);
    assert.equal(result.hit, false, `promenade obstructed at ${index * 360 / steps} degrees`);
    assert.ok(distance(result.state.position, next.position) < 1e-5);
    previous = next;
  }
});

test("all twelve station ramps and stopped-cart entrances remain clear of scenery", () => {
  for (const direction of ["spinward", "antispinward"] as const satisfies readonly TramDirection[]) {
    const sign = direction === "spinward" ? 1 : -1;
    for (let leg = 0; leg < TRAM_STATION_COUNT; leg++) {
      const time = leg * TRAM_LEG_SECONDS + 2 - (direction === "antispinward" ? TRAM_ANTISPINWARD_OFFSET_SECONDS : 0);
      const tram = getTramState(time, direction, 0);
      assert.ok(tram.stopped);
      let previous = motion(atAngle(tram.angle, 0));
      let support: TramSupport | null = null;
      for (let step = 1; step <= 95; step++) {
        const point = atAngle(tram.angle, sign * step / 10);
        const height = walkingSupportHeight(point, previous.position, time);
        const next = motion(atAngle(tram.angle, point.y, height));
        const tramContact = resolveTramCollision(previous, next, time, time, support);
        const contact = world.resolvePlayer(previous, tramContact.state);
        assert.equal(contact.hit, false, `${direction} station ${tram.stationIndex}, across ${point.y}`);
        assert.equal(tramContact.pushed, false, "the boarding ramp should reach the parked deck without a run-over");
        assert.ok(distance(contact.state.position, tramContact.state.position) < 1e-5);
        support = tramContact.support;
        previous = contact.state;
      }
      assert.ok(support, `failed to board ${direction} station ${tram.stationIndex}`);
    }
  }
});

function firstCollider(kind: string): StaticCollider {
  const collider = habitat.colliders.find((entry) => entry.kind === kind);
  assert.ok(collider, `missing ${kind}`);
  return collider;
}

test("real building walls and tree trunks block a walking player's body", () => {
  for (const kind of ["building", "tree trunk"]) {
    const collider = firstCollider(kind);
    const isolated = buildSceneryCollision([collider]);
    const tangent = collider.axes[0];
    const angle = Math.atan2(collider.center.z, collider.center.x);
    const floor = atAngle(angle, collider.center.y);
    const halfAlong = collider.halfSize.x;
    const previous = motion(add(floor, tangent, -halfAlong - 2));
    const target = motion(add(floor, tangent, halfAlong + 2), { x: tangent.x * 20, y: tangent.y * 20, z: tangent.z * 20 });
    const result = isolated.resolvePlayer(previous, target);
    assert.ok(result.hit, kind);
    assert.ok(distance(result.state.position, target.position) > 1, kind);
  }
});

test("a rendered building roof supports a landing and its registered surface height", () => {
  const collider = firstCollider("building");
  const isolated = buildSceneryCollision([collider]);
  const up = collider.axes[1];
  const top = add(collider.center, up, collider.halfSize.y);
  const previous = motion(add(top, up, 2));
  const target = motion(add(top, up, -1), { x: -up.x * 15, y: -up.y * 15, z: -up.z * 15 });
  const result = isolated.resolvePlayer(previous, target);
  assert.ok(result.grounded);
  assert.ok(distance(result.state.position, top) < 0.01);
  const supported = isolated.supportHeight(result.state.position);
  assert.ok(supported !== null);
  assert.ok(Math.abs(FLOOR_RADIUS - Math.hypot(result.state.position.x, result.state.position.z) - supported) < 0.01);
});

test("preview and live shots agree against a collider taken from rendered scenery", () => {
  const collider = firstCollider("tree trunk");
  const isolated = buildSceneryCollision([collider]);
  const tangent = collider.axes[0];
  const initial = motion(add(collider.center, tangent, -3), { x: tangent.x * 90, y: tangent.y * 90, z: tangent.z * 90 });
  const predicted = isolated.firstImpact(initial, 2);
  assert.equal(predicted?.kind, "scenery");
  const points = isolated.sampleTrajectory(initial, { duration: 2, step: 0.04 });
  assert.ok(distance(points.at(-1)!, predicted!.position) < 1e-7);
  let state = initial;
  for (let step = 0; step < 240; step++) {
    const result = isolated.advanceBallistic(state, 1 / 120);
    if (result.impact) {
      assert.equal(result.impact.kind, "scenery");
      assert.ok(distance(result.state.position, predicted!.position) < 1e-7);
      return;
    }
    state = result.state;
  }
  assert.fail("shot never reached the predicted tree trunk");
});
