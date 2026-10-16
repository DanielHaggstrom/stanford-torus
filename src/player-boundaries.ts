import { HALF_WIDTH, resolveHabitatCollision, type MotionState } from "./physics.ts";

/** Players can cross the pressure canopy and sides; only the actual deck supports feet. */
export function resolvePlayerDeck(state: MotionState) {
  if (Math.abs(state.position.y) > HALF_WIDTH)
    return { state, hitFloor: false, hitSide: false };
  return resolveHabitatCollision(state, { halfWidth: Infinity });
}

export function isOverDeck(state: MotionState): boolean {
  return Math.abs(state.position.y) <= HALF_WIDTH;
}
