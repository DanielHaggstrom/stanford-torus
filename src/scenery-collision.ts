import {
  ANGULAR_SPEED,
  FLOOR_RADIUS,
  floorNormal,
  rotatingAcceleration,
  stepFreeFlight,
  type HabitatBounds,
  type Impact,
  type MotionState,
  type Vec3,
} from "./physics.ts";
import { firstEnclosureImpact, type EnclosureImpact } from "./enclosure-collision.ts";

/** The same local bounds and transforms used to draw a piece of scenery. */
export interface StaticCollider {
  center: Vec3;
  halfSize: Vec3;
  axes: readonly [Vec3, Vec3, Vec3];
  kind?: string;
}

export interface SceneryImpact extends Omit<Impact, "kind"> {
  kind: Impact["kind"] | EnclosureImpact["kind"] | "scenery";
  collider?: StaticCollider;
}

export interface PlayerCollisionOptions {
  radius?: number;
  height?: number;
  grounded?: boolean;
  flying?: boolean;
}

interface Bounds { min: Vec3; max: Vec3 }
interface IndexedCollider { collider: StaticCollider; bounds: Bounds }
interface CapsuleDistance { distance: number; normal: Vec3; penetration: number }

const EPSILON = 1e-8;
const CONTACT_SKIN = 0.0005;
const CELL_SIZE = 16;
const CURVE_TOLERANCE = 0.004;

const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subtract = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale = (a: Vec3, n: number): Vec3 => ({ x: a.x * n, y: a.y * n, z: a.z * n });
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const length = (a: Vec3) => Math.hypot(a.x, a.y, a.z);
const mix = (a: Vec3, b: Vec3, t: number) => add(a, scale(subtract(b, a), t));
const values = (a: Vec3) => [a.x, a.y, a.z];
const clamp = (a: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, a));

function localPoint(point: Vec3, collider: StaticCollider): number[] {
  const relative = subtract(point, collider.center);
  return collider.axes.map((axis) => dot(relative, axis));
}

function worldVector(point: readonly number[], collider: StaticCollider): Vec3 {
  return collider.axes.reduce((sum, axis, index) => add(sum, scale(axis, point[index])), { x: 0, y: 0, z: 0 });
}

function colliderBounds(collider: StaticCollider): Bounds {
  const half = values(collider.halfSize);
  const extent = { x: 0, y: 0, z: 0 };
  for (let axis = 0; axis < 3; axis++) {
    extent.x += Math.abs(collider.axes[axis].x) * half[axis];
    extent.y += Math.abs(collider.axes[axis].y) * half[axis];
    extent.z += Math.abs(collider.axes[axis].z) * half[axis];
  }
  return { min: subtract(collider.center, extent), max: add(collider.center, extent) };
}

function boundsFor(points: readonly Vec3[], padding = 0): Bounds {
  return {
    min: {
      x: Math.min(...points.map((p) => p.x)) - padding,
      y: Math.min(...points.map((p) => p.y)) - padding,
      z: Math.min(...points.map((p) => p.z)) - padding,
    },
    max: {
      x: Math.max(...points.map((p) => p.x)) + padding,
      y: Math.max(...points.map((p) => p.y)) + padding,
      z: Math.max(...points.map((p) => p.z)) + padding,
    },
  };
}

function overlaps(a: Bounds, b: Bounds): boolean {
  return a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z;
}

/** Segment against an AABB, in the box's own coordinate system. */
function rayBox(a: readonly number[], b: readonly number[], half: readonly number[]): { time: number; axis: number; sign: number; exit: number; exitAxis: number; exitSign: number } | null {
  let enter = 0;
  let exit = 1;
  let axis = 0;
  let sign = 1;
  let exitAxis = 0;
  let exitSign = 1;
  for (let index = 0; index < 3; index++) {
    const delta = b[index] - a[index];
    if (Math.abs(delta) < EPSILON) {
      if (Math.abs(a[index]) > half[index]) return null;
      continue;
    }
    const first = (-half[index] - a[index]) / delta;
    const second = (half[index] - a[index]) / delta;
    const lo = Math.min(first, second);
    const hi = Math.max(first, second);
    if (lo > enter) { enter = lo; axis = index; sign = delta > 0 ? -1 : 1; }
    if (hi < exit) { exit = hi; exitAxis = index; exitSign = delta > 0 ? 1 : -1; }
    if (enter > exit) return null;
  }
  return exit >= 0 && enter <= 1 ? { time: enter, axis, sign, exit, exitAxis, exitSign } : null;
}

