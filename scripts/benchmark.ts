import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { arch, availableParallelism, cpus, platform, release, totalmem } from "node:os";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";
import * as THREE from "three";
import type { MotionState } from "../src/physics.ts";

// Vite accepts extensionless local imports; Node's native TypeScript runner
// needs the suffix when loading the same source without a bundler.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !extname(specifier)) {
    return nextResolve(`${specifier}.ts`, context);
  }
  return nextResolve(specifier, context);
} });

const arguments_ = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const argument = arguments_.find((value) => value.startsWith(`${name}=`));
  if (argument) return argument.slice(name.length + 1);
  const index = arguments_.indexOf(name);
  return index < 0 ? undefined : arguments_[index + 1];
};
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = resolve(option("--source") ?? workspace);
let applicationVersion = "unknown";
try { applicationVersion = JSON.parse(readFileSync(resolve(sourceRoot, "package.json"), "utf8")).version; }
catch {
  const archiveRevision = option("--revision");
  if (archiveRevision) {
    try { applicationVersion = JSON.parse(execFileSync("git", ["show", `${archiveRevision}:package.json`], { cwd: workspace, encoding: "utf8" })).version; }
    catch { /* A standalone source export need not have Git metadata. */ }
  }
}
const sampleCount = Math.floor(Math.max(9, Math.min(101, Number(option("--samples")) || 31)));
const load = (name: string) => import(pathToFileURL(resolve(sourceRoot, "src", `${name}.ts`)).href);
const [{ buildHabitat }, { buildSky }, { buildAvatar }, { buildSceneryCollision }, physics, { getOrbitState }, { getAxisPose }] = await Promise.all([
  load("habitat"), load("sky"), load("avatar"), load("scenery-collision"), load("physics"), load("orbit"), load("axis-tracking"),
]);
const gc = (globalThis as typeof globalThis & { gc?: () => void }).gc;
const round = (value: number) => Math.round(value * 1e6) / 1e6;
function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { medianMs: round(sorted[Math.floor(sorted.length / 2)]), p95Ms: round(sorted[Math.ceil(sorted.length * 0.95) - 1]), minMs: round(sorted[0]), samples: sorted.length };
}
function measure(operation: (index: number) => void, iterations: number, warmup = Math.max(1000, iterations * 5)) {
  for (let index = 0; index < warmup; index++) operation(index);
  const times: number[] = [];
  for (let sample = 0; sample < sampleCount; sample++) {
    const start = performance.now();
    for (let index = 0; index < iterations; index++) operation(sample * iterations + index);
    times.push((performance.now() - start) / iterations);
  }
  return { ...distribution(times), operationsPerSample: iterations, warmupOperations: warmup };
}
function createScene() {
  const scene = new THREE.Scene();
  const habitat = buildHabitat(scene);
  const sky = buildSky();
  const avatar = buildAvatar();
  return { scene, habitat, sky, avatar, dispose() { habitat.dispose(); sky.dispose(); avatar.dispose(); } };
}
function construction(build: () => { dispose(): void } = createScene) {
  for (let warmup = 0; warmup < 2; warmup++) build().dispose();
  const times: number[] = [];
  for (let sample = 0; sample < Math.min(sampleCount, 11); sample++) {
    gc?.();
    const start = performance.now();
    const built = build();
    times.push(performance.now() - start);
    built.dispose();
  }
  return { ...distribution(times), warmupOperations: 2, disposalTimed: false };
}
function sceneInventory(roots: THREE.Object3D[]) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const buffers = new Set<ArrayBufferLike>();
  const regularMaterials = new Map<THREE.Material, { meshes: number; triangles: number }>();
  let renderableObjects = 0; let instancedObjects = 0; let instances = 0;
  let triangles = 0; let points = 0; let shadowCasters = 0; let bufferBytes = 0;
  const attribute = (value: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) => {
    const array = value instanceof THREE.InterleavedBufferAttribute ? value.data.array : value.array;
    if (!buffers.has(array.buffer)) { buffers.add(array.buffer); bufferBytes += array.buffer.byteLength; }
  };
  for (const root of roots) root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
    renderableObjects++;
    if (object.castShadow) shadowCasters++;
    const geometry = object.geometry;
    const count = object instanceof THREE.InstancedMesh ? object.count : 1;
    if (object instanceof THREE.InstancedMesh) {
      instancedObjects++; instances += object.count; attribute(object.instanceMatrix);
      if (object.instanceColor) attribute(object.instanceColor);
    }
    const vertices = geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0;
    if (object instanceof THREE.Mesh) triangles += Math.floor(vertices / 3) * count;
    if (object instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh) && !Array.isArray(object.material)) {
      const entry = regularMaterials.get(object.material) ?? { meshes: 0, triangles: 0 };
      entry.meshes++; entry.triangles += Math.floor(vertices / 3);
      regularMaterials.set(object.material, entry);
    }
    if (object instanceof THREE.Points) points += vertices;
    if (!geometries.has(geometry)) {
      geometries.add(geometry);
      const attributes = Object.values(geometry.attributes) as (THREE.BufferAttribute | THREE.InterleavedBufferAttribute)[];
      attributes.forEach(attribute);
      if (geometry.index) attribute(geometry.index);
      const morphs = Object.values(geometry.morphAttributes) as (THREE.BufferAttribute | THREE.InterleavedBufferAttribute)[][];
      morphs.forEach((list) => list?.forEach(attribute));
    }
    (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
  });
  const regularMeshBatchCandidates = [...regularMaterials].filter(([, value]) => value.meshes >= 3)
    .sort(([, a], [, b]) => b.meshes - a.meshes)
    .map(([material, value]) => ({ materialType: material.type, color: "color" in material ? (material.color as THREE.Color).getHexString() : null, ...value }));
  return { renderableObjects, instancedObjects, instances, trianglesBeforeCulling: triangles, pointsBeforeCulling: points, shadowCasters, uniqueGeometries: geometries.size, uniqueMaterials: materials.size, estimatedGeometryAndInstanceBufferBytes: bufferBytes, regularMeshBatchCandidates };
}

