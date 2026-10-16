import {
  ANGULAR_SPEED,
  FLOOR_RADIUS,
  HALF_WIDTH,
  floorNormal,
  rotationVelocity,
  stepFreeFlight,
  type HabitatBounds,
  type Impact,
  type MotionState,
  type Vec3,
} from "./physics.ts";
import { ENCLOSURE_HALF_WIDTH, ENCLOSURE_HEIGHT, ENCLOSURE_HULL_DEPTH } from "./habitat-volume.ts";

export interface EnclosureImpact extends Omit<Impact, "kind"> {
  kind: "floor" | "enclosure";
}

const TIME_EPSILON = 1e-10;
const SURFACE_EPSILON = 1e-10;

const polynomialValue = (coefficients: readonly number[], x: number): number =>
  coefficients.reduceRight((value, coefficient) => value * x + coefficient, 0);

/** Real polynomial roots in a bounded interval, including repeated roots. */
function polynomialRoots(coefficients: readonly number[], lower = 0, upper = 1): number[] {
  const values = [...coefficients];
  const scale = Math.max(...values.map(Math.abs));
  while (values.length > 1 && Math.abs(values.at(-1)!) <= scale * 1e-15) values.pop();
  if (values.length < 2) return [];
  if (values.length === 2) {
    const root = -values[0] / values[1];
    return root >= lower && root <= upper ? [root] : [];
  }
  const derivative = values.slice(1).map((value, index) => value * (index + 1));
  const critical = polynomialRoots(derivative, lower, upper);
  const points = [lower, ...critical, upper];
  const roots: number[] = [];
  const tolerance = scale * 2e-14;
  for (const point of points) {
    if (Math.abs(polynomialValue(values, point)) <= tolerance) roots.push(point);
  }
  for (let index = 1; index < points.length; index++) {
    let lo = points[index - 1];
    let hi = points[index];
    let atLo = polynomialValue(values, lo);
    const atHi = polynomialValue(values, hi);
    if (atLo * atHi >= 0) continue;
    for (let iteration = 0; iteration < 60; iteration++) {
      const middle = (lo + hi) / 2;
      const value = polynomialValue(values, middle);
      if (atLo * value > 0) { lo = middle; atLo = value; }
      else hi = middle;
    }
    roots.push((lo + hi) / 2);
  }
  return roots.sort((a, b) => a - b).filter((root, index, ordered) => index === 0 || root - ordered[index - 1] > 1e-12);
}

function quadraticRoots(a: number, b: number, c: number): number[] {
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const squareRoot = Math.sqrt(discriminant);
  // The alternate expression preserves the near root when b is large.
  const q = -0.5 * (b + (b < 0 ? -squareRoot : squareRoot));
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q].sort((left, right) => left - right);
}

function traceEnclosureShell(
  state: MotionState,
  velocity: Vec3,
  duration: number,
  radius: number,
  width: number,
  height: number,
  outside: boolean,
  angularSpeed: number,
): EnclosureImpact | null {
  const initial = state.position;
  const a = velocity.x ** 2 + velocity.z ** 2;
  const b = 2 * (initial.x * velocity.x + initial.z * velocity.z);
  const outerRadius = radius + (outside ? height : 0);
  const c = initial.x ** 2 + initial.z ** 2 - outerRadius ** 2;
  // Clipping to the shell's outer cylinder and axial strip also keeps the
  // quartic well conditioned for long previews and fast, complete crossings.
  let start = 0;
  let end = duration;
  if (a === 0) {
    if (c > SURFACE_EPSILON) return null;
  } else {
    const roots = quadraticRoots(a, b, c);
    if (!roots.length) return null;
    start = Math.max(start, roots[0]);
    end = Math.min(end, roots.at(-1)!);
  }
  if (velocity.y === 0) {
    if (Math.abs(initial.y) > width) return null;
  } else {
    const axialRoots = [(-width - initial.y) / velocity.y, (width - initial.y) / velocity.y].sort((left, right) => left - right);
    start = Math.max(start, axialRoots[0]);
    end = Math.min(end, axialRoots[1]);
  }
  if (start > end + TIME_EPSILON || end < 0) return null;
  start = Math.max(0, start);
  end = Math.max(start, end);
  const span = end - start;
  const atStart = {
    x: initial.x + velocity.x * start,
    y: initial.y + velocity.y * start,
    z: initial.z + velocity.z * start,
  };
  const displacement = { x: velocity.x * span, y: velocity.y * span, z: velocity.z * span };
  const q = [
    (atStart.x ** 2 + atStart.z ** 2) / radius ** 2,
    2 * (atStart.x * displacement.x + atStart.z * displacement.z) / radius ** 2,
    (displacement.x ** 2 + displacement.z ** 2) / radius ** 2,
  ];
  const ratio = height ** 2 / radius ** 2;
  const y = atStart.y / width;
  const dy = displacement.y / width;
  // Squaring rho^2 + R^2 - H^2 + H^2(y/W)^2 = 2R*rho
  // gives a quartic. Its sign agrees with the unsquared ellipse, so derivative
  // roots bracket all crossings, including a tangent with no sign change.
  const ellipse = [q[0] + 1 - ratio + ratio * y ** 2, q[1] + 2 * ratio * y * dy, q[2] + ratio * dy ** 2];
  const polynomial = new Array<number>(5).fill(0);
  for (let left = 0; left < 3; left++) for (let right = 0; right < 3; right++) polynomial[left + right] += ellipse[left] * ellipse[right];
  for (let index = 0; index < 3; index++) polynomial[index] -= 4 * q[index];
  const derivative = polynomial.slice(1).map((coefficient, index) => coefficient * (index + 1));
  const points = [0, ...polynomialRoots(derivative), 1];
  const surface = (fraction: number) => {
    const rho = Math.hypot(atStart.x + displacement.x * fraction, atStart.z + displacement.z * fraction);
    const h = radius - rho;
    return (h / height) ** 2 + (y + dy * fraction) ** 2 - 1;
  };
  const candidates: number[] = [];
  for (const point of points) if (Math.abs(surface(point)) <= SURFACE_EPSILON) candidates.push(point);
  for (let index = 1; index < points.length; index++) {
    let lo = points[index - 1];
    let hi = points[index];
    let atLo = surface(lo);
    if (atLo * surface(hi) >= 0) continue;
    for (let iteration = 0; iteration < 55; iteration++) {
      const middle = (lo + hi) / 2;
      const value = surface(middle);
      if (atLo * value > 0) { lo = middle; atLo = value; }
      else hi = middle;
    }
    candidates.push((lo + hi) / 2);
  }
  candidates.sort((left, right) => left - right);
  for (const fraction of candidates) {
    const time = start + span * fraction;
    const position = stepFreeFlight(state, time, angularSpeed).position;
    const rho = Math.hypot(position.x, position.z);
    const h = radius - rho;
    if (outside ? h > SURFACE_EPSILON : h < -SURFACE_EPSILON) continue;
    if (time <= TIME_EPSILON) {
      const initialRadius = Math.hypot(initial.x, initial.z);
      const initialHeight = radius - initialRadius;
      const radialSpeed = initialRadius > 0 ? (initial.x * velocity.x + initial.z * velocity.z) / initialRadius : 0;
      const slope = -2 * initialHeight * radialSpeed / height ** 2 + 2 * initial.y * velocity.y / width ** 2;
      if (slope < -SURFACE_EPSILON) continue;
      if (Math.abs(slope) <= SURFACE_EPSILON) {
        const radialAcceleration = initialRadius > 0 ? (a - radialSpeed ** 2) / initialRadius : 0;
        const curvature = 2 * (radialSpeed ** 2 - initialHeight * radialAcceleration) / height ** 2 + 2 * velocity.y ** 2 / width ** 2;
        if (curvature <= SURFACE_EPSILON) continue;
      }
    }
    const normal = { x: h * position.x / (rho * height ** 2), y: -position.y / width ** 2, z: h * position.z / (rho * height ** 2) };
    const magnitude = Math.hypot(normal.x, normal.y, normal.z);
    if (!(magnitude > 0)) continue;
    return {
      time,
      position,
      normal: { x: normal.x / magnitude, y: normal.y / magnitude, z: normal.z / magnitude },
      kind: "enclosure",
    };
  }
  return null;
}

