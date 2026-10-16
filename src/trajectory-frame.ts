import { ANGULAR_SPEED, rotateY, type Vec3 } from "./physics.ts";

function spaceWeight(habitatWeight: number): number {
  const matched = Number.isFinite(habitatWeight)
    ? Math.max(0, Math.min(1, habitatWeight))
    : 1;
  return 1 - matched;
}

/** Render a future rotating-frame sample in the observer's current reference. */
export function predictionPoint(
  point: Vec3,
  futureSeconds: number,
  habitatWeight: number,
): Vec3 {
  return rotateY(point, ANGULAR_SPEED * futureSeconds * spaceWeight(habitatWeight));
}

/** Bring a recorded position from its sampling time into the current reference. */
export function trailPoint(
  point: Vec3,
  sampleTime: number,
  now: number,
  habitatWeight: number,
): Vec3 {
  return rotateY(point, -ANGULAR_SPEED * (now - sampleTime) * spaceWeight(habitatWeight));
}
