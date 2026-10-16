import * as THREE from "three";
import { FLOOR_RADIUS } from "./physics.ts";

export const ELEVATOR_LOTS = [6, 30, 54] as const;
export const ELEVATOR_DWELL_SECONDS = 6;
export const ELEVATOR_TRAVEL_SECONDS = 24;
const CYCLE_SECONDS = 2 * (ELEVATOR_DWELL_SECONDS + ELEVATOR_TRAVEL_SECONDS);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
type Part = { matrix: THREE.Matrix4 };
type ColliderRegistration = (geometry: THREE.BufferGeometry, matrix: THREE.Matrix4, kind: string) => void;

export function isElevatorLot(lot: number, side: number): boolean {
  return side === -1 && ELEVATOR_LOTS.some((value) => value === lot);
}

export function elevatorEndpoints(index: number): { deck: THREE.Vector3; hub: THREE.Vector3 } {
  const lot = ELEVATOR_LOTS[index];
  if (lot === undefined) throw new RangeError("Elevator index must be 0, 1 or 2.");
  const angle = lot / 72 * Math.PI * 2;
  const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  return {
    deck: radial.clone().multiplyScalar(FLOOR_RADIUS).setY(-17),
    hub: radial.clone().multiplyScalar(11.5).setY(-24),
  };
}

/** Analytic travel/dwell state: pausing or skipping time needs no catch-up loop. */
export function getElevatorState(elapsed: number, index: number) {
  const seconds = Number.isFinite(elapsed) ? elapsed : 0;
  const phase = ((seconds + index * CYCLE_SECONDS / 3) % CYCLE_SECONDS + CYCLE_SECONDS) % CYCLE_SECONDS;
  const leg = ELEVATOR_DWELL_SECONDS + ELEVATOR_TRAVEL_SECONDS;
  const returning = phase >= leg;
  const local = returning ? phase - leg : phase;
  const stopped = local < ELEVATOR_DWELL_SECONDS;
  const progress = stopped ? 0 : (local - ELEVATOR_DWELL_SECONDS) / ELEVATOR_TRAVEL_SECONDS;
  const eased = progress * progress * (3 - 2 * progress);
  return { fraction: returning ? 1 - eased : eased, stopped, towardHub: !returning };
}

