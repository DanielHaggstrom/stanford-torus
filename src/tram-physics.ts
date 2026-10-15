import {
  FLOOR_RADIUS,
  rotateY,
  type MotionState,
  type Vec3,
} from "./physics.ts";
import {
  getTramState,
  TRAM_STATION_ANGLE,
  TRAM_STATION_COUNT,
  TRAM_TRACK_ACROSS,
  TRAMS_PER_DIRECTION,
  type TramDirection,
} from "./tram-motion.ts";

export const TRAM_LENGTH = 8;
export const TRAM_WIDTH = 2.4;
export const TRAM_DECK_HEIGHT = 0.55;
export const TRAM_PLATFORM_HEIGHT = 0.55;
export const TRAM_PLATFORM_ACROSS = 6.6;
export const TRAM_PLATFORM_WIDTH = 2.2;
export const TRAM_PLATFORM_LENGTH = 16;
export const PLAYER_RADIUS = 0.3;
export const PLAYER_BODY_HEIGHT = 1.7;

const DECK_RADIUS = FLOOR_RADIUS - TRAM_DECK_HEIGHT;
const FOOT_MARGIN = 0.12;
const DECK_TOLERANCE = 0.15;
const CAR_BASE_HEIGHT = 0.1;
const RAMP_INNER_ACROSS = 3.4;
const RAMP_OUTER_ACROSS = 5.5;
const RAMP_HALF_LENGTH = 1.55;
const EPSILON = 1e-8;

export interface TramSupport {
  direction: TramDirection;
  carIndex: number;
}