/** Exact distance from a line segment to a box, then subtract the capsule radius. */
function capsuleDistance(foot: Vec3, collider: StaticCollider, radius: number, height: number): CapsuleDistance {
  const up = floorNormal(foot);
  const a = localPoint(add(foot, scale(up, radius)), collider);
  const b = localPoint(add(foot, scale(up, Math.max(radius, height - radius))), collider);
  const half = values(collider.halfSize);
  const direction = b.map((value, index) => value - a[index]);
  const breaks = [0, 1];
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(direction[axis]) < EPSILON) continue;
    for (const sign of [-1, 1]) {
      const t = (sign * half[axis] - a[axis]) / direction[axis];
      if (t > 0 && t < 1) breaks.push(t);
    }
  }
  breaks.sort((left, right) => left - right);
  let bestSquared = Infinity;
  let bestDelta = [0, 0, 0];
  const evaluate = (time: number) => {
    const point = a.map((value, index) => value + direction[index] * time);
    const delta = point.map((value, index) => value - clamp(value, -half[index], half[index]));
    const squared = delta.reduce((sum, value) => sum + value * value, 0);
    if (squared < bestSquared) { bestSquared = squared; bestDelta = delta; }
  };
  for (let index = 0; index < breaks.length - 1; index++) {
    const start = breaks[index];
    const end = breaks[index + 1];
    const middle = (start + end) / 2;
    let numerator = 0;
    let denominator = 0;
    for (let axis = 0; axis < 3; axis++) {
      const atMiddle = a[axis] + direction[axis] * middle;
      if (Math.abs(atMiddle) <= half[axis]) continue;
      numerator += direction[axis] * (a[axis] - Math.sign(atMiddle) * half[axis]);
      denominator += direction[axis] * direction[axis];
    }
    evaluate(start);
    evaluate(end);
    if (denominator > EPSILON) evaluate(clamp(-numerator / denominator, start, end));
  }
  const distance = Math.sqrt(bestSquared);
  if (distance > EPSILON) {
    return { distance: distance - radius, normal: scale(worldVector(bestDelta, collider), 1 / distance), penetration: Math.max(0, radius - distance) };
  }
  // A spawn, support snap, or large frame step can put the centre line inside.
  // Choose the shortest displacement that takes the entire capsule outside.
  let penetration = Infinity;
  let normal = up;
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      const amount = sign > 0
        ? half[axis] + radius - Math.min(a[axis], b[axis])
        : half[axis] + radius + Math.max(a[axis], b[axis]);
      if (amount < penetration) { penetration = amount; normal = scale(collider.axes[axis], sign); }
    }
  }
  return { distance: -penetration, normal, penetration };
}

