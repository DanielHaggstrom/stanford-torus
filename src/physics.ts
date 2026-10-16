/**
 * The habitat rotates about +Y. Positions and velocities are expressed in the
 * rotating habitat frame; distances are metres and times are seconds.
 *
 * The walkable deck is a cylinder. Its outer radius supplies the ground and
 * the two axial walls bound the playable strip. There is no artificial gravity
 * force: apparent gravity and Coriolis deflection follow from the frame change.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface MotionState {
  position: Vec3;
  velocity: Vec3;
}

export const FLOOR_RADIUS = 210;
export const HALF_WIDTH = 22;
export const GRAVITY = 9.81;
export const ANGULAR_SPEED = Math.sqrt(GRAVITY / FLOOR_RADIUS);
export const ROTATION_PERIOD = (Math.PI * 2) / ANGULAR_SPEED;

export interface HabitatBounds {
  floorRadius?: number;
  halfWidth?: number;
  angularSpeed?: number;
}

export interface Impact {
  time: number;
  position: Vec3;
  /** Surface normal pointing into the playable volume. */
  normal: Vec3;
  kind: "floor" | "side";
}

const EPSILON = 1e-9;

export function rotateY(vector: Vec3, angle: number): Vec3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: cosine * vector.x + sine * vector.z,
    y: vector.y,
    z: -sine * vector.x + cosine * vector.z,
  };
}

/** Ω × position, with Ω = (0, angularSpeed, 0). */
export function rotationVelocity(
  position: Vec3,
  angularSpeed = ANGULAR_SPEED,
): Vec3 {
  return { x: angularSpeed * position.z, y: 0, z: -angularSpeed * position.x };
}

export function rotatingAcceleration(
  position: Vec3,
  velocity: Vec3,
  angularSpeed = ANGULAR_SPEED,
): Vec3 {
  const squaredSpeed = angularSpeed * angularSpeed;
  return {
    x: squaredSpeed * position.x - 2 * angularSpeed * velocity.z,
    y: 0,
    z: squaredSpeed * position.z + 2 * angularSpeed * velocity.x,
  };
}

/**
 * Exact free flight, rather than an Euler approximation of fictitious forces.
 * In an inertial frame an unforced object follows a straight line at constant
 * velocity. Rotate that line back into the habitat at the end of this step.
 * Negative time steps are supported, which also makes the transform reversible.
 */
export function stepFreeFlight(
  state: MotionState,
  deltaSeconds: number,
  angularSpeed = ANGULAR_SPEED,
): MotionState {
  const surfaceVelocity = rotationVelocity(state.position, angularSpeed);
  const inertialVelocity = {
    x: state.velocity.x + surfaceVelocity.x,
    y: state.velocity.y,
    z: state.velocity.z + surfaceVelocity.z,
  };
  const position = rotateY(
    {
      x: state.position.x + inertialVelocity.x * deltaSeconds,
      y: state.position.y + inertialVelocity.y * deltaSeconds,
      z: state.position.z + inertialVelocity.z * deltaSeconds,
    },
    -angularSpeed * deltaSeconds,
  );
  const rotatedVelocity = rotateY(
    inertialVelocity,
    -angularSpeed * deltaSeconds,
  );
  const nextSurfaceVelocity = rotationVelocity(position, angularSpeed);
  return {
    position,
    velocity: {
      x: rotatedVelocity.x - nextSurfaceVelocity.x,
      y: rotatedVelocity.y,
      z: rotatedVelocity.z - nextSurfaceVelocity.z,
    },
  };
}

/** Inward ground normal, also the direction of the player's local up vector. */
export function floorNormal(position: Vec3): Vec3 {
  const radius = Math.hypot(position.x, position.z);
  return radius > EPSILON
    ? { x: -position.x / radius, y: 0, z: -position.z / radius }
    : { x: -1, y: 0, z: 0 };
}

/**
 * Correct a character foot point after a step and remove velocity into walls.
 * Restitution 0 gives a non-bouncing deck, while 1 reflects elastically.
 */
export function resolveHabitatCollision(
  state: MotionState,
  options: HabitatBounds & { restitution?: number } = {},
): { state: MotionState; hitFloor: boolean; hitSide: boolean } {
  const floorRadius = options.floorRadius ?? FLOOR_RADIUS;
  const halfWidth = options.halfWidth ?? HALF_WIDTH;
  const restitution = options.restitution ?? 0;
  const position = { ...state.position };
  const velocity = { ...state.velocity };
  const radius = Math.hypot(position.x, position.z);
  const hitFloor = radius >= floorRadius - EPSILON;
  const hitSide = Math.abs(position.y) >= halfWidth - EPSILON;
  if (hitFloor) {
    const outwardX = position.x / radius;
    const outwardZ = position.z / radius;
    position.x = outwardX * floorRadius;
    position.z = outwardZ * floorRadius;
    const outwardSpeed = velocity.x * outwardX + velocity.z * outwardZ;
    if (outwardSpeed > 0) {
      velocity.x -= (1 + restitution) * outwardSpeed * outwardX;
      velocity.z -= (1 + restitution) * outwardSpeed * outwardZ;
    }
  }
  if (hitSide) {
    const sign = Math.sign(position.y);
    position.y = sign * halfWidth;
    if (velocity.y * sign > 0) velocity.y *= -restitution;
  }
  return { state: { position, velocity }, hitFloor, hitSide };
}
