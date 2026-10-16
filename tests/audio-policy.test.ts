import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceFootsteps,
  audibleGain,
  clampAudioVolume,
  spatialTramSound,
  tramArrived,
  tramSoundPhase,
  tramSoundPosition,
} from "../src/audio-policy.ts";
import { getTramState } from "../src/tram-motion.ts";

test("volume is bounded and all audio shares the vacuum, pause and mute gate", () => {
  assert.equal(clampAudioVolume(-1), 0);
  assert.equal(clampAudioVolume(2), 1);
  assert.equal(clampAudioVolume(NaN), 0);
  assert.equal(clampAudioVolume(Infinity), 0);
  assert.equal(audibleGain(0.35, false, true, true), 0.35);
  assert.equal(audibleGain(0.35, false, true, false), 0);
  assert.equal(audibleGain(0.35, false, false, true), 0);
  assert.equal(audibleGain(0.35, true, true, true), 0);
});

test("tram motor and brake phases follow the shared analytical timetable", () => {
  assert.equal(tramSoundPhase(getTramState(0, "spinward")), "stopped");
  assert.equal(tramSoundPhase(getTramState(8, "spinward")), "accelerating");
  assert.equal(tramSoundPhase(getTramState(16.9, "spinward")), "accelerating");
  assert.equal(tramSoundPhase(getTramState(17, "spinward")), "braking");
  assert.equal(tramSoundPhase(getTramState(25.9, "spinward")), "braking");
  assert.equal(tramSoundPhase(getTramState(26, "spinward")), "stopped");
});

test("arrival is emitted once at a live stop, never on startup, dwell or time skip", () => {
  assert.equal(tramArrived(25.95, 26.05, 0.1, "spinward"), true);
  assert.equal(tramArrived(26.05, 26.15, 0.1, "spinward"), false);
  assert.equal(tramArrived(null, 26.05, 0.1, "spinward"), false);
  assert.equal(tramArrived(25.95, 26.05, 0, "spinward"), false);
  assert.equal(tramArrived(25.95, 26.05, 0.1, "antispinward"), false);
  assert.equal(tramArrived(12.95, 13.05, 0.1, "antispinward"), true);
  assert.equal(tramArrived(25, 52.01, 0.016, "spinward"), false);
  assert.equal(tramArrived(25, 26.01, 0.016, "spinward"), false);
  assert.equal(tramArrived(26.05, 25.95, 0.1, "spinward"), false);
  // A normal frame at 10× can cross an arrival without losing the event.
  assert.equal(tramArrived(25.6, 26.1, 0.5, "spinward"), true);
});

test("tram sound comes from the correct track, attenuates and pans with the camera", () => {
  const right = tramSoundPosition(0, "spinward");
  const left = tramSoundPosition(0, "antispinward");
  assert.equal(right.y, 9);
  assert.equal(left.y, -9);
  const listener = { x: right.x, y: 0, z: 0 };
  const forward = { x: 0, y: 0, z: -1 };
  const up = { x: -1, y: 0, z: 0 };
  const first = spatialTramSound(listener, forward, up, right);
  const second = spatialTramSound(listener, forward, up, left);
  assert.equal(first.pan, 1);
  assert.equal(second.pan, -1);
  assert.equal(first.gain, second.gain);
  const opposite = spatialTramSound(listener, forward, up,
    tramSoundPosition(Math.PI, "spinward"));
  assert.equal(opposite.gain, 0);
  assert.ok(first.gain > 0.6 && first.gain < 0.8);
  assert.equal(spatialTramSound(right, forward, up, right).pan, 0);
});

test("footsteps use relative walking distance, stop in flight, and cap fast-time cadence", () => {
  let phase = 0;
  let steps = 0;
  for (let frame = 0; frame < 120; frame++) {
    const next = advanceFootsteps(phase, 1 / 60, 3.3, 1, true);
    phase = next.phase;
    steps += Number(next.step);
  }
  assert.ok(steps === 3 || steps === 4);
  assert.deepEqual(advanceFootsteps(0.99, 0.1, 20, 10, false), { phase: 0, step: false });
  assert.deepEqual(advanceFootsteps(0.99, 0.1, 0, 10, true), { phase: 0, step: false });
  assert.deepEqual(advanceFootsteps(0.7, 0, 3.3, 1, true), { phase: 0.7, step: false });
  phase = 0;
  steps = 0;
  for (let frame = 0; frame < 600; frame++) {
    const next = advanceFootsteps(phase, 1 / 60, 20, 10, true);
    phase = next.phase;
    steps += Number(next.step);
  }
  assert.ok(steps >= 37 && steps <= 38);
  assert.equal(advanceFootsteps(0, 3, 20, 10, true).step, false);
});
