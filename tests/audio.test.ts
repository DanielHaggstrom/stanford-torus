import assert from "node:assert/strict";
import test from "node:test";
import { buildAudio } from "../src/audio.ts";
import type { AudioFrame } from "../src/audio.ts";

class TestParam {
  value = 0;
  events: { kind: string; value: number; time: number }[] = [];
  cancelScheduledValues(time: number) { this.events.push({ kind: "cancel", value: this.value, time }); }
  setValueAtTime(value: number, time: number) { this.record("set", value, time); }
  setTargetAtTime(value: number, time: number) { this.record("target", value, time); }
  linearRampToValueAtTime(value: number, time: number) { this.record("linear", value, time); }
  exponentialRampToValueAtTime(value: number, time: number) { this.record("exponential", value, time); }
  private record(kind: string, value: number, time: number) {
    this.value = value;
    this.events.push({ kind, value, time });
  }
}

class TestNode {
  gain = new TestParam();
  frequency = new TestParam();
  Q = new TestParam();
  pan = new TestParam();
  threshold = new TestParam();
  knee = new TestParam();
  ratio = new TestParam();
  attack = new TestParam();
  release = new TestParam();
  connections: TestNode[] = [];
  disconnects = 0;
  starts = 0;
  stops = 0;
  type = "sine";
  loop = false;
  buffer: unknown = null;
  onended: (() => void) | null = null;
  readonly kind: string;
  constructor(kind: string) { this.kind = kind; }
  connect(node: TestNode) { this.connections.push(node); return node; }
  disconnect() { this.disconnects++; }
  start() { this.starts++; }
  stop() { this.stops++; }
}

class TestContext {
  static instances: TestContext[] = [];
  static rejectResume = false;
  currentTime = 0;
  sampleRate = 8000;
  state = "suspended";
  destination = new TestNode("destination");
  nodes: TestNode[] = [];
  constructor() { TestContext.instances.push(this); }
  private create(kind: string) { const node = new TestNode(kind); this.nodes.push(node); return node; }
  createGain() { return this.create("gain"); }
  createDynamicsCompressor() { return this.create("compressor"); }
  createBufferSource() { return this.create("buffer-source"); }
  createBiquadFilter() { return this.create("filter"); }
  createOscillator() { return this.create("oscillator"); }
  createStereoPanner() { return this.create("panner"); }
  createBuffer(_channels: number, length: number) {
    const samples = new Float32Array(length);
    return { getChannelData: () => samples };
  }
  async resume() {
    if (TestContext.rejectResume) throw new Error("Autoplay denied");
    this.state = "running";
  }
  async close() { this.state = "closed"; }
}

const frame: AudioFrame = {
  position: { x: 208.3, y: 0, z: 0 },
  forward: { x: 0, y: 0, z: -1 },
  up: { x: -1, y: 0, z: 0 },
  relativeSpeed: 0,
  grounded: true,
  flying: false,
  active: true,
  simSeconds: 0,
  deltaSeconds: 1 / 60,
  simulationRate: 1,
};

function withAudioWindow(run: () => Promise<void>) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    value: { AudioContext: TestContext }, configurable: true,
  });
  TestContext.instances.length = 0;
  TestContext.rejectResume = false;
  return run().finally(() => {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
    TestContext.rejectResume = false;
  });
}

test("engine creates audio only on unlock and hard-gates after all processing", async () => {
  await withAudioWindow(async () => {
    const audio = buildAudio();
    audio.setVolume(0.35);
    audio.update(frame);
    audio.shot(1);
    assert.equal(TestContext.instances.length, 0);
    await audio.unlock();
    const ctx = TestContext.instances[0];
    const master = ctx.nodes.find(node => node.connections.includes(ctx.destination));
    assert.ok(master);
    assert.equal(master.kind, "gain");
    assert.equal(master.gain.value, 0.35);
    assert.ok(ctx.nodes.some(node => node.kind === "compressor" && node.connections.includes(master)));
    assert.ok(ctx.nodes.filter(node => node.kind !== "gain")
      .every(node => !node.connections.includes(ctx.destination)));

    const beforeShot = ctx.nodes.length;
    audio.shot(1);
    const shotSources = ctx.nodes.slice(beforeShot).filter(node => node.starts > 0);
    assert.equal(shotSources.length, 3);
    audio.update({ ...frame, position: { x: 170, y: 0, z: 0 } });
    assert.equal(master.gain.value, 0);
    assert.equal(master.gain.events.at(-1)?.kind, "set");
    assert.ok(shotSources.every(node => node.stops >= 2 && node.disconnects > 0));
    const vacuumCount = ctx.nodes.length;
    audio.shot(1);
    assert.equal(ctx.nodes.length, vacuumCount);

    audio.update(frame);
    assert.equal(master.gain.value, 0.35);
    audio.update({ ...frame, active: false });
    assert.equal(master.gain.value, 0);
    audio.update(frame);
    audio.setMuted(true);
    assert.equal(master.gain.value, 0);
    audio.setMuted(false);
    assert.equal(master.gain.value, 0.35);
    audio.setVolume(0);
    assert.equal(master.gain.value, 0);

    audio.dispose();
    assert.equal(ctx.state, "closed");
    assert.ok(ctx.nodes.filter(node => node.starts > 0).every(node => node.stops >= 1));
    const disposedCount = ctx.nodes.length;
    audio.update(frame);
    audio.shot(1);
    await audio.unlock();
    assert.equal(ctx.nodes.length, disposedCount);
    assert.equal(TestContext.instances.length, 1);
  });
});

test("arrival is not replayed after pause, reset or an orbit time skip", async () => {
  await withAudioWindow(async () => {
    const audio = buildAudio();
    // First spinward cart arrives at station 5 at t=26.
    const position = { x: 208 * Math.cos(-Math.PI / 3), y: 8, z: 208 * Math.sin(-Math.PI / 3) };
    const at = (simSeconds: number, active = true): AudioFrame => ({
      ...frame, position, simSeconds, active, deltaSeconds: 0.05,
    });
    audio.update(at(25.98));
    await audio.unlock();
    const ctx = TestContext.instances[0];
    audio.update(at(25.98));
    const first = ctx.nodes.length;
    audio.update(at(26.03));
    assert.equal(ctx.nodes.slice(first).filter(node => node.starts > 0).length, 2);
    const arrived = ctx.nodes.length;
    audio.update(at(26.08));
    assert.equal(ctx.nodes.length, arrived);

    audio.update(at(51.98));
    audio.update(at(51.99, false));
    audio.update(at(52.03));
    assert.equal(ctx.nodes.length, arrived);
    audio.update(at(77.98));
    audio.reset();
    audio.update(at(78.03));
    assert.equal(ctx.nodes.length, arrived);
    audio.update(at(103.98));
    audio.update(at(130.03));
    assert.equal(ctx.nodes.length, arrived);
    audio.dispose();
  });
});

test("unsupported audio and rejected autoplay leave the game usable", async () => {
  await withAudioWindow(async () => {
    const audio = buildAudio();
    audio.update(frame);
    TestContext.rejectResume = true;
    await assert.doesNotReject(audio.unlock());
    const ctx = TestContext.instances[0];
    const count = ctx.nodes.length;
    audio.shot(1);
    assert.equal(ctx.nodes.length, count);
    TestContext.rejectResume = false;
    await audio.unlock();
    audio.shot(0);
    assert.ok(ctx.nodes.length > count);
    audio.dispose();
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
    const unsupported = buildAudio();
    await assert.doesNotReject(unsupported.unlock());
    unsupported.update(frame);
    unsupported.shot(1);
    unsupported.dispose();
  });
});
