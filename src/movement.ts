/** A held movement input reaches cruising pace after two real seconds. */
export function updateMotionRamp(
  current: number,
  moving: boolean,
  deltaSeconds: number,
): number {
  if (!moving) return 0;
  const previous = Number.isFinite(current)
    ? Math.min(1, Math.max(0, current))
    : 0;
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  return Math.min(1, previous + delta / 2);
}

function easedRamp(ramp: number): number {
  const t = Number.isFinite(ramp) ? Math.min(1, Math.max(0, ramp)) : 0;
  return t * t * (3 - 2 * t);
}

/** Metres per second: ease into a run without a separate sprint input. */
export function walkSpeed(ramp: number): number {
  const blend = easedRamp(ramp);
  return 4 + 6 * blend;
}

/** Precision flight keeps close inspection comfortable around the hub. */
export function flightSpeed(ramp: number, precision = false): number {
  const blend = easedRamp(ramp);
  return precision ? 1.5 + 1.5 * blend : 14 + 22 * blend;
}
