export type TouchAction = "move" | "look" | "fire" | "jump" | "descend" | "boost";

export interface TouchMovement {
  forward: number;
  right: number;
  vertical: number;
  boost: boolean;
}

export interface TouchInputCallbacks {
  look(dx: number, dy: number): void;
  jump(): void;
  beginCharge(): void;
  releaseCharge(): void;
  cancelCharge(): void;
}

/** Remap a radial dead zone while keeping diagonal movement inside the unit circle. */
export function joystickVector(x: number, y: number, deadZone = 0.13) {
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length <= deadZone) return { right: 0, forward: 0 };
  const magnitude = Math.min(1, (length - deadZone) / (1 - deadZone));
  return { right: (x / length) * magnitude, forward: (-y / length) * magnitude };
}

/** Each gesture owns its pointer until release; unrelated fingers cannot end it. */
export class TouchInput {
  readonly state: TouchMovement = { forward: 0, right: 0, vertical: 0, boost: false };
  private readonly pointers = new Map<TouchAction, number>();
  private flight = false;
  private readonly callbacks: TouchInputCallbacks;

  constructor(callbacks: TouchInputCallbacks) {
    this.callbacks = callbacks;
  }

  pointerFor(action: TouchAction): number | undefined {
    return this.pointers.get(action);
  }

  begin(action: TouchAction, pointerId: number): boolean {
    if (this.pointers.has(action) || [...this.pointers.values()].includes(pointerId)) return false;
    this.pointers.set(action, pointerId);
    if (action === "fire") this.callbacks.beginCharge();
    if (action === "jump" && !this.flight) this.callbacks.jump();
    this.updateHeldMovement();
    return true;
  }

  moveStick(pointerId: number, x: number, y: number): boolean {
    if (this.pointers.get("move") !== pointerId) return false;
    Object.assign(this.state, joystickVector(x, y));
    return true;
  }

  moveLook(pointerId: number, dx: number, dy: number): boolean {
    if (this.pointers.get("look") !== pointerId) return false;
    this.callbacks.look(dx, dy);
    return true;
  }

  end(pointerId: number, cancelled = false): TouchAction | undefined {
    const action = [...this.pointers].find(([, id]) => id === pointerId)?.[0];
    if (action === undefined) return;
    this.pointers.delete(action);
    if (action === "move") {
      this.state.forward = 0;
      this.state.right = 0;
    }
    if (action === "fire") {
      if (cancelled) this.callbacks.cancelCharge();
      else this.callbacks.releaseCharge();
    }
    this.updateHeldMovement();
    return action;
  }

  setFlight(flight: boolean): void {
    this.flight = flight;
    this.updateHeldMovement();
  }

  reset(): void {
    const charging = this.pointers.has("fire");
    this.pointers.clear();
    Object.assign(this.state, { forward: 0, right: 0, vertical: 0, boost: false });
    if (charging) this.callbacks.cancelCharge();
  }

  private updateHeldMovement(): void {
    this.state.boost = this.pointers.has("boost");
    this.state.vertical = this.flight
      ? Number(this.pointers.has("jump")) - Number(this.pointers.has("descend"))
      : 0;
  }
}
