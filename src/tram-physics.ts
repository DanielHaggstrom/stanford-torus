import {
  FLOOR_RADIUS,
  rotateY,
  type MotionState,
  type Vec3,
} from "./physics.ts";
import {
  getTramState,
  TRAM_TRACK_ACROSS,
  TRAMS_PER_DIRECTION,
  type TramDirection,
} from "./tram-motion.ts";

export const TRAM_LENGTH = 8;
export const TRAM_WIDTH = 2.05;
/** Height of the roof above the habitat deck, measured at the player's feet. */
export const TRAM_ROOF_HEIGHT = 2.8;
export const PLAYER_RADIUS = 0.3;
export const PLAYER_BODY_HEIGHT = 1.7;

const ROOF_RADIUS = FLOOR_RADIUS - TRAM_ROOF_HEIGHT;
const FOOT_MARGIN = 0.12;
const ROOF_TOLERANCE = 0.15;
const CAR_BASE_HEIGHT = 0.2;
const EPSILON = 1e-8;

export interface TramSupport {
  direction: TramDirection;
  carIndex: number;
}

export interface TramCollision {
  state: MotionState;
  support: TramSupport | null;
  pushed: boolean;
}

function trackAcross(direction: TramDirection): number {
  return direction === "spinward" ? TRAM_TRACK_ACROSS : -TRAM_TRACK_ACROSS;
}

function angleDifference(angle: number, reference: number): number {
  return Math.atan2(Math.sin(angle - reference), Math.cos(angle - reference));
}

function footprint(position: Vec3, support: TramSupport, time: number) {
  const tram = getTramState(time, support.direction, support.carIndex);
  return {
    along:
      angleDifference(Math.atan2(position.z, position.x), tram.angle) *
      ROOF_RADIUS,
    across: position.y - trackAcross(support.direction),
  };
}

function inFootprint(position: Vec3, support: TramSupport, time: number) {
  const local = footprint(position, support, time);
  return (
    Math.abs(local.along) <= TRAM_LENGTH / 2 + FOOT_MARGIN &&
    Math.abs(local.across) <= TRAM_WIDTH / 2 + FOOT_MARGIN
  );
}

function height(position: Vec3): number {
  return FLOOR_RADIUS - Math.hypot(position.x, position.z);
}

/** Positive speed points down toward the deck. */
function downwardSpeed(state: MotionState): number {
  const radius = Math.hypot(state.position.x, state.position.z);
  return radius > EPSILON
    ? (state.velocity.x * state.position.x +
        state.velocity.z * state.position.z) /
        radius
    : 0;
}

function pinToRoof(state: MotionState): MotionState {
  const radius = Math.hypot(state.position.x, state.position.z);
  const outwardX = state.position.x / radius;
  const outwardZ = state.position.z / radius;
  const normalSpeed = state.velocity.x * outwardX + state.velocity.z * outwardZ;
  return {
    position: {
      x: outwardX * ROOF_RADIUS,
      y: state.position.y,
      z: outwardZ * ROOF_RADIUS,
    },
    velocity: {
      x: state.velocity.x - normalSpeed * outwardX,
      y: state.velocity.y,
      z: state.velocity.z - normalSpeed * outwardZ,
    },
  };
}

/** Velocity relative to the habitat of the roof under this foot point. */
export function tramSurfaceVelocity(
  position: Vec3,
  support: TramSupport,
  time: number,
): Vec3 {
  const { angularVelocity } = getTramState(
    time,
    support.direction,
    support.carIndex,
  );
  return {
    x: -position.z * angularVelocity,
    y: 0,
    z: position.x * angularVelocity,
  };
}

/**
 * Carry a rider exactly around the curve, including departures and arrivals.
 * Walking velocity is relative to the car; the returned velocity is again
 * relative to the habitat, so a jump keeps the car's momentum.
 */
export function carryTramRider(
  state: MotionState,
  support: TramSupport,
  fromTime: number,
  toTime: number,
): MotionState {
  const from = getTramState(fromTime, support.direction, support.carIndex);
  const to = getTramState(toTime, support.direction, support.carIndex);
  const rotation = from.angle - to.angle;
  const oldSurface = tramSurfaceVelocity(state.position, support, fromTime);
  const relative = rotateY(
    {
      x: state.velocity.x - oldSurface.x,
      y: state.velocity.y,
      z: state.velocity.z - oldSurface.z,
    },
    rotation,
  );
  const position = rotateY(state.position, rotation);
  const newSurface = tramSurfaceVelocity(position, support, toTime);
  return {
    position,
    velocity: {
      x: relative.x + newSurface.x,
      y: relative.y,
      z: relative.z + newSurface.z,
    },
  };
}

