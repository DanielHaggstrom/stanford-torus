import assert from "node:assert/strict";
import test from "node:test";
import { createJumpAssist } from "../src/jump-assist.ts";

test("jump press just before landing is remembered and consumed once", () => {
  const jump = createJumpAssist();
  jump.updateGrounded(false, 0);
  jump.press(0.5);
  assert.equal(jump.consume(0.5), false);
  jump.updateGrounded(true, 0.6);
  assert.equal(jump.consume(0.6), true);
  assert.equal(jump.consume(0.61), false);
});

test("stepping off a deck or tram gives a short coyote window", () => {
  const jump = createJumpAssist();
  jump.updateGrounded(true, 1);
  jump.updateGrounded(false, 1.01);
  jump.press(1.1);
  assert.equal(jump.consume(1.1), true);
  jump.press(1.11);
  assert.equal(jump.consume(1.11), false);
});

test("expired buffered input and old ground contact cannot cause a jump", () => {
  const jump = createJumpAssist();
  jump.press(0);
  jump.updateGrounded(true, 0.13);
  assert.equal(jump.consume(0.13), false);
  jump.updateGrounded(false, 0.2);
  jump.press(0.3);
  assert.equal(jump.consume(0.3), false);
});

test("taking off cannot rearm a jump while ground contact briefly persists", () => {
  const jump = createJumpAssist();
  jump.updateGrounded(true, 0);
  jump.press(0);
  assert.equal(jump.consume(0), true);
  jump.updateGrounded(true, 0.01);
  jump.press(0.02);
  assert.equal(jump.consume(0.02), false);
  jump.updateGrounded(false, 0.03);
  assert.equal(jump.consume(0.03), false);
  jump.updateGrounded(true, 0.1);
  assert.equal(jump.consume(0.1), true);
});

test("a held key does not create another jump after landing", () => {
  const jump = createJumpAssist();
  jump.updateGrounded(true, 0);
  jump.press(0);
  assert.equal(jump.consume(0), true);
  jump.updateGrounded(false, 0.01);
  jump.updateGrounded(true, 0.5);
  assert.equal(jump.consume(0.5), false);
  jump.press(0.51);
  assert.equal(jump.consume(0.51), true);
});

test("jump timing uses a real clock regardless of accelerated world time", () => {
  for (const simulationRate of [1, 5, 10]) {
    const jump = createJumpAssist();
    const worldToReal = (worldSeconds: number) => worldSeconds / simulationRate;
    jump.updateGrounded(true, worldToReal(10 * simulationRate));
    jump.updateGrounded(false, worldToReal(10.01 * simulationRate));
    jump.press(worldToReal(10.1 * simulationRate));
    assert.equal(jump.consume(worldToReal(10.1 * simulationRate)), true);
  }
});

test("reset clears buffered inputs and contact after pause or mode changes", () => {
  const jump = createJumpAssist();
  jump.updateGrounded(true, 0);
  jump.press(0.01);
  jump.reset();
  assert.equal(jump.consume(0.02), false);
  jump.updateGrounded(true, 0.02);
  assert.equal(jump.consume(0.02), false);
  jump.press(Number.NaN);
  assert.equal(jump.consume(0.02), false);
  jump.press(0.02);
  assert.equal(jump.consume(Number.NaN), false);
  assert.equal(jump.consume(0.02), true);
});
