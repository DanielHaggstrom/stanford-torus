import assert from "node:assert/strict";
import test from "node:test";
import { getRenderBudget } from "../src/render-quality.ts";

test("automatic desktop and full quality preserve the desktop rendering budget", () => {
  assert.deepEqual(getRenderBudget("auto", false, 2), { pixelRatio: 1.75, ghostHz: 24 });
  assert.deepEqual(getRenderBudget("full", false, 2), { pixelRatio: 1.75, ghostHz: 24 });
  assert.deepEqual(getRenderBudget("full", true, 2), { pixelRatio: 1.75, ghostHz: 24 });
});

test("touch auto and explicit balanced quality reduce only the rendering budget", () => {
  assert.deepEqual(getRenderBudget("auto", true, 3), { pixelRatio: 1, ghostHz: 15 });
  assert.deepEqual(getRenderBudget("balanced", false, 2), { pixelRatio: 1, ghostHz: 15 });
  assert.deepEqual(getRenderBudget("balanced", true, 2), { pixelRatio: 1, ghostHz: 15 });
});

test("low device pixel ratios are never scaled up", () => {
  assert.equal(getRenderBudget("auto", false, 0.75).pixelRatio, 0.75);
  assert.equal(getRenderBudget("auto", true, 0.75).pixelRatio, 0.75);
  assert.equal(getRenderBudget("full", true, 0.5).pixelRatio, 0.5);
});

test("invalid device pixel ratios use a finite positive fallback", () => {
  for (const ratio of [0, -1, Number.NaN, Infinity, -Infinity]) {
    assert.deepEqual(getRenderBudget("auto", false, ratio), { pixelRatio: 1, ghostHz: 24 });
    assert.deepEqual(getRenderBudget("auto", true, ratio), { pixelRatio: 1, ghostHz: 15 });
  }
});