export function isOnTramRoof(
  position: Vec3,
  support: TramSupport,
  time: number,
): boolean {
  return (
    Math.abs(height(position) - TRAM_ROOF_HEIGHT) <= ROOF_TOLERANCE &&
    inFootprint(position, support, time)
  );
}

/**
 * Resolve walking and jumping against car roofs and bodies. The player is a
 * foot point with a short upright body. Body impacts move the player sideways
 * toward the nearest clear side of the track, rather than trapping them under
 * a moving car. This runs at the player's fixed physics step.
 */
export function resolveTramCollision(
  previous: MotionState,
  current: MotionState,
  fromTime: number,
  toTime: number,
  support: TramSupport | null,
): TramCollision {
  // A jump must release the roof even if its first step is inside the small
  // support tolerance. Walking off an edge also releases support immediately.
  if (
    support &&
    isOnTramRoof(current.position, support, toTime) &&
    downwardSpeed(current) >= -0.05
  ) {
    return { state: pinToRoof(current), support, pushed: false };
  }

  const previousHeight = height(previous.position);
  const currentHeight = height(current.position);
  const descending =
    currentHeight <= previousHeight + EPSILON &&
    downwardSpeed(current) >= -0.05;

  for (const direction of ["spinward", "antispinward"] as const) {
    for (let carIndex = 0; carIndex < TRAMS_PER_DIRECTION; carIndex++) {
      const car: TramSupport = { direction, carIndex };
      if (
        descending &&
        previousHeight >= TRAM_ROOF_HEIGHT - 0.04 &&
        currentHeight <= TRAM_ROOF_HEIGHT + 0.03 &&
        inFootprint(current.position, car, toTime)
      ) {
        return { state: pinToRoof(current), support: car, pushed: false };
      }

      if (
        currentHeight >= TRAM_ROOF_HEIGHT - EPSILON ||
        currentHeight + PLAYER_BODY_HEIGHT <= CAR_BASE_HEIGHT
      ) {
        continue;
      }

      const local = footprint(current.position, car, toTime);
      const expandedHalfLength = TRAM_LENGTH / 2 + PLAYER_RADIUS;
      const expandedHalfWidth = TRAM_WIDTH / 2 + PLAYER_RADIUS;
      // Include a swept front/side contact if a fast step crosses the body.
      // Relative positions use each endpoint's tram angle, including motion
      // through the 0/2π seam.
      const before = footprint(previous.position, car, fromTime);
      const halfCircumference = Math.PI * ROOF_RADIUS;
      if (local.along - before.along > halfCircumference) {
        before.along += 2 * halfCircumference;
      } else if (local.along - before.along < -halfCircumference) {
        before.along -= 2 * halfCircumference;
      }
      const crossedBody = segmentHitsRectangle(
        before.along,
        before.across,
        local.along,
        local.across,
        expandedHalfLength,
        expandedHalfWidth,
      );
      if (!crossedBody) continue;

      const side =
        Math.abs(local.across) > EPSILON
          ? Math.sign(local.across)
          : -Math.sign(trackAcross(direction));
      const clearAcross = side * (expandedHalfWidth + 0.1);
      return {
        state: {
          position: {
            ...current.position,
            y: trackAcross(direction) + clearAcross,
          },
          velocity: {
            ...current.velocity,
            y: side * Math.max(3.5, side * current.velocity.y),
          },
        },
        support: null,
        pushed: true,
      };
    }
  }

  return { state: current, support: null, pushed: false };
}

function segmentHitsRectangle(
  fromAlong: number,
  fromAcross: number,
  toAlong: number,
  toAcross: number,
  halfLength: number,
  halfWidth: number,
): boolean {
  let entry = 0;
  let exit = 1;
  for (const [start, end, extent] of [
    [fromAlong, toAlong, halfLength],
    [fromAcross, toAcross, halfWidth],
  ]) {
    const delta = end! - start!;
    if (Math.abs(delta) < EPSILON) {
      if (Math.abs(start!) > extent!) return false;
      continue;
    }
    const first = (-extent! - start!) / delta;
    const last = (extent! - start!) / delta;
    entry = Math.max(entry, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (entry > exit) return false;
  }
  return true;
}
