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

test("exterior flight across either axial edge does not teleport onto the deck", () => {
  for (const sign of [-1, 1]) {
    const previous = {
      position: { x: 500, y: sign * 23, z: 100 },
      velocity: { x: 4, y: -sign * 12, z: 3 },
    };
    const next = {
      position: { x: 500.04, y: sign * 21.9, z: 100.03 },
      velocity: previous.velocity,
    };
    const result = resolvePlayerDeck(next, previous);
    assert.equal(result.state, next);
    assert.equal(result.hitFloor, false);
  }
});

test("a swept crossing from inside still catches the player on the real deck", () => {
  const previous = {
    position: { x: 209.9, y: 8, z: 0 },
    velocity: { x: 3, y: 2, z: -4 },
  };
  const result = resolvePlayerDeck({
    position: { x: 210.1, y: 8.1, z: 0 },
    velocity: previous.velocity,
  }, previous);
  assert.equal(result.hitFloor, true);
  assert.deepEqual(result.state.position, { x: 210, y: 8.1, z: 0 });
  assert.deepEqual(result.state.velocity, { x: 0, y: 2, z: -4 });
});

test("an axial crossing that misses the deck surface stays outside", () => {
  const previous = {
    position: { x: 209.9, y: 24, z: 0 },
    velocity: { x: 100, y: -10, z: 0 },
  };
  const next = {
    position: { x: 220, y: 21, z: 0 },
    velocity: previous.velocity,
  };
  const result = resolvePlayerDeck(next, previous);
  assert.equal(result.state, next);
  assert.equal(result.hitFloor, false);
});

test("the deck catches a crossing inside its strip even if the step ends beyond the edge", () => {
  const previous = {
    position: { x: 209.9, y: 21, z: 0 },
    velocity: { x: 100, y: 10, z: 0 },
  };
  const result = resolvePlayerDeck({
    position: { x: 220, y: 24, z: 0 },
    velocity: previous.velocity,
  }, previous);
  assert.equal(result.hitFloor, true);
  assert.equal(result.state.position.x, 210);
});

test("returning from behind the deck can enter the interior without being snapped", () => {
  const previous = {
    position: { x: 210.1, y: 0, z: 0 },
    velocity: { x: -20, y: 0, z: 0 },
  };
  const next = { position: { x: 209.9, y: 0, z: 0 }, velocity: previous.velocity };
  assert.equal(resolvePlayerDeck(next, previous).state, next);
});
