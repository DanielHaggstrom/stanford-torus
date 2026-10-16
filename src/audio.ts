import type { Vec3 } from "./physics.ts";
import { isInsideHabitat } from "./habitat-volume.ts";
import {
  advanceFootsteps,
  audibleGain,
  clampAudioVolume,
  spatialTramSound,
  tramArrived,
  tramSoundPhase,
  tramSoundPosition,
} from "./audio-policy.ts";
import { getTramState, TRAMS_PER_DIRECTION } from "./tram-motion.ts";
import type { TramDirection } from "./tram-motion.ts";

export interface AudioFrame {
  /** Head position and camera axes, all in the rotating habitat frame. */
  position: Vec3;
  forward: Vec3;
  up: Vec3;
  /** Walking speed relative to the supporting surface, excluding tram carry. */
  relativeSpeed: number;
  grounded: boolean;
  flying: boolean;
  active: boolean;
  simSeconds: number;
  /** Real frame duration, before multiplication by simulationRate. */
  deltaSeconds: number;
  simulationRate: number;
}

export interface GameAudio {
  unlock(): Promise<void>;
  setVolume(value: number): void;
  setMuted(muted: boolean): void;
  shot(powerFraction: number): void;
  update(frame: AudioFrame): void;
  reset(): void;
  dispose(): void;
}

type Source = OscillatorNode | AudioBufferSourceNode;
const TRAM_VOLUME = 0.6;
type TramVoice = {
  direction: TramDirection;
  index: number;
  motor: OscillatorNode;
  motorGain: GainNode;
  brake: BiquadFilterNode;
  brakeGain: GainNode;
  distance: GainNode;
  pan: StereoPannerNode;
};

