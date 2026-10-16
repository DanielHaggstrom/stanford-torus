import assert from "node:assert/strict";
import test from "node:test";
import { FLOOR_RADIUS } from "../src/physics.ts";
import {
  ENCLOSURE_HEIGHT,
  ENCLOSURE_HALF_WIDTH,
  isInsideHabitat,
} from "../src/habitat-volume.ts";

test("pressure volume follows the roof and shoulders at every ring angle", () => {
  for (const angle of [0, 0.8, Math.PI, -2]) {
    const point = (height: number, across: number) => ({
      x: (FLOOR_RADIUS - height) * Math.cos(angle),
      y: across,
      z: (FLOOR_RADIUS - height) * Math.sin(angle),
    });
    assert.ok(isInsideHabitat(point(1.7, 0)));
    assert.ok(isInsideHabitat(point(ENCLOSURE_HEIGHT - 0.01, 0)));
    assert.ok(!isInsideHabitat(point(ENCLOSURE_HEIGHT + 0.01, 0)));
    const shoulderHeight = ENCLOSURE_HEIGHT * Math.sqrt(1 - 0.75 ** 2);
    assert.ok(isInsideHabitat(point(shoulderHeight - 0.01, ENCLOSURE_HALF_WIDTH * 0.75)));
    assert.ok(!isInsideHabitat(point(shoulderHeight + 0.01, ENCLOSURE_HALF_WIDTH * 0.75)));
    assert.ok(!isInsideHabitat(point(1.7, ENCLOSURE_HALF_WIDTH + 0.01)));
    assert.ok(!isInsideHabitat(point(-0.01, 0)));
  }
});

test("hub, open space, and invalid listener positions are outside", () => {
  assert.ok(!isInsideHabitat({ x: 0, y: 0, z: 0 }));
  assert.ok(!isInsideHabitat({ x: 10, y: 0, z: 0 }));
  assert.ok(!isInsideHabitat({ x: NaN, y: 0, z: 0 }));
  assert.ok(!isInsideHabitat({ x: FLOOR_RADIUS, y: Infinity, z: 0 }));
});