console.error("Benchmarking immutable scene construction and deterministic CPU workloads…");
const sceneConstruction = construction();
const habitatConstruction = construction(() => buildHabitat(new THREE.Scene()));
const skyConstruction = construction(() => buildSky());
const avatarConstruction = construction(() => buildAvatar());
gc?.();
const built = createScene();
const inventory = sceneInventory([built.scene, built.sky.scene, built.avatar.scene]);
const colliderCount = built.habitat.colliders.length;
const spatialIndex = measure(() => { buildSceneryCollision(built.habitat.colliders); }, 1, 3);
const collisions = buildSceneryCollision(built.habitat.colliders);
const playerSteps: { previous: MotionState; next: MotionState }[] = [];
const shots: MotionState[] = [];
for (let index = 0; index < 72; index++) {
  const angle = index / 72 * Math.PI * 2;
  const across = [0, -11.7, 11.7, -16, 16, -17][index % 6];
  const point = (offset: number) => ({ x: physics.FLOOR_RADIUS * Math.cos(angle + offset), y: across, z: physics.FLOOR_RADIUS * Math.sin(angle + offset) });
  const velocity = { x: -Math.sin(angle) * 10, y: 0, z: Math.cos(angle) * 10 };
  playerSteps.push({ previous: { position: point(0), velocity }, next: { position: point(10 / physics.FLOOR_RADIUS / 120), velocity } });
  if (index % 6 === 0) {
    const speed = index % 12 === 0 ? 28 : 90;
    shots.push({ position: { x: 208.3 * Math.cos(angle), y: 0, z: 208.3 * Math.sin(angle) }, velocity: { x: -Math.cos(angle) * speed - Math.sin(angle) * 8, y: index % 18 === 0 ? 5 : 0, z: -Math.sin(angle) * speed + Math.cos(angle) * 8 } });
  }
}
const exterior = { x: 300, y: -100, z: 0 };
const spin = physics.rotationVelocity(exterior);
shots.push({ position: exterior, velocity: { x: 20 - spin.x, y: -spin.y, z: -spin.z } });
let sink = 0;
const playerCollision = measure((index) => {
  const step = playerSteps[index % playerSteps.length];
  const result = collisions.resolvePlayer(step.previous, step.next);
  sink += result.state.position.x;
}, 72);
const trajectoryFirstImpact = measure((index) => {
  const impact = collisions.firstImpact(shots[index % shots.length], 30);
  sink += impact?.time ?? 30;
}, shots.length);
const trajectoryPrediction = measure((index) => {
  const shot = shots[index % shots.length];
  const impact = collisions.firstImpact(shot, 30);
  const points = collisions.sampleTrajectory(shot, { duration: impact?.time ?? 30, step: 0.04, stopAtCollision: false });
  sink += points.length;
}, shots.length);
const orbitalAndAxisState = measure((index) => {
  const seconds = index * 11.31;
  const orbit = getOrbitState(seconds);
  const axis = getAxisPose(seconds);
  sink += orbit.sunlight + axis.yaw;
}, 256);
const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.08, 6000);
camera.position.set(208.3, 0, 0); camera.up.set(-1, 0, 0); camera.lookAt(0, 0, -100);
const habitatAndSkyUpdate = measure((index) => {
  const seconds = index / 60;
  const orbit = built.sky.update(seconds, camera, "habitat");
  built.habitat.update(seconds, { ...orbit, viewerPosition: camera.position, shadows: true });
}, 60);
const updateWorldMatrices = () => {
  built.scene.updateMatrixWorld(true); built.sky.scene.updateMatrixWorld(true); built.avatar.scene.updateMatrixWorld(true);
};
const sceneGraphUpdate = measure(updateWorldMatrices, 60);
const frozen: THREE.Mesh[] = [];
for (const scene of [built.scene, built.sky.scene, built.avatar.scene]) scene.traverse((object: THREE.Object3D) => {
  if (object instanceof THREE.Mesh && object.matrixAutoUpdate) {
    object.updateMatrix(); object.matrixAutoUpdate = false; frozen.push(object);
  }
});
const staticMatrixUpperBound = measure(updateWorldMatrices, 60);
frozen.forEach((object) => { object.matrixAutoUpdate = true; });
let pairedSkyComparison: Record<string, unknown> | undefined;
const comparisonSource = option("--compare-source");
if (comparisonSource) {
  const { buildSky: buildBefore } = await import(pathToFileURL(resolve(comparisonSource, "src", "sky.ts")).href);
  for (let warmup = 0; warmup < 2; warmup++) { buildBefore().dispose(); buildSky().dispose(); }
  const before: number[] = []; const after: number[] = [];
  const timed = (build: () => { dispose(): void }, samples: number[]) => {
    gc?.(); const start = performance.now(); const sky = build(); samples.push(performance.now() - start); sky.dispose();
  };
  for (let pair = 0; pair < 11; pair++) {
    if (pair % 2 === 0) { timed(buildBefore, before); timed(buildSky, after); }
    else { timed(buildSky, after); timed(buildBefore, before); }
  }
  const original = distribution(before); const candidate = distribution(after);
  pairedSkyComparison = { method: "11 alternating-order pairs in one process, same Three.js version and forced-GC setting", beforeRevision: option("--compare-revision") ?? "archived source", before: original, after: candidate, medianSpeedup: round(original.medianMs / candidate.medianMs) };
}
let revision = option("--revision") ?? "unknown";
let workingTreeModified: boolean | null = null;
if (!option("--revision")) {
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workspace, encoding: "utf8" }).trim();
    workingTreeModified = !!execFileSync("git", ["status", "--porcelain", "--", "src"], { cwd: workspace, encoding: "utf8" }).trim();
  } catch { /* The benchmark also works in an exported source archive. */ }
}
const report = {
  schemaVersion: 1, kind: "cpu-scene-benchmark", applicationVersion, recordedAt: new Date().toISOString(), revision, workingTreeModified,
  environment: { node: process.version, platform: platform(), osRelease: release(), architecture: arch(), cpuModel: cpus()[0]?.model ?? "unknown", logicalCpus: availableParallelism(), systemMemoryGiB: round(totalmem() / 2 ** 30), threeRevision: THREE.REVISION, forcedGcBetweenConstructionSamples: !!gc },
  methodology: { sampleCount, clocks: "performance.now; milliseconds per operation", graphics: "No renderer: CPU only, no GPU upload or shader compilation", scene: "Habitat, sky and first-person avatar", collisionWorkload: "72 fixed floor positions across promenade, side paths and occupied outer lots; 120 Hz movement steps", trajectoryWorkload: "12 inward shots at 28/90 m/s around the ring plus one unobstructed exterior shot; max30 s, sample0.04 s", inventory: "Pre-culling scene counts; buffer estimate excludes driver overhead, shader programs, render targets and shadow maps" },
  inventory: { ...inventory, colliderCount },
  timings: { sceneConstruction, habitatConstruction, skyConstruction, avatarConstruction, spatialIndexConstruction: spatialIndex, playerCollisionQuery: playerCollision, trajectoryFirstImpact, trajectoryPrediction, orbitalAndAxisState, habitatAndSkyUpdate, sceneGraphUpdate },
  experiments: { staticMeshMatrices: { description: "Upper bound only: all mesh local matrices frozen, including animated sky/avatar meshes; not safe as a blanket production change", frozenMeshes: frozen.length, timings: staticMatrixUpperBound }, pairedSkyComparison },
};
built.dispose();
if (!Number.isFinite(sink)) throw new Error("Non-finite benchmark result.");
const json = `${JSON.stringify(report, null, 2)}\n`;
const output = option("--output");
if (output) { const path = resolve(output); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, json); }
process.stdout.write(json);
