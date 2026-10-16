import assert from "node:assert/strict";
import test from "node:test";
import { resolvePlayerDeck } from "../src/player-boundaries.ts";

test("players pass through the canopy and axial sides without being pulled back inside", () => {
  for (const position of [
    { x: 160, y: 0, z: 0 },
    { x: 200, y: 30, z: 0 },
    { x: 200, y: -30, z: 0 },
    { x: 220, y: 30, z: 0 },
  ]) {
    const state = { position, velocity: { x: 1, y: 8, z: -2 } };
    const result = resolvePlayerDeck(state);
    assert.deepEqual(result.state, state);
    assert.equal(result.hitFloor, false);
    assert.equal(result.hitSide, false);
  }
});

test("the real deck still catches feet and preserves lateral velocity", () => {
  const result = resolvePlayerDeck({
    position: { x: 210.1, y: 8, z: 0 },
    velocity: { x: 3, y: 2, z: -4 },
  });
  assert.ok(result.hitFloor);
  assert.equal(result.state.position.x, 210);
  assert.equal(result.state.velocity.x, 0);
  assert.equal(result.state.velocity.y, 2);
  assert.equal(result.state.velocity.z, -4);
});
