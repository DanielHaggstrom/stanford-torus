import type { MotionState } from "./physics.ts";

/** Reuse stationary predictions without delaying any change to the launch state. */
export function createTrajectoryCache<T>(predict: (shot: MotionState) => T): {
  get(shot: MotionState): T;
  clear(): void;
} {
  let cached: { shot: MotionState; result: T } | undefined;
  return {
    get(shot) {
      const previous = cached?.shot;
      if (previous &&
        previous.position.x === shot.position.x &&
        previous.position.y === shot.position.y &&
        previous.position.z === shot.position.z &&
        previous.velocity.x === shot.velocity.x &&
        previous.velocity.y === shot.velocity.y &&
        previous.velocity.z === shot.velocity.z) {
        return cached!.result;
      }
      const key = {
        position: { ...shot.position },
        velocity: { ...shot.velocity },
      };
      const result = predict(shot);
      cached = { shot: key, result };
      return result;
    },
    clear() {
      cached = undefined;
    },
  };
}
