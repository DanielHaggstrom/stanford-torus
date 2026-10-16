import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as THREE from "three";
import { buildHabitat } from "../src/habitat.ts";
import { buildSceneryCollision, type StaticCollider } from "../src/scenery-collision.ts";
import { FLOOR_RADIUS, type MotionState, type Vec3 } from "../src/physics.ts";
import { CIVIC_FRONT_ACROSS, CIVIC_SITES, civicSiteAngle } from "../src/civic-buildings.ts";

const habitat = buildHabitat(new THREE.Scene());
const world = buildSceneryCollision(habitat.colliders);
after(() => habitat.dispose());
const add = (a: Vec3, b: Vec3, n = 1): Vec3 => ({ x: a.x + b.x * n, y: a.y + b.y * n, z: a.z + b.z * n });
const motion = (position: Vec3, velocity = { x: 0, y: 0, z: 0 }): MotionState => ({ position, velocity });
const atAngle = (angle: number, across: number): Vec3 => ({ x: FLOOR_RADIUS * Math.cos(angle), y: across, z: FLOOR_RADIUS * Math.sin(angle) });
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function corners(collider: StaticCollider): Vec3[] {
  const points: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    points.push(add(add(add(collider.center,
      collider.axes[0], x * collider.halfSize.x),
      collider.axes[1], y * collider.halfSize.y),
      collider.axes[2], z * collider.halfSize.z));
  }
  return points;
}

function contains(collider: StaticCollider, point: Vec3): boolean {
  const relative = { x: point.x - collider.center.x, y: point.y - collider.center.y, z: point.z - collider.center.z };
  return collider.axes.every((axis, index) =>
    Math.abs(relative.x * axis.x + relative.y * axis.y + relative.z * axis.z) <=
    [collider.halfSize.x, collider.halfSize.y, collider.halfSize.z][index] + 1e-6,
  );
}

test("public landmarks register real walls and roofs against player and probe collision", () => {
  for (const site of CIVIC_SITES) {
    const wall = habitat.colliders.find((collider) => collider.kind === `civic ${site.kind} wall`);
    assert.ok(wall, `missing ${site.name} collision`);
    assert.ok(habitat.colliders.some((collider) => collider.kind === `civic ${site.kind} roof`));
    const isolated = buildSceneryCollision([wall]);
    const axis = wall.axes[0];
    const shot = motion(
      add(wall.center, axis, -wall.halfSize.x - 1),
      { x: axis.x * 20, y: axis.y * 20, z: axis.z * 20 },
    );
    const impact = isolated.firstImpact(shot, 1, { angularSpeed: 0 });
    assert.equal(impact?.collider, wall);
    assert.ok(Math.abs(impact!.time - 0.05) < 1e-7);
    const angle = Math.atan2(wall.center.z, wall.center.x);
    const base = atAngle(angle, wall.center.y);
    const previous = motion(add(base, axis, -wall.halfSize.x - 2));
    const next = motion(add(base, axis, wall.halfSize.x + 2), shot.velocity);
    const collision = isolated.resolvePlayer(previous, next);
    assert.ok(collision.hit, `${site.name} wall must stop the player`);
    assert.ok(distance(collision.state.position, next.position) > 0.5);
  }
});

test("public approaches stay clear but every civic door stops entry", () => {
  for (const site of CIVIC_SITES) {
    const angle = civicSiteAngle(site);
    let previous = motion(atAngle(angle, site.side * 11.7));
    for (let across = 11.75; across <= 12.7; across += 0.05) {
      const next = motion(atAngle(angle, site.side * across));
      const result = world.resolvePlayer(previous, next);
      assert.equal(result.hit, false, `${site.name} approach obstructed at ${across}`);
      assert.ok(distance(result.state.position, next.position) < 1e-6);
      previous = next;
    }
    const inside = motion(atAngle(angle, site.side * (CIVIC_FRONT_ACROSS + 2.5)));
    const blocked = world.resolvePlayer(previous, inside);
    assert.equal(blocked.hit, true, `${site.name} door must block entry`);
    assert.ok(Math.abs(blocked.state.position.y) < CIVIC_FRONT_ACROSS);
    assert.ok(distance(blocked.state.position, inside.position) > 2);

    const eye = atAngle(angle, site.side * 12.0);
    eye.x *= (FLOOR_RADIUS - 1.2) / FLOOR_RADIUS;
    eye.z *= (FLOOR_RADIUS - 1.2) / FLOOR_RADIUS;
    const shot = motion(eye, { x: 0, y: site.side * 40, z: 0 });
    const impact = world.firstImpact(shot, 0.2, { angularSpeed: 0 });
    assert.equal(impact?.collider?.kind, `civic ${site.kind} closed door`);
    const live = world.advanceBallistic(shot, 0.2, { angularSpeed: 0 });
    assert.ok(distance(live.state.position, impact!.position) < 1e-8);
  }
});

test("civic replacements leave both full side promenades clear", () => {
  for (const side of [-1, 1]) {
    let previous = motion(atAngle(0, side * 11.7));
    for (let step = 1; step <= 1440; step++) {
      const angle = step * Math.PI * 2 / 1440;
      const next = motion(atAngle(angle, side * 11.7));
      const result = world.resolvePlayer(previous, next);
      assert.equal(result.hit, false, `side path obstructed near ${step / 4} degrees`);
      assert.ok(distance(result.state.position, next.position) < 1e-5);
      previous = next;
    }
  }
});

test("laboratory canopy supports join the blades to the actual building solids", () => {
  const canopies = habitat.colliders.filter((collider) => collider.kind === "civic laboratory canopy");
  const brackets = habitat.colliders.filter((collider) => collider.kind === "civic laboratory canopy bracket");
  const hosts = habitat.colliders.filter((collider) =>
    collider.kind === "civic laboratory wall" || collider.kind === "civic laboratory roof",
  );
  assert.ok(brackets.length > 0);
  for (const canopy of canopies) {
    assert.ok(brackets.some((bracket) => corners(bracket).some((point) => contains(canopy, point))), "unsupported canopy blade");
  }
  for (const bracket of brackets) {
    const ends = corners(bracket);
    assert.ok(ends.some((point) => canopies.some((canopy) => contains(canopy, point))), "bracket misses canopy");
    assert.ok(ends.some((point) => hosts.some((host) => contains(host, point))), "bracket misses supporting wall or roof");
  }
});

test("roof instruments and housing foundations meet their supporting surfaces", () => {
  const roofs = habitat.colliders.filter((collider) => collider.kind === "civic laboratory roof");
  const equipment = habitat.colliders.filter((collider) =>
    collider.kind === "civic laboratory skylight frame" || collider.kind === "civic laboratory vent",
  );
  assert.ok(equipment.length > 0);
  for (const item of equipment) {
    assert.ok(corners(item).some((point) => roofs.some((roof) => contains(roof, point))), item.kind);
  }
  const foundations = habitat.colliders.filter((collider) => collider.kind === "building foundation");
  assert.ok(foundations.length > 0);
  for (const foundation of foundations) {
    const bottom = add(foundation.center, foundation.axes[1], -foundation.halfSize.y);
    assert.ok(Math.hypot(bottom.x, bottom.z) >= FLOOR_RADIUS - 1e-6, "foundation floats above deck");
  }
});
