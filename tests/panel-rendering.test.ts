import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildAxisStructure } from "../src/axis-structure.ts";

test("each wing has one continuous exposed skin per side without competing opaque layers", () => {
  const material = new THREE.MeshStandardMaterial();
  const { root } = buildAxisStructure(new THREE.Group(), {
    structure: material, trim: material, hub: material, glass: material, cyan: material,
  });
  // Inspect one reusable wing before its world/hinge transform. Rays pass through
  // cell interiors, seams, and the corners of the active panel area.
  const wing = new THREE.Group();
  for (const name of ["Solar-radiator wing substrates", "Sun-facing solar cells", "Shaded radiator faces"]) {
    const source = root.getObjectByName(name);
    assert.ok(source instanceof THREE.InstancedMesh);
    const part = new THREE.Mesh(source.geometry, source.material);
    part.name = name;
    wing.add(part);
  }
  wing.updateMatrixWorld(true);
  for (const [x, y] of [[0, 0], [0.85, 1.1], [8.6, 6.3], [21.5, -8.6], [27.3, 10.3], [-27.3, -10.3]]) {
    for (const side of [-1, 1]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, side * 2), new THREE.Vector3(0, 0, -side), 0, 4);
      const hits = ray.intersectObject(wing, true);
      // The shared diagonal can legitimately yield both triangles of one skin.
      assert.ok(hits.length >= 1);
      const expected = side > 0 ? "Sun-facing solar cells" : "Shaded radiator faces";
      assert.ok(hits.every((hit) => hit.object.name === expected), `${x}, ${y}, ${side}: ${hits.map((hit) => hit.object.name)}`);
      assert.ok(hits.every((hit) => Math.abs(hit.point.z - side * 0.2) < 1e-6));
    }
  }
});
