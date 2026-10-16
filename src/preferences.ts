import type { GraphicsQuality } from "./render-quality.ts";

export type InputMode = "auto" | "touch" | "mouse";

export interface Preferences {
  mouseSensitivity: number;
  touchSensitivity: number;
  graphicsQuality: GraphicsQuality;
  inputMode: InputMode;
  soundVolume: number;
  soundMuted: boolean;
}

export const PREFERENCES_KEY = "torus.preferences.v1";
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  mouseSensitivity: 1,
  touchSensitivity: 1,
  graphicsQuality: "auto",
  inputMode: "auto",
  soundVolume: 0.35,
  soundMuted: false,
});

function finiteRange(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;
}

/** Invalid or unknown values cannot leak into controls, rendering or audio. */
export function sanitizePreferences(value: unknown): Preferences {
  const input = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    mouseSensitivity: finiteRange(input.mouseSensitivity, DEFAULT_PREFERENCES.mouseSensitivity, 0.3, 2),
    touchSensitivity: finiteRange(input.touchSensitivity, DEFAULT_PREFERENCES.touchSensitivity, 0.3, 2),
    graphicsQuality: input.graphicsQuality === "auto" || input.graphicsQuality === "full" || input.graphicsQuality === "balanced"
      ? input.graphicsQuality
      : DEFAULT_PREFERENCES.graphicsQuality,
    inputMode: input.inputMode === "auto" || input.inputMode === "touch" || input.inputMode === "mouse"
      ? input.inputMode
      : DEFAULT_PREFERENCES.inputMode,
    soundVolume: finiteRange(input.soundVolume, DEFAULT_PREFERENCES.soundVolume, 0, 1),
    soundMuted: typeof input.soundMuted === "boolean" ? input.soundMuted : DEFAULT_PREFERENCES.soundMuted,
  };
}

export function loadPreferences(storage: Pick<Storage, "getItem"> | null): Preferences {
  try {
    const raw = storage?.getItem(PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    const stored: unknown = JSON.parse(raw);
    if (stored === null || typeof stored !== "object" || Array.isArray(stored) ||
      (stored as Record<string, unknown>).version !== 1) return { ...DEFAULT_PREFERENCES };
    return sanitizePreferences(stored);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(storage: Pick<Storage, "setItem"> | null, preferences: Preferences): void {
  try {
    storage?.setItem(PREFERENCES_KEY, JSON.stringify({ version: 1, ...sanitizePreferences(preferences) }));
  } catch {
    // Blocked storage or a full quota must not prevent playing.
  }
}
