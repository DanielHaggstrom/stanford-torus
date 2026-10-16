import {
  ANGULAR_SPEED,
  rotationVelocity,
  type MotionState,
  type Vec3,
} from "./physics.ts";

/** A virtual limit around the habitat, leaving ample room for exterior flight. */
export const EXPLORATION_RADIUS = 750;
/** The player position is the feet; reserve room for the head and body. */
export const PLAYER_BOUNDARY_RADIUS = EXPLORATION_RADIUS - 2;
export const BOUNDARY_WARNING_DISTANCE = 75;

export function getBoundaryClearance(
  position: Vec3,
  radius = EXPLORATION_RADIUS,
): number {
  return radius - Math.hypot(position.x, position.y, position.z);
}

/**
 * Slide along the exploration limit without bouncing or losing sideways speed.
 * The frame's rotational velocity is tangent to a sphere, so the same outward
 * component applies in both the rotating and inertial frames.
 */
export function constrainToExplorationSphere(
  state: MotionState,
  radius = PLAYER_BOUNDARY_RADIUS,
): { state: MotionState; hit: boolean; distanceToBoundary: number } {
  if (!(radius > 0) || !Number.isFinite(radius)) {
    throw new RangeError("Exploration radius must be positive and finite.");
  }
  const distance = Math.hypot(
    state.position.x,
    state.position.y,
    state.position.z,
  );
  if (distance < radius) {
    return { state, hit: false, distanceToBoundary: radius - distance };
  }
  const normal = {
    x: state.position.x / distance,
    y: state.position.y / distance,
    z: state.position.z / distance,
  };
  const outwardSpeed =
    state.velocity.x * normal.x +
    state.velocity.y * normal.y +
    state.velocity.z * normal.z;
  const hit = distance > radius || outwardSpeed > 0;
  return {
    state: {
      position: {
        x: normal.x * radius,
        y: normal.y * radius,
        z: normal.z * radius,
      },
      velocity: {
        x: state.velocity.x - Math.max(0, outwardSpeed) * normal.x,
        y: state.velocity.y - Math.max(0, outwardSpeed) * normal.y,
        z: state.velocity.z - Math.max(0, outwardSpeed) * normal.z,
      },
    },
    hit,
    distanceToBoundary: 0,
  };
}

/**
 * First outward crossing of the limit on the exact free-flight path. Rotation
 * preserves radius, so this quadratic remains exact at any habitat spin rate.
 * A probe already outside is discarded immediately. A probe starting on the
 * boundary and travelling inward is allowed to cross the volume before exiting.
 */
export function firstExplorationExit(
  state: MotionState,
  duration: number,
  angularSpeed = ANGULAR_SPEED,
): number | null {
  if (!(duration >= 0) || !Number.isFinite(duration)) {
    throw new RangeError("Exploration duration must be nonnegative and finite.");
  }
  const { position, velocity } = state;
  const squaredDistance =
    position.x ** 2 + position.y ** 2 + position.z ** 2;
  const c = squaredDistance - EXPLORATION_RADIUS ** 2;
  if (c > 0) return 0;

  const surfaceVelocity = rotationVelocity(position, angularSpeed);
  const ux = velocity.x + surfaceVelocity.x;
  const uy = velocity.y;
  const uz = velocity.z + surfaceVelocity.z;
  const a = ux * ux + uy * uy + uz * uz;
  if (a === 0) return null;
  const b = position.x * ux + position.y * uy + position.z * uz;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  // This form avoids cancellation for an outward launch near the surface.
  const exit = b > 0 ? -c / (b + root) : (-b + root) / a;
  const epsilon = 1e-9;
  if (exit < -epsilon || exit > duration + epsilon) return null;
  return Math.min(duration, Math.max(0, exit));
}
