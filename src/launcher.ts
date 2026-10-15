export const TAP_LAUNCH_SPEED = 28;
export const FULL_LAUNCH_SPEED = 90;
export const CHARGE_DELAY_SECONDS = 0.2;
export const CHARGE_DURATION_SECONDS = 1;

/** A short tap fires at minimum speed; holding longer charges in real seconds. */
export function chargeFraction(heldSeconds: number): number {
  if (!(heldSeconds > CHARGE_DELAY_SECONDS)) return 0;
  return Math.min(
    1,
    (heldSeconds - CHARGE_DELAY_SECONDS) / CHARGE_DURATION_SECONDS,
  );
}

export function launchSpeed(heldSeconds: number): number {
  return (
    TAP_LAUNCH_SPEED +
    (FULL_LAUNCH_SPEED - TAP_LAUNCH_SPEED) * chargeFraction(heldSeconds)
  );
}