/** Three sealed passenger routes; their deck and hub doors remain closed. */
export function buildElevators(root: THREE.Group, addCollider: ColliderRegistration): { update(elapsed: number): void } {
  const group = new THREE.Group();
  group.name = "Three enclosed passenger elevators";
  root.add(group);
  const cube = new THREE.BoxGeometry();
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
  const hoop = new THREE.TorusGeometry(1, 0.05, 5, 16);
  const movingHoop = new THREE.TorusGeometry(1, 0.13, 6, 16);
  const pressure = new THREE.MeshStandardMaterial({ color: "#b6c5c1", roughness: 0.74, metalness: 0.3 });
  const metal = new THREE.MeshStandardMaterial({ color: "#718d91", roughness: 0.64, metalness: 0.45 });
  const hatch = new THREE.MeshStandardMaterial({ color: "#28434c", roughness: 0.62, metalness: 0.35 });
  const status = new THREE.MeshBasicMaterial({ color: "#d8edc1" });
  const markings = new THREE.MeshBasicMaterial({ color: "#b8d5c6" });
  const tubes: Part[] = [];
  const bands: Part[] = [];
  const housings: Part[] = [];
  const doors: Part[] = [];
  const trims: Part[] = [];
  const signs: Part[] = [];
  const lamps: Part[] = [];
  const routes: { deck: THREE.Vector3; hub: THREE.Vector3; direction: THREE.Vector3; rotation: THREE.Quaternion }[] = [];
  const instance = (geometry: THREE.BufferGeometry, material: THREE.Material, parts: Part[], name: string) => {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = name;
    parts.forEach((part, index) => mesh.setMatrixAt(index, part.matrix));
    mesh.computeBoundingSphere();
    group.add(mesh);
    return mesh;
  };
  const box = (index: number, across: number, height: number, width: number, tall: number, depth: number, tangentOffset = 0): Part => {
    const angle = ELEVATOR_LOTS[index] / 72 * Math.PI * 2;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const matrix = new THREE.Matrix4().makeBasis(tangent, radial.clone().negate(), new THREE.Vector3(0, -1, 0));
    matrix.scale(new THREE.Vector3(width, tall, depth));
    matrix.setPosition(radial.multiplyScalar(FLOOR_RADIUS - height).addScaledVector(tangent, tangentOffset).setY(across));
    return { matrix };
  };
  for (let index = 0; index < ELEVATOR_LOTS.length; index++) {
    const { deck, hub } = elevatorEndpoints(index);
    const delta = hub.clone().sub(deck);
    const direction = delta.clone().normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(Z, direction);
    routes.push({ deck, hub, direction, rotation });
    const tube: Part = { matrix: new THREE.Matrix4().compose(
      deck.clone().add(hub).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(Y, direction),
      new THREE.Vector3(1.3, delta.length(), 1.3),
    ) };
    tubes.push(tube);
    addCollider(cylinder, tube.matrix, "elevator pressure shaft");
    for (let band = 0; band <= 14; band++) bands.push({ matrix: new THREE.Matrix4().compose(
      deck.clone().lerp(hub, band / 14), rotation, new THREE.Vector3(1.34, 1.34, 1.34),
    ) });

    const terminal = box(index, -17, 2.4, 4.2, 4.8, 4);
    housings.push(terminal);
    addCollider(cube, terminal.matrix, "closed elevator deck terminal");
    // The tube joins a rotating transfer housing over the hub bearing. The
    // bearing beyond this sealed joint permits the facility to turn separately.
    const transfer = box(index, -24, FLOOR_RADIUS - 10.9, 3.6, 3.2, 3.3);
    housings.push(transfer);
    addCollider(cube, transfer.matrix, "closed elevator hub transfer terminal");
    const hubDoor = box(index, -25.7, FLOOR_RADIUS - 10.9, 1.8, 2.3, 0.2);
    doors.push(hubDoor);
    addCollider(cube, hubDoor.matrix, "closed elevator hub door");
    // Closed sliding leaves cover the solid terminal; the dark central seam
    // is a visible join, not an opening or an invitation to board this version.
    const doorBacking = box(index, -14.98, 1.45, 1.76, 2.65, 0.12);
    doors.push(doorBacking);
    addCollider(cube, doorBacking.matrix, "closed elevator deck door");
    for (const side of [-1, 1]) {
      const door = box(index, -14.92, 1.45, 0.84, 2.65, 0.16, side * 0.44);
      doors.push(door);
      addCollider(cube, door.matrix, "closed elevator deck door");
    }
    trims.push(box(index, -17, 4.84, 4.45, 0.22, 4.25));
    trims.push(box(index, -14.97, 2.88, 2.05, 0.15, 0.25));
    for (const side of [-1, 1]) trims.push(box(index, -14.97, 1.48, 0.13, 2.95, 0.25, side * 0.99));
    lamps.push(box(index, -14.96, 4.08, 1.6, 0.16, 0.12));
    // Opposed arrows provide a legible, texture-free elevator symbol.
    for (const side of [-1, 1]) {
      signs.push(box(index, -14.96, 3.56, 0.12, 0.6, 0.12, side * 0.3));
      for (const branch of [-1, 1]) {
        signs.push(box(index, -14.96, 3.56 + side * 0.19, 0.1, 0.11, 0.12, side * 0.3 + branch * 0.11));
      }
    }
  }
  instance(cylinder, pressure, tubes, "Passenger elevator pressure tubes");
  instance(hoop, metal, bands, "Elevator pressure-tube reinforcement bands");
  instance(cube, pressure, housings, "Closed elevator terminal housings");
  instance(cube, hatch, doors, "Closed elevator door leaves");
  instance(cube, metal, trims, "Elevator terminal frames");
  instance(cube, markings, signs, "Elevator direction symbols");
  instance(cube, status, lamps, "Closed elevator terminal status lights");
  const indicators = instance(movingHoop, status, routes.map(() => ({ matrix: new THREE.Matrix4() })), "Elevator cabin-position indicators");
  indicators.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const color = new THREE.Color();
  function update(elapsed: number): void {
    routes.forEach((route, index) => {
      const state = getElevatorState(elapsed, index);
      indicators.setMatrixAt(index, new THREE.Matrix4().compose(
        route.deck.clone().lerp(route.hub, state.fraction),
        route.rotation,
        new THREE.Vector3(1.48, 1.48, 1.48),
      ));
      indicators.setColorAt(index, color.set(state.stopped ? "#d7e4b0" : "#94cbd1"));
    });
    indicators.instanceMatrix.needsUpdate = true;
    indicators.instanceColor!.needsUpdate = true;
    indicators.computeBoundingSphere();
  }
  update(0);
  return { update };
}
