import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildHabitat } from "../src/habitat.ts";

test("one water draw retains all sixteen reservoir patches at their original positions", () => {
  const scene = new THREE.Scene();
  const habitat = buildHabitat(scene);
  try {
    const water = habitat.root.getObjectByName("Batched reservoir water") as THREE.Mesh;
    assert.ok(water instanceof THREE.Mesh);
    assert.equal(water.geometry.getIndex()!.count / 3, 320);
    assert.equal(water.geometry.groups.length, 0);
    scene.updateMatrixWorld(true);
    for (const lot of [25, 26, 28, 29, 31, 32, 34, 35]) {
      const angle = lot / 72 * Math.PI * 2;
      for (const side of [-1, 1]) {
        const origin = new THREE.Vector3(190 * Math.cos(angle), side * 16.1, 190 * Math.sin(angle));
        const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const hits = new THREE.Raycaster(origin, direction, 0, 30).intersectObject(water);
        const distances = [...new Set(hits.map((hit) => hit.distance.toFixed(4)))];
        assert.equal(distances.length, 1, `missing or overlapping pool at lot${lot}, side${side}`);
        assert.ok(Math.abs(hits[0].distance - 19.87) < 0.001);
      }
    }
  } finally { habitat.dispose(); }
});
