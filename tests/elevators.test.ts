import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as THREE from "three";
import { buildElevators, elevatorEndpoints, ELEVATOR_DWELL_SECONDS, ELEVATOR_TRAVEL_SECONDS, getElevatorState, isElevatorLot } from "../src/elevators.ts";
import { buildSceneryCollision, type StaticCollider } from "../src/scenery-collision.ts";
import { FLOOR_RADIUS } from "../src/physics.ts";

const root = new THREE.Group();
const colliders: StaticCollider[] = [];
const elevators = buildElevators(root, (geometry, matrix, kind) => {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const center = bounds.getCenter(new THREE.Vector3()).applyMatrix4(matrix);
  const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const axes = [0, 1, 2].map((column) => new THREE.Vector3().setFromMatrixColumn(matrix, column));
  const scales = axes.map((axis) => axis.length());
  axes.forEach((axis) => axis.normalize());
  colliders.push({ center, halfSize: { x: half.x * scales[0], y: half.y * scales[1], z: half.z * scales[2] }, axes: axes as [THREE.Vector3, THREE.Vector3, THREE.Vector3], kind });
});
after(() => {
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
  });
  geometries.forEach((geometry) => geometry.dispose()); materials.forEach((material) => material.dispose());
});

test("three sealed radial shafts are 120 degrees apart and join their deck and hub terminals", () => {
  const tubes = root.getObjectByName("Passenger elevator pressure tubes") as THREE.InstancedMesh;
  const terminals = root.getObjectByName("Closed elevator terminal housings") as THREE.InstancedMesh;
  assert.equal(tubes.count, 3);
  const angles: number[] = [];
  for (let index = 0; index < 3; index++) {
    const matrix = new THREE.Matrix4(); tubes.getMatrixAt(index, matrix);
    const deck = new THREE.Vector3(0, -0.5, 0).applyMatrix4(matrix);
    const hub = new THREE.Vector3(0, 0.5, 0).applyMatrix4(matrix);
    assert.ok(Math.abs(Math.hypot(deck.x, deck.z) - FLOOR_RADIUS) < 1e-4);
    assert.ok(Math.abs(deck.y + 17) < 1e-4);
    assert.ok(Math.abs(Math.hypot(hub.x, hub.z) - 11.5) < 1e-4);
    assert.ok(Math.abs(hub.y + 24) < 1e-4);
    angles.push((Math.atan2(deck.z, deck.x) + 2 * Math.PI) % (2 * Math.PI));
    for (const [point, terminalIndex] of [[deck, index * 2], [hub, index * 2 + 1]] as const) {
      const housing = new THREE.Matrix4(); terminals.getMatrixAt(terminalIndex, housing);
      const local = point.clone().applyMatrix4(housing.invert());
      assert.ok(Math.abs(local.x) <= 0.50001 && Math.abs(local.y) <= 0.50001 && Math.abs(local.z) <= 0.50001);
    }
  }
  angles.sort((a, b) => a - b);
  for (let index = 0; index < 3; index++) {
    const separation = (angles[(index + 1) % 3] - angles[index] + 2 * Math.PI) % (2 * Math.PI);
    assert.ok(Math.abs(separation - 2 * Math.PI / 3) < 1e-6);
  }
  for (const lot of [6, 30, 54]) { assert.equal(isElevatorLot(lot, -1), true); assert.equal(isElevatorLot(lot, 1), false); }
  assert.equal(isElevatorLot(5, -1), false);
});

test("closed deck doors stop both probes and a walking player", () => {
  const world = buildSceneryCollision(colliders);
  for (let index = 0; index < 3; index++) {
    const { deck } = elevatorEndpoints(index);
    const radial = deck.clone().setY(0).normalize();
    const eye = radial.clone().multiplyScalar(FLOOR_RADIUS - 1.45).setY(-12);
    const shot = { position: eye, velocity: { x: 0, y: -20, z: 0 } };
    const impact = world.firstImpact(shot, 0.3, { angularSpeed: 0 });
    assert.equal(impact?.collider?.kind, "closed elevator deck door");
    const previous = { position: deck.clone().setY(-12), velocity: { x: 0, y: -5, z: 0 } };
    const next = { position: deck.clone().setY(-18), velocity: previous.velocity };
    const contact = world.resolvePlayer(previous, next);
    assert.equal(contact.hit, true);
    assert.ok(contact.state.position.y > -15, "player remains outside the shut entry");
  }
});

test("travel indicators dwell and follow the shared clock deterministically through pauses and skips", () => {
  assert.deepEqual(getElevatorState(0, 0), { fraction: 0, stopped: true, towardHub: true });
  assert.equal(getElevatorState(ELEVATOR_DWELL_SECONDS / 2, 0).fraction, 0);
  const hubArrival = ELEVATOR_DWELL_SECONDS + ELEVATOR_TRAVEL_SECONDS;
  assert.equal(getElevatorState(hubArrival + ELEVATOR_DWELL_SECONDS / 2, 0).fraction, 1);
  assert.equal(getElevatorState(hubArrival, 0).stopped, true);
  const indicators = root.getObjectByName("Elevator cabin-position indicators") as THREE.InstancedMesh;
  const snapshot = (time: number) => { elevators.update(time); return Array.from(indicators.instanceMatrix.array); };
  const before = snapshot(12);
  assert.deepEqual(snapshot(12), before, "unchanged clock leaves the indicators still");
  const skipped = snapshot(12345);
  snapshot(5);
  assert.deepEqual(snapshot(12345), skipped, "a skip needs no frame-by-frame integration");
  assert.notDeepEqual(skipped, before);
  const period = 2 * hubArrival;
  assert.deepEqual(snapshot(12 + period), before);
  for (let index = 0; index < 3; index++) {
    const state = getElevatorState(12345, index);
    assert.ok(state.fraction >= 0 && state.fraction <= 1);
  }
});
