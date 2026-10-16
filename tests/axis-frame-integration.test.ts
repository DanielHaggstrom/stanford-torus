import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildAxisStructure } from "../src/axis-structure.ts";
import { getOrbitState } from "../src/orbit.ts";
import { ANGULAR_SPEED } from "../src/physics.ts";
import type { Vec3 } from "../src/physics.ts";

function fixture() {
  const scene = new THREE.Scene();
  const habitat = new THREE.Group();
  scene.add(habitat);
  const material = new THREE.MeshStandardMaterial();
  const axis = buildAxisStructure(habitat, {
    structure: material,
    trim: material,
    hub: material,
    glass: material,
    cyan: material,
  });
  const solar = axis.root.getObjectByName("Sun-facing solar cells");
  const radiator = axis.root.getObjectByName("Shaded radiator faces");
  assert.ok(solar instanceof THREE.InstancedMesh);
  assert.ok(radiator instanceof THREE.InstancedMesh);
  return {
    scene,
    axis,
    solar,
    radiator,
    update(seconds: number, frame: "habitat" | "inertial") {
      scene.rotation.y = frame === "inertial"
        ? (ANGULAR_SPEED * seconds) % (Math.PI * 2)
        : 0;
      axis.update(seconds);
      scene.updateMatrixWorld(true);
    },
    dispose() {
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>([material]);
      axis.root.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          geometries.add(object.geometry);
          const owned = Array.isArray(object.material) ? object.material : [object.material];
          owned.forEach((entry) => materials.add(entry));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((entry) => entry.dispose());
    },
  };
}

function instanceWorldMatrix(mesh: THREE.InstancedMesh, index: number): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  return matrix.premultiply(mesh.matrixWorld);
}

function faceNormal(mesh: THREE.InstancedMesh, instance: number): THREE.Vector3 {
  return new THREE.Vector3()
    .fromBufferAttribute(mesh.geometry.getAttribute("normal"), 0)
    .applyMatrix3(new THREE.Matrix3().getNormalMatrix(instanceWorldMatrix(mesh, instance)))
    .normalize();
}

function nearVector(actual: THREE.Vector3, expected: Vec3, tolerance = 1e-6): void {
  assert.ok(
    actual.distanceTo(new THREE.Vector3(expected.x, expected.y, expected.z)) < tolerance,
    `${actual.toArray()} ≠ ${[expected.x, expected.y, expected.z]}`,
  );
}

test("built panel faces and hinges point toward the Sun in both rendered frames", () => {
  const world = fixture();
  try {
    for (const seconds of [0, 13, 2200, 4100, 100_000]) {
      for (const frame of ["habitat", "inertial"] as const) {
        world.update(seconds, frame);
        const orbit = getOrbitState(seconds, frame);
        assert.ok(orbit.sunlight > 0.01);
        for (let instance = 0; instance < world.solar.count; instance += 1) {
          nearVector(faceNormal(world.solar, instance), orbit.sunDirection);
          nearVector(faceNormal(world.radiator, instance).negate(), orbit.sunDirection);
        }
      }
    }
    // Both faces use their outward winding; the radiator cannot show through
    // the solar side of the opaque substrate as a double-sided overlay.
    assert.equal((world.solar.material as THREE.Material).side, THREE.FrontSide);
    assert.equal((world.radiator.material as THREE.Material).side, THREE.FrontSide);
    for (const mesh of [world.solar, world.radiator]) {
      const vertices = mesh.geometry.getAttribute("position");
      const indices = mesh.geometry.index;
      const vertex = (i: number) => new THREE.Vector3().fromBufferAttribute(
        vertices, indices ? indices.getX(i) : i,
      );
      const a = vertex(0);
      const winding = vertex(1).sub(a).cross(vertex(2).sub(a)).normalize();
      const normal = new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute("normal"), 0);
      assert.ok(winding.dot(normal) > 0.999999);
    }
  } finally {
    world.dispose();
  }
});

