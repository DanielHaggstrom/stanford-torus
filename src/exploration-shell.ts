import * as THREE from "three";
import type { Vec3 } from "./physics.ts";
import {
  BOUNDARY_WARNING_DISTANCE,
  EXPLORATION_RADIUS,
  getBoundaryClearance,
} from "./exploration-boundary.ts";

/** A sparse local warning surface, rather than a permanent bubble over the sky. */
export function buildExplorationShell(scene: THREE.Scene): {
  update(position: Vec3, exploring: boolean): void;
  dispose(): void;
} {
  const coordinates: number[] = [];
  const segments = 96;
  const addRing = (latitude: number | null, longitude = 0): void => {
    for (let segment = 0; segment < segments; segment++) {
      for (const index of [segment, segment + 1]) {
        const angle = (index / segments) * Math.PI * 2;
        if (latitude === null) {
          coordinates.push(
            EXPLORATION_RADIUS * Math.cos(angle) * Math.cos(longitude),
            EXPLORATION_RADIUS * Math.sin(angle),
            EXPLORATION_RADIUS * Math.cos(angle) * Math.sin(longitude),
          );
        } else {
          const radius = EXPLORATION_RADIUS * Math.cos(latitude);
          coordinates.push(
            radius * Math.cos(angle),
            EXPLORATION_RADIUS * Math.sin(latitude),
            radius * Math.sin(angle),
          );
        }
      }
    }
  };
  for (let index = 1; index < 12; index++) {
    addRing(-Math.PI / 2 + (index / 12) * Math.PI);
  }
  for (let index = 0; index < 12; index++) {
    addRing(null, (index / 12) * Math.PI);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(coordinates, 3),
  );
  geometry.computeBoundingSphere();
  const material = new THREE.LineBasicMaterial({
    color: 0xabcbd0,
    transparent: true,
    opacity: 0,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const shell = new THREE.LineSegments(geometry, material);
  shell.name = "Exploration boundary";
  shell.visible = false;
  scene.add(shell);
  return {
    update(position, exploring) {
      const clearance = getBoundaryClearance(position);
      const proximity = THREE.MathUtils.clamp(
        (BOUNDARY_WARNING_DISTANCE - clearance) /
          (BOUNDARY_WARNING_DISTANCE - 25),
        0,
        1,
      );
      shell.visible = exploring && proximity > 0;
      material.opacity = 0.22 * proximity * proximity * (3 - 2 * proximity);
    },
    dispose() {
      scene.remove(shell);
      geometry.dispose();
      material.dispose();
    },
  };
}
