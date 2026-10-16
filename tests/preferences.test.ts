import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  loadPreferences,
  sanitizePreferences,
  savePreferences,
} from "../src/preferences.ts";

test("new or unavailable storage uses independent default preferences", () => {
  const preferences = loadPreferences(null);
  assert.deepEqual(preferences, DEFAULT_PREFERENCES);
  preferences.soundMuted = true;
  assert.equal(DEFAULT_PREFERENCES.soundMuted, false);
  assert.deepEqual(loadPreferences({ getItem: () => null }), DEFAULT_PREFERENCES);
  assert.deepEqual(loadPreferences({ getItem: () => { throw new Error("Blocked"); } }), DEFAULT_PREFERENCES);
});

test("preferences round trip with an explicit storage schema version", () => {
  let savedKey = "";
  let savedValue = "";
  const preferences = {
    mouseSensitivity: 1.3,
    touchSensitivity: 0.7,
    inputMode: "touch" as const,
    graphicsQuality: "balanced" as const,
    soundVolume: 0.6,
    soundMuted: true,
  };
  savePreferences({ setItem: (key, value) => { savedKey = key; savedValue = value; } }, preferences);
  assert.equal(savedKey, PREFERENCES_KEY);
  assert.equal(JSON.parse(savedValue).version, 1);
  assert.deepEqual(loadPreferences({ getItem: () => savedValue }), preferences);
});

test("malformed JSON and unsupported schemas fall back safely", () => {
  for (const value of ["garbage", "null", "[]", "1", '{"version":2,"soundMuted":true}', '{"soundMuted":true}']) {
    assert.deepEqual(loadPreferences({ getItem: () => value }), DEFAULT_PREFERENCES);
  }
});

test("numeric preferences clamp but reject strings and non-finite values", () => {
  const preferences = sanitizePreferences({
    mouseSensitivity: 20,
    touchSensitivity: -1,
    soundVolume: 3,
  });
  assert.equal(preferences.mouseSensitivity, 2);
  assert.equal(preferences.touchSensitivity, 0.3);
  assert.equal(preferences.soundVolume, 1);
  assert.equal(sanitizePreferences({ soundVolume: -4 }).soundVolume, 0);
  assert.deepEqual(sanitizePreferences({
    mouseSensitivity: Number.NaN,
    touchSensitivity: Infinity,
    soundVolume: "0.8",
    inputMode: "joystick",
    graphicsQuality: "ultra",
    soundMuted: "true",
  }), DEFAULT_PREFERENCES);
});

test("unknown fields are dropped and partial preferences retain defaults", () => {
  const preferences = sanitizePreferences({ soundMuted: true, unknown: "ignored" });
  assert.deepEqual(preferences, { ...DEFAULT_PREFERENCES, soundMuted: true });
  for (const value of [null, undefined, [], 1, "invalid"]) {
    assert.deepEqual(sanitizePreferences(value), DEFAULT_PREFERENCES);
  }
});

test("saving tolerates blocked or full storage and sanitizes inputs", () => {
  assert.doesNotThrow(() => savePreferences(null, { ...DEFAULT_PREFERENCES }));
  assert.doesNotThrow(() => savePreferences({ setItem: () => { throw new Error("Quota"); } }, { ...DEFAULT_PREFERENCES }));
  let savedValue = "";
  savePreferences({ setItem: (_key, value) => { savedValue = value; } }, { ...DEFAULT_PREFERENCES, soundVolume: 20 });
  assert.equal(JSON.parse(savedValue).soundVolume, 1);
});
