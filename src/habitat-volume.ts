import { FLOOR_RADIUS, type Vec3 } from "./physics.ts";

/** Elliptical pressure enclosure above the cylindrical deck, in metres. */
export const ENCLOSURE_HEIGHT = 35;
export const ENCLOSURE_HALF_WIDTH = 24;
export const ENCLOSURE_HULL_DEPTH = 3.2;

/** The listener's head must be inside the pressure enclosure to hear sound. */
export function isInsideHabitat(position: Vec3): boolean {
  const height = FLOOR_RADIUS - Math.hypot(position.x, position.z);
  return (
    Number.isFinite(height) &&
    Number.isFinite(position.y) &&
    height >= 0 &&
    (height / ENCLOSURE_HEIGHT) ** 2 +
      (position.y / ENCLOSURE_HALF_WIDTH) ** 2 <=
      1
  );
}
