import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildDeckSurface } from "../src/deck-surface.ts";
import { FLOOR_RADIUS, HALF_WIDTH } from "../src/physics.ts";

function deck() {
  const geometry = buildDeckSurface();
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.updateMatrixWorld();
  return { geometry, material, mesh, dispose() { geometry.dispose(); material.dispose(); } };
}

test("opposite-side rays encounter one deck at every position across its width", () => {
  const surface = deck();
  try {
    for (const angle of [0, 0.021, 0.78, 1.67, 3.03, 5.6]) {
      for (let step = 0; step <= 88; step++) {
        const across = -21.999 + step * 43.998 / 88;
        const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const origin = radial.clone().multiplyScalar(FLOOR_RADIUS - 1.7);
        origin.y = across;
        const ray = new THREE.Raycaster(origin, radial.clone().negate(), 0.08, 500);
        const hits = ray.intersectObject(surface.mesh);
        // Adjacent triangles share their edge, so a ray exactly on it may hit twice.
        const distances = [...new Set(hits.map((hit) => hit.distance.toFixed(5)))];
        assert.equal(distances.length, 1, `across ${across}, angle ${angle}`);
        assert.ok(Math.abs(hits[0].distance - (2 * FLOOR_RADIUS - 1.7)) < 0.02);
      }
    }
  } finally { surface.dispose(); }
});

test("all deck vertices share the physics radius and smooth inward normals", () => {
  const geometry = buildDeckSurface();
  try {
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const radial = new THREE.Vector3(positions.getX(vertex), 0, positions.getZ(vertex));
      const normal = new THREE.Vector3().fromBufferAttribute(normals, vertex);
      assert.ok(Math.abs(radial.length() - FLOOR_RADIUS) < 2e-5);
      assert.ok(Math.abs(normal.length() - 1) < 1e-7);
      assert.ok(radial.normalize().dot(normal) < -0.9999999);
      assert.equal(normal.y, 0);
      assert.ok(Math.abs(positions.getY(vertex)) <= HALF_WIDTH);
    }
    assert.equal(geometry.groups.length, 0, "one material needs only one draw");
  } finally { geometry.dispose(); }
});

test("paths, lawn, terraces and edges meet without stacked surface area", () => {
  const surface = deck();
  try {
    const expected = [
      [-21.95, "#bac4b2"], [-21.6, "#e4dfc8"], [-18, "#719f77"],
      [-11.7, "#c7cdb9"], [-6, "#719f77"], [-3.6, "#bac4b2"],
      [-3.45, "#82dacf"], [0, "#e4dfc8"], [3.45, "#82dacf"],
      [3.6, "#bac4b2"], [6, "#719f77"], [11.7, "#c7cdb9"],
      [18, "#719f77"], [21.6, "#e4dfc8"], [21.95, "#bac4b2"],
    ] as const;
    const colors = surface.geometry.getAttribute("color");
    for (const [across, hex] of expected) {
      const hits = new THREE.Raycaster(new THREE.Vector3(FLOOR_RADIUS - 1.7, across, 0), new THREE.Vector3(-1, 0, 0)).intersectObject(surface.mesh);
      assert.ok(hits.length > 0);
      const color = new THREE.Color(hex);
      for (const hit of hits) {
        assert.ok(hit.face);
        for (const vertex of [hit.face.a, hit.face.b, hit.face.c]) {
          assert.ok(Math.abs(colors.getX(vertex) - color.r) < 1e-7);
          assert.ok(Math.abs(colors.getY(vertex) - color.g) < 1e-7);
          assert.ok(Math.abs(colors.getZ(vertex) - color.b) < 1e-7);
        }
      }
    }
    const positions = surface.geometry.getAttribute("position");
    const index = surface.geometry.getIndex()!;
    let area = 0;
    const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3();
    for (let triangle = 0; triangle < index.count; triangle += 3) {
      a.fromBufferAttribute(positions, index.getX(triangle));
      b.fromBufferAttribute(positions, index.getX(triangle + 1));
      c.fromBufferAttribute(positions, index.getX(triangle + 2));
      area += b.sub(a).cross(c.sub(a)).length() / 2;
    }
    const expectedArea = 384 * 2 * FLOOR_RADIUS * Math.sin(Math.PI / 384) * (2 * HALF_WIDTH);
    assert.ok(Math.abs(area - expectedArea) / expectedArea < 1e-7, "exactly one cylinder of area, without overlapping layers");
  } finally { surface.dispose(); }
});
