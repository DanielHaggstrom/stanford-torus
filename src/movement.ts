/** A held movement input reaches cruising pace after two simulated seconds. */
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

/** Metres per second: an easy first step, then a steady walking/running pace. */
export function walkSpeed(ramp: number, boost = false): number {
  const blend = easedRamp(ramp);
  return boost ? 4 + 6 * blend : 2 + 3 * blend;
}

/** Flight keeps the same two-second spool-up with a higher cruising speed. */
export function flightSpeed(ramp: number, boost = false): number {
  const blend = easedRamp(ramp);
  return boost ? 14 + 22 * blend : 6 + 9 * blend;
}
