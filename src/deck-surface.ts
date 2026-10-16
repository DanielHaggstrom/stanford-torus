import * as THREE from "three";
import { FLOOR_RADIUS, HALF_WIDTH } from "./physics.ts";

const SECTORS = 384;
const EDGES = [-HALF_WIDTH, -21.9, -21.25, -12.7, -10.7, -3.65, -3.5, -3.39, 3.39, 3.5, 3.65, 10.7, 12.7, 21.25, 21.9, HALF_WIDTH];
const PALETTE = {
  ground: "#bac4b2",
  grass: "#719f77",
  path: "#e4dfc8",
  terrace: "#c7cdb9",
  cyan: "#82dacf",
};
const STRIPS: readonly (keyof typeof PALETTE)[] = [
  "ground", "path", "grass", "terrace", "grass", "ground", "cyan", "path",
  "cyan", "ground", "grass", "terrace", "grass", "path", "ground",
];

/**
 * One deck surface: paths and lawns partition its width rather than overlap.
 * Centimetre-separated shells can occupy the same depth-buffer value when
 * viewed across the 420 m ring, causing moving patches of the lower shell.
 */
export function buildDeckSurface(): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (let strip = 0; strip < STRIPS.length; strip++) {
    const color = new THREE.Color(PALETTE[STRIPS[strip]]);
    const offset = positions.length / 3;
    for (let sector = 0; sector <= SECTORS; sector++) {
      const angle = sector / SECTORS * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      for (const across of [EDGES[strip], EDGES[strip + 1]]) {
        positions.push(FLOOR_RADIUS * cosine, across, FLOOR_RADIUS * sine);
        normals.push(-cosine, 0, -sine);
        colors.push(color.r, color.g, color.b);
      }
      if (sector < SECTORS) {
        const start = offset + sector * 2;
        indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = "Single partitioned habitat deck";
  return geometry;
}