/** All sounds are synthesized locally; no downloads, decoded clips or timers. */
export function buildAudio(): GameAudio {
  let context: AudioContext | null = null;
  let mix: GainNode | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let latestFrame: AudioFrame | null = null;
  let previousSeconds: number | null = null;
  let footPhase = 0;
  let leftFoot = false;
  let volume = 0.35;
  let muted = false;
  let unlocked = false;
  let disposed = false;
  let lastGain = -1;
  const nodes = new Set<AudioNode>();
  const loops: Source[] = [];
  const oneShots = new Map<Source, AudioNode[]>();
  const trams: TramVoice[] = [];

  const remember = <T extends AudioNode>(node: T): T => {
    nodes.add(node);
    return node;
  };

  function stopOneShots() {
    for (const [source, connections] of oneShots) {
      try { source.stop(); } catch { /* The source may already have ended. */ }
      source.disconnect();
      for (const node of connections) node.disconnect();
    }
    oneShots.clear();
  }

  function allowed() {
    return !!latestFrame && audibleGain(
      volume, muted, latestFrame.active, isInsideHabitat(latestFrame.position),
    ) > 0;
  }

  function syncGate() {
    if (!context || !master) return;
    const gain = unlocked && allowed() ? volume : 0;
    if (gain === lastGain) return;
    const time = context.currentTime;
    master.gain.cancelScheduledValues(time);
    if (gain === 0) {
      // Vacuum and pause are hard gates, including the tail of a shot/chime.
      master.gain.setValueAtTime(0, time);
      stopOneShots();
    } else {
      master.gain.setTargetAtTime(gain, time, 0.025);
    }
    lastGain = gain;
  }

  function automate(param: AudioParam, value: number, smoothing = 0.035) {
    if (context) param.setTargetAtTime(value, context.currentTime, smoothing);
  }

  function buildGraph(ctx: AudioContext) {
    mix = remember(ctx.createGain());
    master = remember(ctx.createGain());
    master.gain.value = 0;
    const limiter = remember(ctx.createDynamicsCompressor());
    limiter.threshold.value = -14;
    limiter.knee.value = 12;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.15;
    // The hard vacuum/pause gate is the final node, after the compressor.
    mix.connect(limiter).connect(master).connect(ctx.destination);

    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    let seed = 0x7943c1;
    for (let i = 0; i < samples.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      samples[i] = (seed >>> 0) / 2147483648 - 1;
    }
    const noise = remember(ctx.createBufferSource());
    noise.buffer = noiseBuffer;
    noise.loop = true;
    loops.push(noise);
    // A soft ventilation bed plus two low mechanical partials.
    const vent = remember(ctx.createBiquadFilter());
    vent.type = "lowpass";
    vent.frequency.value = 650;
    vent.Q.value = 0.45;
    const ventGain = remember(ctx.createGain());
    ventGain.gain.value = 0.065;
    noise.connect(vent).connect(ventGain).connect(mix);
    for (const [frequency, level] of [[48, 0.022], [96.15, 0.009]]) {
      const hum = remember(ctx.createOscillator());
      hum.type = "sine";
      hum.frequency.value = frequency;
      const gain = remember(ctx.createGain());
      gain.gain.value = level;
      hum.connect(gain).connect(mix);
      loops.push(hum);
      hum.start();
    }
    for (const direction of ["spinward", "antispinward"] as const) {
      for (let index = 0; index < TRAMS_PER_DIRECTION; index++) {
        const motor = remember(ctx.createOscillator());
        motor.type = "triangle";
        motor.frequency.value = 65;
        const motorGain = remember(ctx.createGain());
        motorGain.gain.value = 0;
        const brake = remember(ctx.createBiquadFilter());
        brake.type = "bandpass";
        brake.frequency.value = 1800;
        brake.Q.value = 0.65;
        const brakeGain = remember(ctx.createGain());
        brakeGain.gain.value = 0;
        const distance = remember(ctx.createGain());
        distance.gain.value = 0;
        const pan = remember(ctx.createStereoPanner());
        motor.connect(motorGain).connect(distance);
        noise.connect(brake).connect(brakeGain).connect(distance);
        distance.connect(pan).connect(mix);
        trams.push({ direction, index, motor, motorGain, brake, brakeGain, distance, pan });
        loops.push(motor);
        motor.start();
      }
    }
    noise.start();
  }

  function trackOneShot(source: Source, connections: AudioNode[], end: number) {
    oneShots.set(source, connections);
    source.onended = () => {
      source.disconnect();
      for (const node of connections) node.disconnect();
      oneShots.delete(source);
    };
    source.start();
    source.stop(end);
  }

  function tone(
    frequency: number,
    endFrequency: number,
    level: number,
    duration: number,
    type: OscillatorType = "sine",
    panValue = 0,
    delay = 0,
  ) {
    const ctx = context;
    if (!ctx || !mix) return;
    const source = ctx.createOscillator();
    source.type = type;
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    const start = ctx.currentTime + delay;
    source.frequency.setValueAtTime(frequency, start);
    source.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    pan.pan.value = panValue;
    source.connect(gain).connect(pan).connect(mix);
    trackOneShot(source, [gain, pan], start + duration + 0.02);
  }

  function noiseHit(frequency: number, level: number, duration: number, panValue = 0) {
    const ctx = context;
    if (!ctx || !noiseBuffer || !mix) return;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    filter.Q.value = 0.5;
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(level, ctx.currentTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    pan.pan.value = panValue;
    source.connect(filter).connect(gain).connect(pan).connect(mix);
    trackOneShot(source, [filter, gain, pan], ctx.currentTime + duration + 0.02);
  }

  function reset() {
    previousSeconds = null;
    footPhase = 0;
    stopOneShots();
  }

  return {
    async unlock() {
      if (disposed || typeof window === "undefined") return;
      try {
        if (!context) {
          const Constructor = window.AudioContext ?? (
            window as typeof window & { webkitAudioContext?: typeof AudioContext }
          ).webkitAudioContext;
          if (!Constructor) return;
          context = new Constructor({ latencyHint: "interactive" });
          buildGraph(context);
        }
        if (context.state !== "running") await context.resume();
        unlocked = context.state === "running";
        syncGate();
      } catch {
        // Autoplay denial or unavailable audio never prevents playing the game.
        unlocked = false;
        syncGate();
      }
    },
    setVolume(value) {
      volume = clampAudioVolume(value);
      syncGate();
    },
    setMuted(value) {
      muted = value;
      reset();
      syncGate();
    },
    shot(powerFraction) {
      if (disposed || !unlocked || !allowed()) return;
      const power = clampAudioVolume(powerFraction);
      // A short pneumatic crack, low recoil and a charged magnetic release.
      noiseHit(1900 + power * 2400, 0.33 + power * 0.1, 0.07 + power * 0.05, 0.12);
      tone(145 + power * 60, 48, 0.19, 0.14 + power * 0.07, "sine", 0.12);
      tone(680 + power * 900, 210 + power * 80, 0.035 + power * 0.055,
        0.09 + power * 0.1, "triangle", 0.12);
    },
    update(frame) {
      if (disposed) return;
      latestFrame = frame;
      syncGate();
      if (!unlocked || !allowed() || !context || context.state !== "running") {
        reset();
        return;
      }
      const expectedDelta = frame.deltaSeconds * frame.simulationRate;
      for (const voice of trams) {
        const state = getTramState(frame.simSeconds, voice.direction, voice.index);
        const phase = tramSoundPhase(state);
        const spatial = spatialTramSound(frame.position, frame.forward, frame.up,
          tramSoundPosition(state.angle, voice.direction));
        const speed = Math.min(1, state.speed / 19.2);
        const braking = phase === "braking" ? 1 - speed * 0.7 : 0;
        automate(voice.pan.pan, spatial.pan);
        automate(voice.distance.gain, spatial.gain * TRAM_VOLUME);
        automate(voice.motor.frequency, 65 + speed * (phase === "braking" ? 235 : 310));
        automate(voice.motorGain.gain, state.stopped ? 0 : (0.045 + speed * 0.055));
        automate(voice.brake.frequency, 900 + speed * 1000);
        automate(voice.brakeGain.gain, braking * 0.16);
        if (spatial.gain > 0.015 && tramArrived(previousSeconds,
          frame.simSeconds, expectedDelta, voice.direction)) {
          // One quiet two-part arrival bell, localized at the actual cart.
          tone(660, 660, 0.085 * spatial.gain * TRAM_VOLUME, 0.36, "sine", spatial.pan);
          tone(880, 880, 0.055 * spatial.gain * TRAM_VOLUME, 0.4, "sine", spatial.pan, 0.11);
        }
      }
      const footsteps = advanceFootsteps(footPhase, frame.deltaSeconds,
        frame.relativeSpeed, frame.simulationRate, frame.grounded && !frame.flying);
      footPhase = footsteps.phase;
      if (footsteps.step) {
        leftFoot = !leftFoot;
        const pan = leftFoot ? -0.16 : 0.16;
        noiseHit(leftFoot ? 850 : 1050, 0.19, 0.075, pan);
        tone(leftFoot ? 108 : 99, 52, 0.115, 0.075, "sine", pan);
      }
      previousSeconds = frame.simSeconds;
    },
    reset,
    dispose() {
      if (disposed) return;
      disposed = true;
      reset();
      for (const source of loops) {
        try { source.stop(); } catch { /* Already stopped. */ }
      }
      for (const node of nodes) node.disconnect();
      nodes.clear();
      loops.length = 0;
      trams.length = 0;
      if (context) void context.close().catch(() => {});
      context = null;
      mix = null;
      master = null;
      noiseBuffer = null;
    },
  };
}