export interface TramCollision {
  state: MotionState;
  support: TramSupport | null;
  pushed: boolean;
  grounded: boolean;
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
      DECK_RADIUS,
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

/** Walkable station platforms and their promenade-facing access ramps. */
export function stationSupportHeight(position: Vec3): number {
  const angle = Math.atan2(position.z, position.x);
  const across = Math.abs(position.y);
  for (let station = 0; station < TRAM_STATION_COUNT; station++) {
    const along =
      Math.abs(angleDifference(angle, station * TRAM_STATION_ANGLE)) *
      FLOOR_RADIUS;
    if (
      along <= TRAM_PLATFORM_LENGTH / 2 + EPSILON &&
      across >= TRAM_PLATFORM_ACROSS - TRAM_PLATFORM_WIDTH / 2 - EPSILON &&
      across <=
        TRAM_PLATFORM_ACROSS + TRAM_PLATFORM_WIDTH / 2 + FOOT_MARGIN + EPSILON
    ) {
      return TRAM_PLATFORM_HEIGHT;
    }
    if (
      along <= RAMP_HALF_LENGTH + EPSILON &&
      across >= RAMP_INNER_ACROSS &&
      across <= RAMP_OUTER_ACROSS
    ) {
      return (
        (TRAM_PLATFORM_HEIGHT * (across - RAMP_INNER_ACROSS)) /
        (RAMP_OUTER_ACROSS - RAMP_INNER_ACROSS)
      );
    }
  }
  return 0;
}

/** Keep a level boarding step across the small platform-to-cart gap. */
export function walkingSupportHeight(
  position: Vec3,
  previousPosition: Vec3,
  simTime: number,
): number {
  const stationHeight = stationSupportHeight(position);
  if (height(previousPosition) >= TRAM_DECK_HEIGHT - 0.12) {
    for (const direction of ["spinward", "antispinward"] as const) {
      for (let carIndex = 0; carIndex < TRAMS_PER_DIRECTION; carIndex++) {
        if (inFootprint(position, { direction, carIndex }, simTime)) {
          return Math.max(stationHeight, TRAM_DECK_HEIGHT);
        }
      }
    }
  }
  return stationHeight;
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

function pinToHeight(state: MotionState, supportHeight: number): MotionState {
  const radius = Math.hypot(state.position.x, state.position.z);
  const outwardX = state.position.x / radius;
  const outwardZ = state.position.z / radius;
  const normalSpeed = state.velocity.x * outwardX + state.velocity.z * outwardZ;
  return {
    position: {
      x: outwardX * (FLOOR_RADIUS - supportHeight),
      y: state.position.y,
      z: outwardZ * (FLOOR_RADIUS - supportHeight),
    },
    velocity: {
      x: state.velocity.x - normalSpeed * outwardX,
      y: state.velocity.y,
      z: state.velocity.z - normalSpeed * outwardZ,
    },
  };
}

/** Velocity relative to the habitat of the car deck under this foot point. */
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

export function isOnTramDeck(
  position: Vec3,
  support: TramSupport,
  time: number,
): boolean {
  return (
    Math.abs(height(position) - TRAM_DECK_HEIGHT) <= DECK_TOLERANCE &&
    inFootprint(position, support, time)
  );
}

/**
 * Resolve walking and jumping against open cart decks and station surfaces.
 * Contacts below a cart's deck push the player to the nearest clear track side.
 * Above the deck there is no enclosing body to block boarding or walking.
 */
export function resolveTramCollision(
  previous: MotionState,
  current: MotionState,
  fromTime: number,
  toTime: number,
  support: TramSupport | null,
): TramCollision {
  // A jump must release the deck even if its first step is inside the small
  // support tolerance. Walking off an edge also releases support immediately.
  if (
    support &&
    isOnTramDeck(current.position, support, toTime) &&
    downwardSpeed(current) >= -0.05
  ) {
    return {
      state: pinToHeight(current, TRAM_DECK_HEIGHT),
      support,
      pushed: false,
      grounded: true,
    };
  }

  const previousHeight = height(previous.position);
  const currentHeight = height(current.position);
  const descending =
    currentHeight <= previousHeight + EPSILON &&
    downwardSpeed(current) >= -0.05;
  const restingOnDeck =
    Math.abs(currentHeight - TRAM_DECK_HEIGHT) <= 0.03 &&
    downwardSpeed(current) >= -0.05;

  for (const direction of ["spinward", "antispinward"] as const) {
    for (let carIndex = 0; carIndex < TRAMS_PER_DIRECTION; carIndex++) {
      const car: TramSupport = { direction, carIndex };
      if (
        (restingOnDeck ||
          (descending &&
            previousHeight >= TRAM_DECK_HEIGHT - 0.04 &&
            currentHeight <= TRAM_DECK_HEIGHT + 0.03)) &&
        inFootprint(current.position, car, toTime)
      ) {
        return {
          state: pinToHeight(current, TRAM_DECK_HEIGHT),
          support: car,
          pushed: false,
          grounded: true,
        };
      }

      if (
        currentHeight >= TRAM_DECK_HEIGHT - EPSILON ||
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
      const halfCircumference = Math.PI * DECK_RADIUS;
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
      const tram = getTramState(toTime, direction, carIndex);
      // While mounting a parked car, block the body without kicking the jump
      // away. The player's lateral momentum can carry them over the deck once
      // their feet clear it. Moving cars and ground contacts still shove aside.
      const mountingParkedCar =
        downwardSpeed(current) < -0.05 &&
        currentHeight > 0.4 &&
        (tram.stopped || tram.speed < 0.5);
      return {
        state: {
          position: {
            ...current.position,
            y: trackAcross(direction) + clearAcross,
          },
          velocity: {
            ...current.velocity,
            y: mountingParkedCar
              ? current.velocity.y
              : side * Math.max(3.5, side * current.velocity.y),
          },
        },
        support: null,
        pushed: !mountingParkedCar,
        grounded: currentHeight <= 0.03 && downwardSpeed(current) >= -0.05,
      };
    }
  }

  for (const supportHeight of [stationSupportHeight(current.position), 0]) {
    const resting =
      Math.abs(currentHeight - supportHeight) <= 0.03 &&
      downwardSpeed(current) >= -0.05;
    const landing =
      descending &&
      previousHeight >= supportHeight - 0.04 &&
      currentHeight <= supportHeight + 0.03;
    if (resting || landing) {
      return {
        state: pinToHeight(current, supportHeight),
        support: null,
        pushed: false,
        grounded: true,
      };
    }
  }

  return { state: current, support: null, pushed: false, grounded: false };
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