export function buildSceneryCollision(colliders: readonly StaticCollider[]) {
  const indexed: IndexedCollider[] = colliders.map((collider) => ({ collider, bounds: colliderBounds(collider) }));
  const cells = new Map<string, number[]>();
  const cell = (value: number) => Math.floor(value / CELL_SIZE);
  const visitCells = (bounds: Bounds, callback: (key: string) => void) => {
    for (let x = cell(bounds.min.x); x <= cell(bounds.max.x); x++) {
      for (let y = cell(bounds.min.y); y <= cell(bounds.max.y); y++) {
        for (let z = cell(bounds.min.z); z <= cell(bounds.max.z); z++) callback(`${x},${y},${z}`);
      }
    }
  };
  indexed.forEach((entry, index) => visitCells(entry.bounds, (key) => {
    const members = cells.get(key);
    if (members) members.push(index);
    else cells.set(key, [index]);
  }));
  const query = (bounds: Bounds): StaticCollider[] => {
    const seen = new Set<number>();
    const found: StaticCollider[] = [];
    visitCells(bounds, (key) => {
      for (const index of cells.get(key) ?? []) {
        if (seen.has(index)) continue;
        seen.add(index);
        if (overlaps(bounds, indexed[index].bounds)) found.push(indexed[index].collider);
      }
    });
    return found;
  };

  /** Height of an accessible upward-facing surface, along the local radial up. */
  function supportHeight(position: Vec3, previousPosition: Vec3 = position, maxStep = 0.35, radius = 0.3): number | null {
    const up = floorNormal(position);
    const previousHeight = FLOOR_RADIUS - Math.hypot(previousPosition.x, previousPosition.z);
    const base = { x: -up.x * FLOOR_RADIUS, y: position.y, z: -up.z * FLOOR_RADIUS };
    const top = add(base, scale(up, Math.min(75, Math.max(1, previousHeight + maxStep + 0.01))));
    let highest: number | null = null;
    for (const collider of query(boundsFor([base, top], 0.01))) {
      const intersection = rayBox(localPoint(base, collider), localPoint(top, collider), values(collider.halfSize));
      if (!intersection || intersection.exit >= 1 - EPSILON) continue;
      const normal = scale(collider.axes[intersection.exitAxis], intersection.exitSign);
      const slopeCosine = dot(normal, up);
      if (slopeCosine < 0.55) continue;
      const hit = mix(base, top, intersection.exit);
      // The rounded sole touches an inclined roof before its radial foot
      // point does. Account for that distance so the support snap and capsule
      // solver agree, rather than repeatedly pushing the rider down a slope.
      const elevation = dot(subtract(hit, base), up) + radius * (1 / slopeCosine - 1);
      if (elevation < -EPSILON || elevation > previousHeight + maxStep + EPSILON) continue;
      highest = Math.max(highest ?? -Infinity, elevation);
    }
    return highest;
  }

  function resolvePlayer(previous: MotionState, next: MotionState, options: PlayerCollisionOptions = {}): { state: MotionState; grounded: boolean; hit: boolean } {
    const radius = options.radius ?? 0.3;
    const height = options.height ?? 1.7;
    let position = { ...previous.position };
    let remaining = subtract(next.position, position);
    let velocity = { ...next.velocity };
    let hit = false;
    let grounded = false;
    // Conservative advancement uses exact capsule/box distance. A long fast
    // flight step therefore cannot pass through a slender trunk or wall.
    for (let iteration = 0; iteration < 5; iteration++) {
      const end = add(position, remaining);
      const candidates = query(boundsFor([
        position, end,
        add(position, scale(floorNormal(position), height)),
        add(end, scale(floorNormal(end), height)),
      ], radius + CONTACT_SKIN));
      let first: { time: number; normal: Vec3; penetration: number } | null = null;
      const motionLength = length(remaining);
      const speedBound = motionLength + height * length(subtract(floorNormal(position), floorNormal(end)));
      for (const collider of candidates) {
        let time = 0;
        for (let advance = 0; advance < 32; advance++) {
          const contact = capsuleDistance(mix(position, end, time), collider, radius, height);
          if (contact.distance <= CONTACT_SKIN) {
            const inward = dot(remaining, contact.normal);
            if (contact.distance < -CONTACT_SKIN || inward < -EPSILON) {
              if (!first || time < first.time) first = { time, normal: contact.normal, penetration: contact.penetration };
            }
            break;
          }
          if (speedBound < EPSILON) break;
          time += Math.max(1e-7, (contact.distance - CONTACT_SKIN * 0.5) / speedBound);
          if (time > 1 + EPSILON || (first && time > first.time)) break;
        }
      }
      if (!first) { position = end; break; }
      hit = true;
      position = mix(position, end, Math.max(0, first.time));
      position = add(position, scale(first.normal, first.penetration + CONTACT_SKIN));
      remaining = scale(remaining, 1 - first.time);
      const inwardMotion = dot(remaining, first.normal);
      if (inwardMotion < 0) remaining = subtract(remaining, scale(first.normal, inwardMotion));
      const inwardSpeed = dot(velocity, first.normal);
      if (inwardSpeed < 0) velocity = subtract(velocity, scale(first.normal, inwardSpeed));
      if (dot(first.normal, floorNormal(position)) > 0.55 && !options.flying) grounded = true;
      if (length(remaining) < EPSILON) break;
    }
    if (!options.flying && !grounded) {
      const support = supportHeight(position, position, 0.02, radius);
      const elevation = FLOOR_RADIUS - Math.hypot(position.x, position.z);
      grounded = support !== null && Math.abs(support - elevation) < 0.025 && dot(velocity, floorNormal(position)) <= 0.1;
    }
    return { state: { position, velocity }, grounded, hit };
  }

  function traceBox(state: MotionState, start: number, end: number, collider: StaticCollider, angularSpeed: number, depth = 4): SceneryImpact | null {
    const startPosition = stepFreeFlight(state, start, angularSpeed).position;
    const endPosition = stepFreeFlight(state, end, angularSpeed).position;
    const a = localPoint(startPosition, collider);
    const b = localPoint(endPosition, collider);
    const half = values(collider.halfSize);
    if (a.every((value, index) => Math.abs(value) < half[index] - EPSILON)) {
      let axis = 0;
      for (let index = 1; index < 3; index++) if (half[index] - Math.abs(a[index]) < half[axis] - Math.abs(a[axis])) axis = index;
      return { time: start, position: startPosition, normal: scale(collider.axes[axis], Math.sign(a[axis]) || 1), kind: "scenery", collider };
    }
    let first: SceneryImpact | null = null;
    // Solve the exact rotating trajectory against candidate entry planes.
    // The small chord is only a broadphase; it never defines the final hit.
    for (let axis = 0; axis < 3; axis++) {
      for (const sign of [-1, 1]) {
        const atStart = sign * a[axis] - half[axis];
        const atEnd = sign * b[axis] - half[axis];
        if (atStart < -EPSILON || atEnd > EPSILON || atStart - atEnd < EPSILON) continue;
        let lo = start;
        let hi = end;
        for (let iteration = 0; iteration < 35; iteration++) {
          const mid = (lo + hi) / 2;
          const point = stepFreeFlight(state, mid, angularSpeed).position;
          const distance = sign * dot(subtract(point, collider.center), collider.axes[axis]) - half[axis];
          if (distance > 0) lo = mid;
          else hi = mid;
        }
        const time = (lo + hi) / 2;
        const position = stepFreeFlight(state, time, angularSpeed).position;
        const point = localPoint(position, collider);
        if (point.every((value, index) => Math.abs(value) <= half[index] + 1e-6) && (!first || time < first.time)) {
          first = { time, position, normal: scale(collider.axes[axis], sign), kind: "scenery", collider };
        }
      }
    }
    if (first || depth === 0) return first;
    const mid = (start + end) / 2;
    const middle = localPoint(stepFreeFlight(state, mid, angularSpeed).position, collider);
    const bow = Math.hypot(...middle.map((value, index) => value - (a[index] + b[index]) / 2));
    if (bow < 1e-6 || !rayBox(a, b, half.map((value) => value + bow * 1.01))) return null;
    // A shallow grazing entry may turn around inside this interval. Subdivide
    // that rare case instead of overlooking an object thinner than the chord.
    return traceBox(state, start, mid, collider, angularSpeed, depth - 1)
      ?? traceBox(state, mid, end, collider, angularSpeed, depth - 1);
  }

  function firstImpact(state: MotionState, duration: number, options: HabitatBounds = {}): SceneryImpact | null {
    if (!(duration >= 0) || !Number.isFinite(duration)) throw new RangeError("Collision duration must be finite and nonnegative.");
    const boundsImpact = firstEnclosureImpact(state, duration, options);
    const limit = boundsImpact?.time ?? duration;
    const angularSpeed = options.angularSpeed ?? ANGULAR_SPEED;
    let time = 0;
    do {
      const current = stepFreeFlight(state, time, angularSpeed);
      const acceleration = length(rotatingAcceleration(current.position, current.velocity, angularSpeed));
      const step = Math.min(0.05, Math.sqrt(8 * CURVE_TOLERANCE / Math.max(1, acceleration)));
      const end = Math.min(limit, time + step);
      const next = stepFreeFlight(state, end, angularSpeed).position;
      let first: SceneryImpact | null = null;
      for (const collider of query(boundsFor([current.position, next], CURVE_TOLERANCE * 1.1))) {
        const impact = traceBox(state, time, end, collider, angularSpeed);
        if (impact && (!first || impact.time < first.time)) first = impact;
      }
      if (first) return first;
      time = end;
    } while (time < limit - EPSILON);
    return boundsImpact;
  }

  function advanceBallistic(state: MotionState, deltaSeconds: number, options: HabitatBounds = {}): { state: MotionState; impact: SceneryImpact | null } {
    const impact = firstImpact(state, deltaSeconds, options);
    return { state: stepFreeFlight(state, impact?.time ?? deltaSeconds, options.angularSpeed), impact };
  }

  function sampleTrajectory(state: MotionState, options: HabitatBounds & { duration: number; step: number; stopAtCollision?: boolean }): Vec3[] {
    if (!(options.step > 0) || !Number.isFinite(options.step)) throw new RangeError("Trajectory sample step must be finite and positive.");
    if (!(options.duration >= 0) || !Number.isFinite(options.duration)) throw new RangeError("Trajectory duration must be finite and nonnegative.");
    const impact = options.stopAtCollision === false ? null : firstImpact(state, options.duration, options);
    const end = impact?.time ?? options.duration;
    const points = [{ ...state.position }];
    for (let time = options.step; time < end; time += options.step) points.push(stepFreeFlight(state, time, options.angularSpeed).position);
    if (end > 0) points.push(stepFreeFlight(state, end, options.angularSpeed).position);
    return points;
  }

  return { resolvePlayer, supportHeight, firstImpact, advanceBallistic, sampleTrajectory };
}
