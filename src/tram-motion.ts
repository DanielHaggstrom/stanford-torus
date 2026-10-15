/** A shared-clock timetable in the rotating habitat frame. */
export const TRAM_STATION_COUNT = 6;
export const TRAMS_PER_DIRECTION = 3;
export const TRAM_TRACK_ACROSS = 9;
export const TRAM_TRACK_RADIUS = 209.8;
export const TRAM_DWELL_SECONDS = 8;
export const TRAM_TRAVEL_SECONDS = 32;
export const TRAM_LEG_SECONDS = TRAM_DWELL_SECONDS + TRAM_TRAVEL_SECONDS;
export const TRAM_LAP_SECONDS = TRAM_STATION_COUNT * TRAM_LEG_SECONDS;
export const TRAM_STATION_ANGLE = (2 * Math.PI) / TRAM_STATION_COUNT;
export const TRAM_ANTISPINWARD_OFFSET_SECONDS = TRAM_LEG_SECONDS / 2;

export type TramDirection = "spinward" | "antispinward";

export interface TramState {
  /** Habitat angle atan2(z, x), in [0, 2π). */
  angle: number;
  /** Signed rate of change of angle, in radians per simulation second. */
  angularVelocity: number;
  /** Speed along the track, in metres per simulation second. */
  speed: number;
  stopped: boolean;
  /** Current station while stopped; departure station while moving. */
  stationIndex: number;
  nextStationIndex: number;
  /** Seconds into this station's dwell-and-travel leg, in [0, 40). */
  phaseElapsed: number;
  doorsOpenFraction: number;
  /** Zero while travelling. */
  secondsToDeparture: number;
  /** Zero while stopped. */
  secondsToArrival: number;
}

function wrap(value: number, period: number): number {
  return ((value % period) + period) % period;
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

/**
 * Evaluate the timetable directly, so time skips require no integration.
 * Three cars on each track stay two stations apart. Opposing services start
 * half a leg apart, leaving a mixture of moving and stopped cars at opening.
 *
 * The habitat spins about +Y, so spinward DECREASES atan2(z, x).
 */
export function getTramState(
  simSeconds: number,
  direction: TramDirection,
  carIndex = 0,
): TramState {
  if (!Number.isFinite(simSeconds)) {
    throw new RangeError("Tram time must be finite.");
  }
  if (
    !Number.isInteger(carIndex) ||
    carIndex < 0 ||
    carIndex >= TRAMS_PER_DIRECTION
  ) {
    throw new RangeError("Tram car index must be 0, 1, or 2.");
  }

  const sign = direction === "spinward" ? -1 : 1;
  const offset =
    direction === "antispinward" ? TRAM_ANTISPINWARD_OFFSET_SECONDS : 0;
  const lapElapsed = wrap(
    wrap(simSeconds, TRAM_LAP_SECONDS) + offset,
    TRAM_LAP_SECONDS,
  );
  const leg = Math.floor(lapElapsed / TRAM_LEG_SECONDS);
  const phaseElapsed = lapElapsed - leg * TRAM_LEG_SECONDS;
  const stationIndex = wrap(carIndex * 2 + sign * leg, TRAM_STATION_COUNT);
  const nextStationIndex = wrap(stationIndex + sign, TRAM_STATION_COUNT);
  const stopped = phaseElapsed < TRAM_DWELL_SECONDS;
  const travelFraction = stopped
    ? 0
    : (phaseElapsed - TRAM_DWELL_SECONDS) / TRAM_TRAVEL_SECONDS;

  // Half-cosine displacement starts and ends at rest, with a 10.8 m/s peak.
  const progress = (1 - Math.cos(Math.PI * travelFraction)) / 2;
  const angularVelocity =
    (sign * TRAM_STATION_ANGLE * Math.PI * Math.sin(Math.PI * travelFraction)) /
    (2 * TRAM_TRAVEL_SECONDS);
  const angle = wrap(
    (stationIndex + sign * progress) * TRAM_STATION_ANGLE,
    2 * Math.PI,
  );
  // One second to open, six seconds open, then one second to close.
  const doorRamp = stopped
    ? Math.min(1, phaseElapsed, TRAM_DWELL_SECONDS - phaseElapsed)
    : 0;

  return {
    angle,
    angularVelocity,
    speed: Math.abs(angularVelocity) * TRAM_TRACK_RADIUS,
    stopped,
    stationIndex,
    nextStationIndex,
    phaseElapsed,
    doorsOpenFraction: smoothStep(doorRamp),
    secondsToDeparture: stopped ? TRAM_DWELL_SECONDS - phaseElapsed : 0,
    secondsToArrival: stopped ? 0 : TRAM_LEG_SECONDS - phaseElapsed,
  };
}
