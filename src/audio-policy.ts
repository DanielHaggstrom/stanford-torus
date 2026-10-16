import type { Vec3 } from "./physics.ts";
import {
  getTramState,
  TRAM_DWELL_SECONDS,
  TRAM_TRACK_ACROSS,
  TRAM_TRACK_RADIUS,
  TRAM_TRAVEL_SECONDS,
} from "./tram-motion.ts";
import type { TramDirection, TramState } from "./tram-motion.ts";

export function clampAudioVolume(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

/** Vacuum, a paused simulation, or mute silences every sound on one bus. */
export function audibleGain(
  volume: number,
  muted: boolean,
  active: boolean,
  inside: boolean,
): number {
  return !muted && active && inside ? clampAudioVolume(volume) : 0;
}

export type TramSoundPhase = "stopped" | "accelerating" | "braking";

export function tramSoundPhase(state: TramState): TramSoundPhase {
  if (state.stopped) return "stopped";
  return state.phaseElapsed < TRAM_DWELL_SECONDS + TRAM_TRAVEL_SECONDS / 2
    ? "accelerating"
    : "braking";
}

/** Only a continuously observed arrival rings; opening, resume and skips do not. */
export function tramArrived(
  previousSeconds: number | null,
  seconds: number,
  expectedDelta: number,
  direction: TramDirection,
): boolean {
  if (previousSeconds === null || !Number.isFinite(expectedDelta)) return false;
  const elapsed = seconds - previousSeconds;
  if (
    !Number.isFinite(elapsed) ||
    elapsed <= 0 ||
    expectedDelta <= 0 ||
    elapsed > 1.5 ||
    Math.abs(elapsed - expectedDelta) > Math.max(0.04, expectedDelta * 0.5)
  ) return false;
  return !getTramState(previousSeconds, direction).stopped &&
    getTramState(seconds, direction).stopped;
}

export function tramSoundPosition(angle: number, direction: TramDirection): Vec3 {
  return {
    x: TRAM_TRACK_RADIUS * Math.cos(angle),
    y: direction === "spinward" ? TRAM_TRACK_ACROSS : -TRAM_TRACK_ACROSS,
    z: TRAM_TRACK_RADIUS * Math.sin(angle),
  };
}

/** Cheap stereo positioning with a finite audible range; no HRTF convolvers. */
export function spatialTramSound(
  listener: Vec3,
  forward: Vec3,
  up: Vec3,
  source: Vec3,
): { gain: number; pan: number } {
  const x = source.x - listener.x;
  const y = source.y - listener.y;
  const z = source.z - listener.z;
  const distance = Math.hypot(x, y, z);
  const right = {
    x: forward.y * up.z - forward.z * up.y,
    y: forward.z * up.x - forward.x * up.z,
    z: forward.x * up.y - forward.y * up.x,
  };
  const length = Math.hypot(right.x, right.y, right.z);
  const pan = distance > 0 && length > 0
    ? (x * right.x + y * right.y + z * right.z) / (distance * length)
    : 0;
  // Smoothly disappear before the opposite side of the ring can be heard.
  const edge = Math.max(0, Math.min(1, (120 - distance) / 35));
  return {
    gain: (edge * edge) / (1 + (distance / 14) ** 2),
    pan: Math.max(-1, Math.min(1, pan)),
  };
}

/** Distance-based steps with a real-time cadence cap at accelerated time. */
export function advanceFootsteps(
  phase: number,
  deltaSeconds: number,
  relativeSpeed: number,
  simulationRate: number,
  walking: boolean,
): { phase: number; step: boolean } {
  if (
    !walking || !Number.isFinite(relativeSpeed) || relativeSpeed < 0.25 ||
    !Number.isFinite(deltaSeconds) || deltaSeconds < 0 ||
    !Number.isFinite(simulationRate) || simulationRate <= 0
  ) return { phase: 0, step: false };
  // UI/shot callbacks refresh the hard gate without advancing simulation time.
  if (deltaSeconds === 0) return { phase, step: false };
  const frequency = Math.min(3.8, relativeSpeed * simulationRate / 1.65);
  const next = phase + Math.min(deltaSeconds, 0.1) * frequency;
  return { phase: next % 1, step: next >= 1 };
}
