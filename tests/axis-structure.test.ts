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

test("twenty enlarged wings share geometry and clear the enclosure through their full tilt", () => {
  const { parent, axis } = fixture();
  axis.update(0);
  parent.updateMatrixWorld(true);
  const panels = parent.getObjectByName("Solar-radiator wing substrates");
  assert.ok(panels instanceof THREE.InstancedMesh);
  assert.equal(panels.count, 20);
  const matrix = new THREE.Matrix4();
  const box = new THREE.Box3();
  panels.geometry.computeBoundingBox();
  assert.ok(panels.geometry.boundingBox!.getSize(new THREE.Vector3()).x >= 76);
  assert.ok(panels.geometry.boundingBox!.getSize(new THREE.Vector3()).y >= 28);
  const hinge = new THREE.Matrix4();
  const position = new THREE.Vector3();
  for (const tilt of [-Math.PI / 2, -Math.PI / 4, 0, Math.PI / 4, Math.PI / 2]) {
    hinge.makeRotationX(tilt);
    const positiveRows: THREE.Box3[] = [];
    for (let index = 0; index < panels.count; index++) {
      panels.getMatrixAt(index, matrix);
      position.setFromMatrixPosition(matrix);
      // Exercise the entire mechanical hinge range, beyond today's Sun angle.
      matrix.makeTranslation(position.x, position.y, position.z).multiply(hinge);
      box.copy(panels.geometry.boundingBox!).applyMatrix4(matrix);
      assert.ok(box.min.y > 35 || box.max.y < -35);
      assert.ok(box.min.x > 11 || box.max.x < -11);
      if (position.x > 0 && position.y > 0) positiveRows.push(box.clone());
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            assert.ok(panels.boundingSphere!.containsPoint(new THREE.Vector3(x, y, z)));
          }
        }
      }
    }
    positiveRows.sort((a, b) => a.min.y - b.min.y);
    assert.equal(positiveRows.length, 5);
    for (let row = 1; row < positiveRows.length; row++) {
      assert.ok(positiveRows[row].min.y - positiveRows[row - 1].max.y > 9.9);
    }
  }
  const bounds = new THREE.Box3().setFromObject(axis.root);
  assert.ok(bounds.min.y < -258 && bounds.max.y > 258);
  const collars: number[] = [];
  axis.root.traverse((object) => {
    if (object.name === "Axial docking collar") collars.push(Math.abs(object.position.y));
  });
  assert.equal(collars.length, 2);
  assert.ok(collars.every((y) => y > 245));
});
