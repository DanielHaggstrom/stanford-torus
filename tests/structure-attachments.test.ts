import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as THREE from "three";
import { buildHabitatStructure } from "../src/habitat-structure.ts";
import { buildHabitatLighting } from "../src/habitat-lighting.ts";
import { buildElevators } from "../src/elevators.ts";
import { FLOOR_RADIUS } from "../src/physics.ts";
import { ENCLOSURE_HEIGHT, ENCLOSURE_HALF_WIDTH, ENCLOSURE_HULL_DEPTH } from "../src/habitat-volume.ts";

const root = new THREE.Group();
const material = new THREE.MeshStandardMaterial();
const glass = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true });
buildHabitatStructure(root, { structure: material, trim: material, hub: material, glass: material, roofGlass: glass, cyan: material });
const lights = buildHabitatLighting(root);
buildElevators(root, () => {});
root.updateMatrixWorld(true);
after(() => {
  lights.dispose();
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
function rayDistance(origin: THREE.Vector3, direction: THREE.Vector3, target: THREE.Object3D): number {
  return new THREE.Raycaster(origin, direction).intersectObject(target)[0]?.distance ?? Infinity;
}

test("canopy ribs coincide with their glazing panels and all spoke roots enter the hub", () => {
  const frames = object("Primary pressure ribs and trusses") as THREE.InstancedMesh;
  const canopy = object("Continuous pressure canopy");
  // The first 24*24 instances are the main canopy ribs, before spoke longerons.
  for (let index = 0; index < 24 * 24; index++) {
    const point = new THREE.Vector3().setFromMatrixPosition(matrix(frames, index));
    const outward = point.clone().setY(0).normalize();
    const distance = rayDistance(point.clone().addScaledVector(outward, 0.5), outward.negate(), canopy);
    assert.ok(Math.abs(distance - 0.5) < 1e-4, `rib ${index} floats from its glazing`);
  }
  const hub = object("Stationary bearing hub");
  const inverse = hub.matrixWorld.clone().invert();
  for (let index = 24 * 24; index < frames.count; index++) {
    const endpoint = new THREE.Vector3(0, -0.5, 0).applyMatrix4(matrix(frames, index)).applyMatrix4(inverse);
    assert.ok(Math.hypot(endpoint.x, endpoint.z) < 10.9 && Math.abs(endpoint.y) < 23.5);
  }
});

test("crown and spoke lamps physically touch their supports", () => {
  const housings = object("Enclosure streetlight housings") as THREE.InstancedMesh;
  const canopy = object("Continuous pressure canopy");
  for (let index = 2; index < housings.count; index += 3) {
    const point = new THREE.Vector3().setFromMatrixPosition(matrix(housings, index));
    assert.ok(rayDistance(point, point.clone().setY(0).normalize().negate(), canopy) <= 0.161);
  }
  const lamps = object("Structural service light housings") as THREE.InstancedMesh;
  const spokes = object("Spoke transit passages");
  for (let index = 0; index < lamps.count; index++) {
    const point = new THREE.Vector3().setFromMatrixPosition(matrix(lamps, index));
    const towardTube = new THREE.Vector3(0, Math.sign(point.y), 0);
    point.addScaledVector(towardTube, -0.16);
    assert.ok(rayDistance(point, towardTube, spokes) <= 0.321);
  }
  const markers = object("Pressure-wall marker lights") as THREE.InstancedMesh;
  const boxes = object("Structural joints and service boxes");
  for (let index = 0; index < markers.count; index++) {
    const point = new THREE.Vector3().setFromMatrixPosition(matrix(markers, index));
    assert.ok(rayDistance(point, new THREE.Vector3(0, Math.sign(point.y), 0), boxes) <= 0.061);
  }
});

test("terminal signs and lights sit on the facade and hub doors clear the rotating drum", () => {
  const housings = object("Closed elevator terminal housings");
  for (const name of ["Elevator direction symbols", "Closed elevator terminal status lights"]) {
    const parts = object(name) as THREE.InstancedMesh;
    for (let index = 0; index < parts.count; index++) {
      const transform = matrix(parts, index);
      const front = new THREE.Vector3(0, 0, -0.5).applyMatrix4(transform);
      assert.ok(rayDistance(front, new THREE.Vector3(0, -1, 0), housings) <= 0.121);
    }
  }
  const doors = object("Closed elevator door leaves") as THREE.InstancedMesh;
  const drum = object("Rotating elevator transfer drum");
  for (let index = 0; index < doors.count; index += 4) {
    const point = new THREE.Vector3().setFromMatrixPosition(matrix(doors, index));
    point.y = -28;
    const hits = new THREE.Raycaster(point, new THREE.Vector3(0, 1, 0)).intersectObjects([doors, drum]);
    assert.equal(hits[0]?.object, doors, "transfer drum hides a closed hub door");
  }
});

test("bearing collars and reinforcement hoops contact their pressure bodies", () => {
  const hub = object("Stationary bearing hub");
  const inverseHub = hub.matrixWorld.clone().invert();
  root.traverse((part) => {
    if (!(part instanceof THREE.Mesh) || !["Hub bearing collar", "Hub bearing status ring"].includes(part.name)) return;
    const vertices = part.geometry.getAttribute("position");
    assert.ok(Array.from({ length: vertices.count }, (_, index) => new THREE.Vector3()
      .fromBufferAttribute(vertices, index).applyMatrix4(part.matrixWorld).applyMatrix4(inverseHub))
      .some((point) => Math.hypot(point.x, point.z) < 11.3 * Math.cos(Math.PI / 24) && Math.abs(point.y) < 24.6));
  });
  const bands = object("Elevator pressure-tube reinforcement bands") as THREE.InstancedMesh;
  const tubes = object("Passenger elevator pressure tubes");
  for (let index = 0; index < bands.count; index++) {
    const relative = matrix(bands, index).premultiply(matrix(tubes, Math.floor(index / 15)).invert());
    const vertices = bands.geometry.getAttribute("position");
    assert.ok(Array.from({ length: vertices.count }, (_, vertex) => new THREE.Vector3()
      .fromBufferAttribute(vertices, vertex).applyMatrix4(relative))
      .some((point) => Math.hypot(point.x, point.z) < 1 && Math.abs(point.y) < 0.50001), `hoop ${index} floats around its tube`);
  }
});

test("rendered enclosure stays within 20 cm of the analytic collision surface along its normals", () => {
  // Sample cross-section knots and midpoints, at azimuth vertices and facet
  // centres. At the axial seam the surface normal is discontinuous, so the
  // endpoint itself is excluded; the first/last panel midpoints are included.
  const samples = [
    ...Array.from({ length: 23 }, (_, index) => (index + 1) / 24),
    ...Array.from({ length: 24 }, (_, index) => (index + 0.5) / 24),
  ];
  for (const [name, height, direction] of [
    ["Continuous pressure canopy", ENCLOSURE_HEIGHT, -1],
    ["Segmented pressure hull", ENCLOSURE_HULL_DEPTH, 1],
  ] as const) {
    for (const sample of samples) for (const fraction of [0, 0.5, 1]) {
      const t = sample * Math.PI, angle = fraction * Math.PI * 2 / 96;
      const radius = FLOOR_RADIUS + direction * height * Math.sin(t);
      const y = -ENCLOSURE_HALF_WIDTH * Math.cos(t);
      const point = new THREE.Vector3(radius * Math.cos(angle), y, radius * Math.sin(angle));
      const h = FLOOR_RADIUS - radius;
      const normal = new THREE.Vector3(h * Math.cos(angle) / height ** 2,
        -y / ENCLOSURE_HALF_WIDTH ** 2, h * Math.sin(angle) / height ** 2).normalize();
      const distance = rayDistance(point.clone().addScaledVector(normal, -0.25), normal, object(name));
      assert.ok(Math.abs(distance - 0.25) < 0.2, `${name} diverges from its collision boundary`);
    }
  }
});
