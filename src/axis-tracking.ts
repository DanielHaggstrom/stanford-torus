import { getOrbitState, ORBIT_PERIOD_SECONDS } from "./orbit.ts";
import type { Vec3 } from "./physics.ts";

/** Stop the drives once direct sunlight has almost completely disappeared. */
export const AXIS_SUNLIGHT_THRESHOLD = 0.01;

export interface AxisPose {
  /** Rotation about the fixed habitat spin axis, before undoing habitat spin. */
  yaw: number;
  /** Local +X hinge rotation; the solar face starts with its normal along +Z. */
  tilt: number;
  sunlit: boolean;
  /** Requested time in sunlight, or the last illuminated pose during eclipse. */
  trackingSeconds: number;
  /** Solar-face normal in the fixed habitat-attitude inertial frame. */
  solarNormal: Vec3;
}

interface ShadowInterval {
  start: number;
  end: number;
}

// Eclipse edges lie on an absolute microsecond grid. This makes an eclipse's
// held pose identical whether it was entered normally or reached by a time skip.
const EDGE_RESOLUTION = 1e-6;
const SEARCH_STEP = ORBIT_PERIOD_SECONDS / 32;
const shadowIntervals: ShadowInterval[] = [];

function illuminated(seconds: number): boolean {
  return (
    getOrbitState(seconds, "inertial").sunlight > AXIS_SUNLIGHT_THRESHOLD
  );
}

function thresholdEdge(
  before: number,
  after: number,
  beforeIsLit: boolean,
): number {
  let low = Math.floor(before / EDGE_RESOLUTION);
  let high = Math.ceil(after / EDGE_RESOLUTION);

  // Usually both rounded endpoints retain their classification. An extremely
  // short grazing eclipse can fall between grid points; retain a continuous
  // bracket in that case rather than searching across the following daylight.
  if (
    illuminated(low * EDGE_RESOLUTION) !== beforeIsLit ||
    illuminated(high * EDGE_RESOLUTION) === beforeIsLit
  ) {
    let left = before;
    let right = after;
    for (let i = 0; i < 48; i += 1) {
      const midpoint = (left + right) / 2;
      if (midpoint === left || midpoint === right) break;
      if (illuminated(midpoint) === beforeIsLit) left = midpoint;
      else right = midpoint;
    }
    return left;
  }

  while (high - low > 1) {
    const midpoint = low + Math.floor((high - low) / 2);
    if (illuminated(midpoint * EDGE_RESOLUTION) === beforeIsLit) {
      low = midpoint;
    } else {
      high = midpoint;
    }
  }
  // For an entry return the last lit sample, and for an exit the first lit one.
  return (beforeIsLit ? low : high) * EDGE_RESOLUTION;
}

function shadowIntervalAt(seconds: number): ShadowInterval {
  const cached = shadowIntervals.find(
    (interval) => seconds >= interval.start && seconds <= interval.end,
  );
  if (cached) return cached;

  let before = seconds - SEARCH_STEP;
  let after = seconds + SEARCH_STEP;
  // A circular Earth orbit always has a daylight arc. These bounded searches
  // cover an entire orbit even when the requested time follows a large skip.
  for (let i = 1; i < 33 && !illuminated(before); i += 1) {
    before -= SEARCH_STEP;
  }
  for (let i = 1; i < 33 && !illuminated(after); i += 1) {
    after += SEARCH_STEP;
  }
  const interval = {
    start: thresholdEdge(before, seconds, true),
    end: thresholdEdge(seconds, after, false),
  };
  shadowIntervals.push(interval);
  if (shadowIntervals.length > 8) shadowIntervals.shift();
  return interval;
}

/**
 * Two-axis Sun pointing without inheriting the station's rotation. The axle
 * stays fixed in inertial space when shaded; its habitat-local drawing must
 * therefore subtract ANGULAR_SPEED * simSeconds from the returned yaw.
 */
export function getAxisPose(simSeconds: number): AxisPose {
  const seconds = Number.isFinite(simSeconds) ? simSeconds : 0;
  const orbit = getOrbitState(seconds, "inertial");
  const sunlit = orbit.sunlight > AXIS_SUNLIGHT_THRESHOLD;
  const trackingSeconds = sunlit
    ? seconds
    : shadowIntervalAt(seconds).start;
  const solarNormal = sunlit
    ? orbit.sunDirection
    : getOrbitState(trackingSeconds, "inertial").sunDirection;
  return {
    yaw: Math.atan2(solarNormal.x, solarNormal.z),
    tilt: -Math.asin(Math.max(-1, Math.min(1, solarNormal.y))),
    sunlit,
    trackingSeconds,
    solarNormal,
  };
}
