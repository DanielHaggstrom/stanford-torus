import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildAxisStructure } from "../src/axis-structure.ts";
import { getAxisPose } from "../src/axis-tracking.ts";
import { ANGULAR_SPEED } from "../src/physics.ts";

function fixture() {
  const parent = new THREE.Group();
  const material = new THREE.MeshStandardMaterial();
  const axis = buildAxisStructure(parent, {
    structure: material, trim: material, hub: material, glass: material, cyan: material,
  });
  return { parent, axis };
}

function panelNormal(parent: THREE.Group, name: string): THREE.Vector3 {
  const object = parent.getObjectByName(name);
  assert.ok(object instanceof THREE.InstancedMesh);
  const matrix = new THREE.Matrix4();
  object.getMatrixAt(0, matrix);
  matrix.premultiply(object.matrixWorld);
  return new THREE.Vector3().fromBufferAttribute(object.geometry.getAttribute("normal"), 0)
    .applyMatrix3(new THREE.Matrix3().getNormalMatrix(matrix)).normalize();
}

test("rendered solar and radiator faces retain opposite Sun-facing orientations", () => {
  const { parent, axis } = fixture();
  for (const seconds of [0, 19, 1200, 4200, 90000]) {
    axis.update(seconds);
    parent.rotation.y = ANGULAR_SPEED * seconds;
    parent.updateMatrixWorld(true);
    const pose = getAxisPose(seconds);
    const desired = new THREE.Vector3().copy(pose.solarNormal);
    // Instanced transforms are uploaded as Float32 even in this headless test.
    assert.ok(panelNormal(parent, "Sun-facing solar cells").distanceTo(desired) < 1e-7);
    assert.ok(panelNormal(parent, "Shaded radiator faces").distanceTo(desired.negate()) < 1e-7);
  }
});

test("the complete axis holds inertial attitude throughout eclipse while its parent spins", () => {
  const { parent, axis } = fixture();
  const inertialAxis = new THREE.Quaternion();
  axis.update(2700);
  parent.rotation.y = ANGULAR_SPEED * 2700;
  parent.updateMatrixWorld(true);
  axis.root.getWorldQuaternion(inertialAxis);
  for (const seconds of [3000, 3500, 3900]) {
    axis.update(seconds);
    parent.rotation.y = ANGULAR_SPEED * seconds;
    parent.updateMatrixWorld(true);
    assert.ok(inertialAxis.angleTo(axis.root.getWorldQuaternion(new THREE.Quaternion())) < 1e-7);
  }
});

test("paired wings remain outside the enclosure and use shared instanced geometry", () => {
  const { parent, axis } = fixture();
  axis.update(0);
  parent.updateMatrixWorld(true);
  const panels = parent.getObjectByName("Solar-radiator wing substrates");
  assert.ok(panels instanceof THREE.InstancedMesh);
  assert.equal(panels.count, 12);
  const matrix = new THREE.Matrix4();
  const box = new THREE.Box3();
  panels.geometry.computeBoundingBox();
  for (let index = 0; index < panels.count; index++) {
    panels.getMatrixAt(index, matrix);
    box.copy(panels.geometry.boundingBox!).applyMatrix4(matrix);
    assert.ok(box.min.y > 24 || box.max.y < -24);
  }
  const bounds = new THREE.Box3().setFromObject(axis.root);
  assert.ok(bounds.min.y < -175 && bounds.max.y > 175);
});
