import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildTramSystem } from "../src/trams.ts";
import { FLOOR_RADIUS } from "../src/physics.ts";
import { TRAM_PLATFORM_ACROSS, TRAM_PLATFORM_HEIGHT } from "../src/tram-physics.ts";

test("station shelter and sign posts enter the curved platform rather than hovering above it", () => {
  const root = new THREE.Group();
  const trams = buildTramSystem(root, []);
  try {
    root.updateMatrixWorld(true);
    const fittings = trams.root.children.find((object) => object instanceof THREE.Mesh &&
      object.material instanceof THREE.MeshStandardMaterial && object.material.vertexColors);
    assert.ok(fittings instanceof THREE.Mesh);
    for (const side of [-1, 1]) for (let station = 0; station < 6; station++) {
      const angle = station / 6 * Math.PI * 2;
      const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
      const up = new THREE.Vector3(-Math.cos(angle), 0, -Math.sin(angle));
      const anchor = new THREE.Matrix4().makeBasis(tangent, up, new THREE.Vector3(0, -1, 0));
      anchor.setPosition((FLOOR_RADIUS - TRAM_PLATFORM_HEIGHT) * Math.cos(angle), side * TRAM_PLATFORM_ACROSS,
        (FLOOR_RADIUS - TRAM_PLATFORM_HEIGHT) * Math.sin(angle));
      for (const [x, z, halfWidth] of [[-5.9, side * 0.7, 0.055], [-2.3, side * 0.7, 0.055], [4, side * 0.56, 0.045]]) {
        const radius = FLOOR_RADIUS - TRAM_PLATFORM_HEIGHT;
        const surfaceHeight = radius - Math.sqrt(radius * radius - x * x);
        const origin = new THREE.Vector3(x - 0.2, surfaceHeight + 0.02, z).applyMatrix4(anchor);
        const hit = new THREE.Raycaster(origin, tangent).intersectObject(fittings)[0];
        assert.ok(hit && hit.distance <= 0.2 - halfWidth + 1e-4, `station ${station}, side ${side}, fitting ${x} floats`);
      }
    }
  } finally { trams.dispose(); }
});