/**
 * Continuous probe collision with the closed pressure enclosure. Its deck is
 * cylindrical, with an elliptical canopy and a shallow elliptical lower hull.
 * Rotation leaves radius and axial position unchanged, so all intersections
 * can be solved on the inertial straight line, including shots from space.
 */
export function firstEnclosureImpact(
  state: MotionState,
  duration: number,
  options: HabitatBounds = {},
): EnclosureImpact | null {
  if (!(duration >= 0) || !Number.isFinite(duration)) throw new RangeError("Collision duration must be finite and nonnegative.");
  const radius = options.floorRadius ?? FLOOR_RADIUS;
  const width = options.halfWidth ?? ENCLOSURE_HALF_WIDTH;
  const deckWidth = Math.min(width, HALF_WIDTH);
  const height = ENCLOSURE_HEIGHT;
  if (!(radius > height) || !(width > 0) || !Number.isFinite(radius) || !Number.isFinite(width)) {
    throw new RangeError("Enclosure dimensions must be finite and positive, with radius greater than height.");
  }
  const angularSpeed = options.angularSpeed ?? ANGULAR_SPEED;
  const surfaceVelocity = rotationVelocity(state.position, angularSpeed);
  const initial = state.position;
  const velocity = {
    x: state.velocity.x + surfaceVelocity.x,
    y: state.velocity.y,
    z: state.velocity.z + surfaceVelocity.z,
  };
  const a = velocity.x ** 2 + velocity.z ** 2;
  const b = 2 * (initial.x * velocity.x + initial.z * velocity.z);
  const c = initial.x ** 2 + initial.z ** 2 - radius ** 2;
  if (a === 0 && velocity.y === 0) return null;
  const deckRoots = quadraticRoots(a, b, c);
  let first: EnclosureImpact | null = null;
  for (const root of deckRoots) {
    if (root < -TIME_EPSILON || root > duration + TIME_EPSILON) continue;
    const time = Math.max(0, Math.min(duration, root));
    const y = initial.y + velocity.y * time;
    if (Math.abs(y) > deckWidth + SURFACE_EPSILON) continue;
    // A launch from the deck aimed into the habitat must leave its own contact.
    if (time <= TIME_EPSILON && b < -SURFACE_EPSILON) continue;
    const position = stepFreeFlight(state, time, angularSpeed).position;
    first = { time, position, normal: floorNormal(position), kind: "floor" };
    break;
  }

  for (const shell of [{ height, outside: false }, { height: ENCLOSURE_HULL_DEPTH, outside: true }]) {
    const impact = traceEnclosureShell(state, velocity, first?.time ?? duration, radius, width, shell.height, shell.outside, angularSpeed);
    if (impact && (!first || impact.time < first.time - TIME_EPSILON)) first = impact;
  }
  return first;
}
