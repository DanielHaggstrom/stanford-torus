export const JUMP_BUFFER_SECONDS = 0.12;
export const COYOTE_SECONDS = 0.12;

export interface JumpAssist {
  press(nowSeconds: number): void;
  updateGrounded(grounded: boolean, nowSeconds: number): void;
  consume(nowSeconds: number): boolean;
  reset(): void;
}

/**
 * Feed a monotonic real clock, updating contact before consuming the jump.
 * A successful jump is spent until a new landing, even if contact persists
 * briefly during takeoff. Key repeat is handled by the input layer.
 */
export function createJumpAssist(): JumpAssist {
  let pressedAt: number | null = null;
  let grounded = false;
  let lastGroundedAt: number | null = null;
  let jumpAvailable = false;

  return {
    press(nowSeconds) {
      if (Number.isFinite(nowSeconds)) pressedAt = nowSeconds;
    },
    updateGrounded(nextGrounded, nowSeconds) {
      if (!Number.isFinite(nowSeconds)) return;
      if (nextGrounded) {
        if (!grounded) jumpAvailable = true;
        lastGroundedAt = nowSeconds;
      }
      grounded = nextGrounded;
    },
    consume(nowSeconds) {
      if (pressedAt === null || !Number.isFinite(nowSeconds)) return false;
      const sincePress = nowSeconds - pressedAt;
      if (sincePress > JUMP_BUFFER_SECONDS + 1e-9) {
        pressedAt = null;
        return false;
      }
      if (sincePress < 0 || !jumpAvailable || lastGroundedAt === null) return false;
      const sinceGround = nowSeconds - lastGroundedAt;
      if (!grounded && (sinceGround < 0 || sinceGround > COYOTE_SECONDS + 1e-9)) return false;
      pressedAt = null;
      jumpAvailable = false;
      return true;
    },
    reset() {
      pressedAt = null;
      grounded = false;
      lastGroundedAt = null;
      jumpAvailable = false;
    },
  };
}
