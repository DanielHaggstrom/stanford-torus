import { TouchInput } from "./touch-input";
import type { TouchAction, TouchInputCallbacks } from "./touch-input";

export interface TouchCallbacks extends TouchInputCallbacks {
  toggleFlight(): void;
  toggleOrbit(): void;
  pause(): void;
  enabledChanged(enabled: boolean): void;
}

export function buildTouchControls(callbacks: TouchCallbacks) {
  const element = <T extends HTMLElement = HTMLElement>(id: string): T => {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Missing touch control: ${id}`);
    return node as T;
  };
  const root = element("touch-controls");
  const canvas = element<HTMLCanvasElement>("world");
  const pad = element("touch-stick");
  const knob = element("touch-stick-knob");
  const mode = element<HTMLSelectElement>("input-mode");
  const flightButton = element<HTMLButtonElement>("touch-flight");
  const descendButton = element<HTMLButtonElement>("touch-descend");
  const jumpButton = element<HTMLButtonElement>("touch-jump");
  const coarse = matchMedia("(pointer: coarse)");
  const input = new TouchInput(callbacks);
  const captures = new Map<number, HTMLElement>();
  const heldButtons = new Map<TouchAction, HTMLElement>([
    ["fire", element("touch-fire")],
    ["jump", jumpButton],
    ["descend", descendButton],
    ["boost", element("touch-boost")],
  ]);
  let enabled = false;
  let active = false;
  let lookPosition: { x: number; y: number } | null = null;

  function centerKnob(): void {
    knob.style.transform = "translate(-50%, -50%)";
  }

  function updateButtons(): void {
    for (const [action, button] of heldButtons) {
      const held = input.pointerFor(action) !== undefined;
      button.classList.toggle("is-held", held);
      button.setAttribute("aria-pressed", String(held));
    }
  }

  function reset(): void {
    input.reset();
    lookPosition = null;
    centerKnob();
    updateButtons();
    for (const [pointerId, target] of captures) {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    }
    captures.clear();
  }

  function updateVisibility(): void {
    root.hidden = !enabled || !active;
    root.setAttribute("aria-hidden", String(root.hidden));
  }

  function updateEnabled(notify = true): void {
    const next = mode.value === "touch" || (mode.value !== "mouse" && coarse.matches);
    if (next !== enabled) {
      enabled = next;
      reset();
      document.documentElement.classList.toggle("touch-input", enabled);
      updateVisibility();
      if (notify) callbacks.enabledChanged(enabled);
    }
  }

  function capture(target: HTMLElement, pointerId: number): void {
    try {
      target.setPointerCapture(pointerId);
      captures.set(pointerId, target);
    } catch {
      // A cancelled pointer can disappear before capture on some mobile browsers.
      finish(pointerId, true);
    }
  }

  function finish(pointerId: number, cancelled: boolean): void {
    const action = input.end(pointerId, cancelled);
    const target = captures.get(pointerId);
    captures.delete(pointerId);
    if (target?.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    if (action === "move") centerKnob();
    if (action === "look") lookPosition = null;
    updateButtons();
  }

  function eligible(event: PointerEvent): boolean {
    return enabled && active && (event.pointerType !== "mouse" || event.button === 0);
  }

  function consume(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function attachRelease(target: HTMLElement): void {
    target.addEventListener("pointerup", (event) => {
      if (!captures.has(event.pointerId)) return;
      consume(event);
      finish(event.pointerId, false);
    });
    for (const name of ["pointercancel", "lostpointercapture"] as const) {
      target.addEventListener(name, (event) => {
        if (!captures.has(event.pointerId)) return;
        finish(event.pointerId, true);
      });
    }
  }

  function updateStick(event: PointerEvent): void {
    const bounds = pad.getBoundingClientRect();
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2);
    const x = (event.clientX - bounds.left - bounds.width / 2) / radius;
    const y = (event.clientY - bounds.top - bounds.height / 2) / radius;
    if (!input.moveStick(event.pointerId, x, y)) return;
    const length = Math.max(1, Math.hypot(x, y));
    const travel = radius * 0.62;
    knob.style.transform = `translate(calc(-50% + ${(x / length) * travel}px), calc(-50% + ${(y / length) * travel}px))`;
  }

  pad.addEventListener("pointerdown", (event) => {
    if (!eligible(event) || !input.begin("move", event.pointerId)) return;
    consume(event);
    capture(pad, event.pointerId);
    updateStick(event);
  });
  pad.addEventListener("pointermove", (event) => {
    if (input.pointerFor("move") !== event.pointerId) return;
    consume(event);
    updateStick(event);
  });
  attachRelease(pad);

  canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" || !eligible(event) || !input.begin("look", event.pointerId)) return;
    consume(event);
    lookPosition = { x: event.clientX, y: event.clientY };
    capture(canvas, event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (input.pointerFor("look") !== event.pointerId || !lookPosition) return;
    consume(event);
    input.moveLook(event.pointerId, event.clientX - lookPosition.x, event.clientY - lookPosition.y);
    lookPosition = { x: event.clientX, y: event.clientY };
  });
  attachRelease(canvas);

  let keyboardPointer = -1;
  for (const [action, button] of heldButtons) {
    const keyboardId = keyboardPointer--;
    button.addEventListener("pointerdown", (event) => {
      if (!eligible(event) || !input.begin(action, event.pointerId)) return;
      consume(event);
      capture(button, event.pointerId);
      updateButtons();
    });
    attachRelease(button);
    button.addEventListener("keydown", (event) => {
      if (event.code !== "Space" && event.code !== "Enter") return;
      if (!enabled || !active) return;
      consume(event);
      if (!event.repeat) input.begin(action, keyboardId);
      updateButtons();
    });
    button.addEventListener("keyup", (event) => {
      if (event.code !== "Space" && event.code !== "Enter") return;
      consume(event);
      finish(keyboardId, false);
    });
    button.addEventListener("blur", () => finish(keyboardId, true));
  }

  for (const [button, action] of [
    [flightButton, callbacks.toggleFlight],
    [element("touch-orbit"), callbacks.toggleOrbit],
    [element("touch-pause"), callbacks.pause],
  ] as const) {
    button.addEventListener("click", (event) => {
      if (!enabled) return;
      consume(event);
      action();
      button.blur();
    });
  }
  root.addEventListener("contextmenu", (event) => event.preventDefault());
  root.addEventListener("selectstart", (event) => event.preventDefault());
  const toolbar = document.getElementById("touch-toolbar");
  toolbar?.addEventListener("contextmenu", (event) => event.preventDefault());
  toolbar?.addEventListener("selectstart", (event) => event.preventDefault());
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) reset();
  });
  mode.addEventListener("change", () => updateEnabled());
  coarse.addEventListener("change", () => updateEnabled());
  updateEnabled(false);
  updateVisibility();
  queueMicrotask(() => callbacks.enabledChanged(enabled));

  return {
    get enabled() { return enabled; },
    state: input.state,
    setActive(next: boolean) {
      active = next;
      if (!active) reset();
      updateVisibility();
    },
    setFlight(flight: boolean) {
      input.setFlight(flight);
      jumpButton.textContent = flight ? "Rise" : "Jump";
      jumpButton.setAttribute("aria-label", flight ? "Hold to rise" : "Jump");
      descendButton.hidden = !flight;
      flightButton.setAttribute("aria-pressed", String(flight));
      flightButton.textContent = flight ? "Walk" : "Fly";
    },
    reset,
  };
}
