import assert from "node:assert/strict";
import test from "node:test";
import { joystickVector, TouchInput } from "../src/touch-input.ts";

function setup() {
  const events: (string | number[])[] = [];
  const input = new TouchInput({
    look: (dx, dy) => events.push([dx, dy]),
    jump: () => events.push("jump"),
    beginCharge: () => events.push("begin"),
    releaseCharge: () => events.push("release"),
    cancelCharge: () => events.push("cancel"),
  });
  return { input, events };
}

test("joystick has a radial dead zone and preserves analog diagonal magnitude", () => {
  assert.deepEqual(joystickVector(0.05, -0.05), { forward: 0, right: 0 });
  assert.deepEqual(joystickVector(Number.NaN, 1), { forward: 0, right: 0 });
  const half = joystickVector(0, -0.565);
  assert.ok(Math.abs(half.forward - 0.5) < 1e-12);
  const diagonal = joystickVector(4, -4);
  assert.ok(Math.abs(Math.hypot(diagonal.forward, diagonal.right) - 1) < 1e-12);
  assert.equal(diagonal.forward, diagonal.right);
});

test("walking, looking, jumping and charging use independent fingers", () => {
  const { input, events } = setup();
  input.begin("move", 1);
  input.moveStick(1, 0, -1);
  input.begin("look", 2);
  input.begin("fire", 3);
  input.begin("jump", 4);
  assert.equal(input.moveLook(1, 99, 99), false);
  assert.equal(input.moveStick(2, 0, 0), false);
  input.moveLook(2, 12, -8);
  input.end(4);
  input.end(2);
  assert.equal(input.state.forward, 1);
  assert.equal(input.pointerFor("fire"), 3);
  assert.deepEqual(events, ["begin", "jump", [12, -8]]);
  input.end(3);
  assert.deepEqual(events.at(-1), "release");
  input.end(1);
  assert.deepEqual(input.state, { forward: 0, right: 0, vertical: 0 });
});

test("two thumbs can move and aim a charged shot without releasing either gesture", () => {
  const { input, events } = setup();
  input.begin("move", 1);
  input.moveStick(1, 0.4, -0.8);
  const movement = { ...input.state };
  input.begin("fire", 2);
  assert.equal(input.moveLook(2, 18, -6), true);
  assert.equal(input.moveLook(1, 100, 100), false);
  assert.deepEqual(input.state, movement);
  assert.deepEqual(events, ["begin", [18, -6]]);
  assert.equal(input.pointerFor("fire"), 2);
  input.end(2);
  assert.deepEqual(events.at(-1), "release");
  assert.equal(input.moveLook(2, 18, -6), false);
  assert.deepEqual(input.state, movement);
});

test("only the owning fire pointer can release a shot and cancelled shots never fire", () => {
  const { input, events } = setup();
  assert.equal(input.begin("fire", 10), true);
  assert.equal(input.begin("fire", 11), false);
  assert.equal(input.begin("jump", 10), false);
  input.end(11);
  assert.deepEqual(events, ["begin"]);
  input.end(10, true);
  assert.equal(input.moveLook(10, 50, 50), false);
  input.end(10);
  assert.deepEqual(events, ["begin", "cancel"]);
});

test("flight rise and descent cancel each other and recover when one finger lifts", () => {
  const { input, events } = setup();
  input.setFlight(true);
  input.begin("jump", 1);
  assert.equal(input.state.vertical, 1);
  input.begin("descend", 2);
  assert.equal(input.state.vertical, 0);
  input.end(1);
  assert.equal(input.state.vertical, -1);
  input.setFlight(false);
  assert.equal(input.state.vertical, 0);
  assert.deepEqual(events, []);
});

test("pausing or losing focus clears all gestures and cancels charge once", () => {
  const { input, events } = setup();
  const state = input.state;
  input.setFlight(true);
  input.begin("move", 1);
  input.moveStick(1, 1, -1);
  input.begin("jump", 2);
  input.begin("fire", 4);
  input.reset();
  input.reset();
  input.end(4);
  assert.equal(state, input.state);
  assert.deepEqual(state, { forward: 0, right: 0, vertical: 0 });
  assert.deepEqual(events, ["begin", "cancel"]);
  assert.equal(input.begin("fire", 5), true);
  input.end(5);
  assert.deepEqual(events, ["begin", "cancel", "begin", "release"]);
});
