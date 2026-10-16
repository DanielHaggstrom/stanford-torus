import { FLOOR_RADIUS, HALF_WIDTH, resolveHabitatCollision, type MotionState } from "./physics.ts";

/** Players can cross the pressure canopy and sides; only the actual deck supports feet. */
export function resolvePlayerDeck(state: MotionState, previousState?: MotionState) {
  const unchanged = () => ({ state, hitFloor: false, hitSide: false });
  if (!previousState) {
    if (Math.abs(state.position.y) > HALF_WIDTH) return unchanged();
    return resolveHabitatCollision(state, { halfWidth: Infinity });
  }
  const previous = previousState.position;
  const previousRadius = Math.hypot(previous.x, previous.z);
  // The deck is a surface, not an infinite exclusion cylinder. An explorer
  // already behind it must not snap to the ring when crossing its axial strip.
  if (previousRadius > FLOOR_RADIUS + 0.02) return unchanged();
  if (Math.hypot(state.position.x, state.position.z) < FLOOR_RADIUS)
    return unchanged();

  const dx = state.position.x - previous.x;
  const dz = state.position.z - previous.z;
  const a = dx * dx + dz * dz;
  let crossing = 0;
  if (previousRadius < FLOOR_RADIUS && a > 0) {
    const b = previous.x * dx + previous.z * dz;
    const c = previousRadius ** 2 - FLOOR_RADIUS ** 2;
    const root = Math.sqrt(Math.max(0, b * b - a * c));
    // The larger root is the outward crossing, including a traversal that
    // starts at one side of the cylinder and leaves through the opposite side.
    crossing = b > 0 ? -c / (b + root) : (-b + root) / a;
  } else if (previousRadius === FLOOR_RADIUS && a > 0) {
    const b = previous.x * dx + previous.z * dz;
    if (b < 0) crossing = (-2 * b) / a;
  }
  if (crossing > 1 + 1e-9) return unchanged();
  const crossingY = previous.y + (state.position.y - previous.y) * crossing;
  if (Math.abs(crossingY) > HALF_WIDTH + 1e-9) return unchanged();
  return resolveHabitatCollision(state, { halfWidth: Infinity });
}

export function isOverDeck(state: MotionState): boolean {
  return Math.abs(state.position.y) <= HALF_WIDTH;
}
