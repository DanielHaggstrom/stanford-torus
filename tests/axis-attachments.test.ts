import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as THREE from "three";
import { buildAxisStructure } from "../src/axis-structure.ts";

const root = new THREE.Group(), material = new THREE.MeshStandardMaterial();
buildAxisStructure(root, { structure: material, trim: material, hub: material, glass: material, cyan: material });
root.updateMatrixWorld(true);
after(() => {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((value) => materials.add(value));
  });
  geometries.forEach((geometry) => geometry.dispose()); materials.forEach((value) => value.dispose());
});
function object(name: string): THREE.Mesh {
  const found = root.getObjectByName(name); assert.ok(found instanceof THREE.Mesh); return found;
}
function matrix(mesh: THREE.Mesh, index: number): THREE.Matrix4 {
  assert.ok(mesh instanceof THREE.InstancedMesh);
  const result = new THREE.Matrix4(); mesh.getMatrixAt(index, result); return result.premultiply(mesh.matrixWorld);
}
function hits(origin: THREE.Vector3, direction: THREE.Vector3, targets: THREE.Object3D[]): number {
  return new THREE.Raycaster(origin, direction).intersectObjects(targets)[0]?.distance ?? Infinity;
}

test("facility portholes and equipment mount flush across their entire back footprint", () => {
  const hull = object("Closed pressure-vessel modules");
  for (const name of ["Sealed facility portholes", "External facility service equipment"]) {
    const decorations = object(name) as THREE.InstancedMesh;
    for (let index = 0; index < decorations.count; index++) {
      const transform = matrix(decorations, index);
      const depth = new THREE.Vector3().setFromMatrixColumn(transform, 2).length();
      const direction = new THREE.Vector3(0, 0, -1).transformDirection(transform);
      for (const x of [-0.5, 0.5]) for (const y of [-0.5, 0.5]) {
        const front = new THREE.Vector3(x, y, 0.5).applyMatrix4(transform);
        assert.ok(hits(front, direction, [hull]) <= depth + 1e-4, `${name} ${index} floats at a corner`);
      }
    }
  }
});

test("closed hatch plates sit on their chambers and their warning strips stay on the doors", () => {
  const doors = object("Closed airlock and docking hatches") as THREE.InstancedMesh;
  const supports = [object("Airlock pressure chambers"), object("Facility docking collars")];
  const warnings = object("Airlock identification strips") as THREE.InstancedMesh;
  for (let index = 0; index < doors.count; index++) {
    const transform = matrix(doors, index);
    const depth = new THREE.Vector3().setFromMatrixColumn(transform, 1).length();
    const front = new THREE.Vector3(0, 0.5, 0).applyMatrix4(transform);
    assert.ok(hits(front, new THREE.Vector3(0, -1, 0).transformDirection(transform), supports) <= depth + 1e-4);
    const inverse = transform.clone().invert();
    for (const warning of [index * 2, index * 2 + 1]) {
      const local = matrix(warnings, warning).premultiply(inverse);
      for (const x of [-0.5, 0.5]) for (const z of [-0.5, 0.5]) {
        const back = new THREE.Vector3(x, -0.5, z).applyMatrix4(local);
        assert.ok(Math.hypot(back.x, back.z) <= 1 && back.y <= 0.501);
      }
    }
  }
  const flanges = object("Pressure-lock flange rings") as THREE.InstancedMesh;
  for (let index = 0; index < flanges.count; index++) {
    const lock = Math.floor(index / 2);
    const relative = matrix(flanges, index).premultiply(matrix(supports[lock < 4 ? 0 : 1], lock < 4 ? lock : lock - 4).invert());
    const vertices = flanges.geometry.getAttribute("position");
    assert.ok(Array.from({ length: vertices.count }, (_, vertex) => new THREE.Vector3()
      .fromBufferAttribute(vertices, vertex).applyMatrix4(relative))
      .some((point) => Math.hypot(point.x, point.z) < 1 && Math.abs(point.y) < 0.5), `flange ${index} floats around its chamber`);
  }
});

test("dish and antenna roots enter pressure vessels and mast crossbars meet their spars", () => {
  const hull = object("Closed pressure-vessel modules");
  const mounts = object("Dish feeds and mounts") as THREE.InstancedMesh;
  for (let index = 0; index < mounts.count; index += 5) {
    const transform = matrix(mounts, index);
    const base = new THREE.Vector3(0, -0.5, 0).applyMatrix4(transform);
    const tip = new THREE.Vector3(0, 0.5, 0).applyMatrix4(transform);
    assert.ok(hits(tip, base.clone().sub(tip).normalize(), [hull]) < tip.distanceTo(base));
  }
  const trusses = object("Facility antenna masts and exterior trusses") as THREE.InstancedMesh;
  const spars: THREE.Line3[] = [], bars: THREE.Vector3[] = [];
  for (let index = 8; index < trusses.count; index++) {
    const transform = matrix(trusses, index);
    const a = new THREE.Vector3(0, -0.5, 0).applyMatrix4(transform);
    const b = new THREE.Vector3(0, 0.5, 0).applyMatrix4(transform);
    if (a.distanceTo(b) > 20) {
      spars.push(new THREE.Line3(a, b));
      assert.ok(hits(b, a.clone().sub(b).normalize(), [hull]) < b.distanceTo(a));
    } else bars.push(a.add(b).multiplyScalar(0.5));
  }
  for (const center of bars) assert.ok(spars.some((spar) => spar.closestPointToPoint(center, true, new THREE.Vector3()).distanceTo(center) < 1e-4));
});

test("array roots enter the shoulder and torque shafts fit between tilting panel skins", () => {
  const shoulder = object("Array service shoulder");
  const inverse = shoulder.matrixWorld.clone().invert();
  const members = object("Service-spine longerons and array axles") as THREE.InstancedMesh;
  for (let index = 0; index < members.count; index++) {
    const transform = matrix(members, index);
    if (index < 4) {
      const foot = new THREE.Vector3(0, -0.5, 0).applyMatrix4(transform).applyMatrix4(inverse);
      const radius = 10.8 + (foot.y + 4) / 8 * (4.4 - 10.8);
      assert.ok(Math.abs(foot.y) < 4 && Math.hypot(foot.x, foot.z) < radius);
    } else {
      const radius = new THREE.Vector3().setFromMatrixColumn(transform, 0).length();
      assert.ok(radius < 0.2, "array shaft pierces the solar and radiator skins");
    }
  }
  const conduit = object("Array coolant and power conduit");
  conduit.geometry.computeBoundingBox();
  assert.ok(new THREE.Box3().copy(conduit.geometry.boundingBox!).applyMatrix4(conduit.matrixWorld).min.y < 31.5);
});
