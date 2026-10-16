import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildHabitat } from "../src/habitat.ts";

test("habitat preserves the caller's background so the sky pass remains visible", () => {
  for (const background of [null, new THREE.Color("#123456")]) {
    const scene = new THREE.Scene();
    scene.background = background;
    const habitat = buildHabitat(scene);
    try {
      assert.equal(scene.background, background,
        "an opaque habitat background clears the previously rendered Earth, Moon and Sun");
    } finally { habitat.dispose(); }
    assert.equal(scene.background, background);
  }
});
