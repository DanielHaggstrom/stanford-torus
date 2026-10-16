import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as THREE from "three";
import { buildHabitat } from "../src/habitat.ts";
import { buildSceneryCollision } from "../src/scenery-collision.ts";
import { FLOOR_RADIUS, type MotionState, type Vec3 } from "../src/physics.ts";
import { CIVIC_FRONT_ACROSS, CIVIC_SITES, civicSiteAngle } from "../src/civic-buildings.ts";

const habitat = buildHabitat(new THREE.Scene());
const world = buildSceneryCollision(habitat.colliders);
after(() => habitat.dispose());
const add = (a: Vec3, b: Vec3, n = 1): Vec3 => ({ x: a.x + b.x * n, y: a.y + b.y * n, z: a.z + b.z * n });
const motion = (position: Vec3, velocity = { x: 0, y: 0, z: 0 }): MotionState => ({ position, velocity });
const atAngle = (angle: number, across: number): Vec3 => ({ x: FLOOR_RADIUS * Math.cos(angle), y: across, z: FLOOR_RADIUS * Math.sin(angle) });
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

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

test("all civic entrances allow an unobstructed walk from side path into the portico", () => {
  for (const site of CIVIC_SITES) {
    const angle = civicSiteAngle(site);
    let previous = motion(atAngle(angle, site.side * 11.7));
    const end = CIVIC_FRONT_ACROSS + 2.5;
    for (let across = 11.75; across <= end; across += 0.05) {
      const next = motion(atAngle(angle, site.side * across));
      const result = world.resolvePlayer(previous, next);
      assert.equal(result.hit, false, `${site.name} entrance obstructed at ${across}`);
      assert.ok(distance(result.state.position, next.position) < 1e-6);
      previous = next;
    }
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
