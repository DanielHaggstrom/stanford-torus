import { ANGULAR_SPEED, rotateY } from "./physics.ts";
import type { Vec3 } from "./physics.ts";

/**
 * A deliberately small analytic sky model, in metres and SI seconds.
 *
 * The habitat follows a circular 2,000 km orbit, inclined 51.6° to the equator.
 * Its fixed spin axis is tilted 85° from the orbit normal (no LVLH yaw).
 * Earth starts 5° off the ring plane, then sweeps almost along the spin axis.
 * Equatorial inertial +Y is north; +X is the vernal equinox and -Z is east.
 * t=0 is a demonstration equinox, over Europe (45°N, 10°E). The Moon begins
 * 150° along its ecliptic-inclined circular orbit: sunlit and clear of Earth.
 * These are scenario phases, not a claim to reproduce today's ephemeris.
 *
 * Earth/Moon/Sun radii, Earth GM, and mean periods: NASA NSSDC fact sheets.
 * Circular orbits omit eccentricity, precession, perturbations and penumbra
 * shape. Finite solar angular size gives a short smooth eclipse transition.
 */
export const EARTH_RADIUS = 6_371_000;
export const EARTH_GM = 3.986004418e14;
export const ORBIT_ALTITUDE_KM = 2000;
export const ORBIT_INCLINATION_DEG = 51.6;
export const HABITAT_AXIS_TILT_DEG = 85;
export const HABITAT_OPENING_EARTH_LATITUDE_DEG = -5;
export const ORBIT_RADIUS = EARTH_RADIUS + ORBIT_ALTITUDE_KM * 1000;
export const ORBIT_PERIOD_SECONDS =
  2 * Math.PI * Math.sqrt(ORBIT_RADIUS ** 3 / EARTH_GM);
export const EARTH_SIDEREAL_DAY = 23.9345 * 3600;
export const EARTH_OBLIQUITY = (23.44 * Math.PI) / 180;
export const MOON_DISTANCE = 384_400_000;
export const MOON_RADIUS = 1_737_400;
export const MOON_PERIOD_SECONDS = 27.3217 * 86400;
export const MOON_INCLINATION = (5.145 * Math.PI) / 180;
export const SUN_DISTANCE = 149_598_000_000;
export const SUN_RADIUS = 695_700_000;
export const YEAR_SECONDS = 365.256 * 86400;

const TAU = Math.PI * 2;
const INCLINATION = (ORBIT_INCLINATION_DEG * Math.PI) / 180;
const AXIS_TILT = (HABITAT_AXIS_TILT_DEG * Math.PI) / 180;
const OPENING_EARTH_LATITUDE =
  (HABITAT_OPENING_EARTH_LATITUDE_DEG * Math.PI) / 180;
// In the orbital frame with +X along the opening radius, choose a fixed axis
// whose projection onto that radius gives Earth's requested opening latitude.
const SPIN_AXIS = {
  x: -Math.sin(OPENING_EARTH_LATITUDE),
  y: Math.cos(AXIS_TILT),
  z: Math.sqrt(Math.sin(AXIS_TILT) ** 2 - Math.sin(OPENING_EARTH_LATITUDE) ** 2),
};
// Project the opening radius into the ring plane. This makes Earth start
// toward renderer -X, with only the requested small lateral offset.
const RENDERER_X = unit({
  x: 1 - SPIN_AXIS.x ** 2,
  y: -SPIN_AXIS.x * SPIN_AXIS.y,
  z: -SPIN_AXIS.x * SPIN_AXIS.z,
});
const RENDERER_Z = cross(RENDERER_X, SPIN_AXIS);
// Choose a northern ascending-leg position, then rotate that plane so the
// opening habitat longitude is zero in equatorial inertial coordinates.
const START_ARGUMENT = Math.asin(Math.sin(Math.PI / 4) / Math.sin(INCLINATION));
const ASCENDING_NODE = -Math.atan2(
  Math.sin(START_ARGUMENT) * Math.cos(INCLINATION),
  Math.cos(START_ARGUMENT),
);
const EARTH_PRIME_AT_EPOCH = (-10 * Math.PI) / 180;
const MOON_ARGUMENT_AT_EPOCH = (150 * Math.PI) / 180;
export const ORBIT_START_PHASE = START_ARGUMENT / TAU;
export const ORBIT_ASCENDING_NODE_DEG = (ASCENDING_NODE * 180) / Math.PI;

/** Renderer coordinates retain the fixed habitat attitude in either frame. */
export type OrbitFrame = "habitat" | "inertial";

export interface OrbitState {
  /** Apparent body centres relative to the habitat, in the requested frame. */
  earthPosition: Vec3;
  moonPosition: Vec3;
  sunPosition: Vec3;
  /** Unit vector from the habitat toward the Sun, in the requested frame. */
  sunDirection: Vec3;
  earthNorthDirection: Vec3;
  earthPrimeDirection: Vec3;
  /** Sunlight at the Moon, for phases and possible Earth-shadow dimming. */
  moonSunDirection: Vec3;
  moonNorthDirection: Vec3;
  moonSunlight: number;
  sunlight: number;
  eclipsed: boolean;
  earthAngularRadius: number;
  moonAngularRadius: number;
  sunAngularRadius: number;
  orbitalPhase: number;
  orbitPeriodSeconds: number;
  altitudeKm: number;
}

export interface OrbitMapState {
  /** Absolute prograde angle / 2π, including the chosen opening phase. */
  orbitalPhase: number;
  /** Earth-centred directions projected onto the habitat's orbital plane. */
  sunAngle: number;
  moonAngle: number;
  moonOutOfPlane: number;
  orbitPeriodSeconds: number;
}

function rotateX(vector: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: vector.x,
    y: c * vector.y - s * vector.z,
    z: s * vector.y + c * vector.z,
  };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function length(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function unit(vector: Vec3): Vec3 {
  const inverse = 1 / length(vector);
  return {
    x: vector.x * inverse,
    y: vector.y * inverse,
    z: vector.z * inverse,
  };
}

function inertialToOrbitPlane(vector: Vec3): Vec3 {
  return rotateX(rotateY(vector, -ASCENDING_NODE), -INCLINATION);
}

/** Enter the renderer's fixed attitude; only the habitat frame undoes spin. */
export function inertialToSkyFrame(
  vector: Vec3,
  simSeconds: number,
  frame: OrbitFrame = "habitat",
): Vec3 {
  const orbital = rotateY(inertialToOrbitPlane(vector), -START_ARGUMENT);
  const fixed = {
    x: dot(orbital, RENDERER_X),
    y: dot(orbital, SPIN_AXIS),
    z: dot(orbital, RENDERER_Z),
  };
  return frame === "habitat"
    ? rotateY(fixed, -ANGULAR_SPEED * simSeconds)
    : fixed;
}

/** Enter the fixed attitude, then undo habitat spin for first-person views. */
export function inertialToHabitat(vector: Vec3, simSeconds: number): Vec3 {
  return inertialToSkyFrame(vector, simSeconds, "habitat");
}

function orbitalPhaseAt(simSeconds: number): number {
  return (
    (((ORBIT_START_PHASE + simSeconds / ORBIT_PERIOD_SECONDS) % 1) + 1) % 1
  );
}

export function habitatGeocentricPosition(simSeconds: number): Vec3 {
  const orbitAngle = TAU * orbitalPhaseAt(simSeconds);
  return rotateY(
    rotateX(
      {
        x: ORBIT_RADIUS * Math.cos(orbitAngle),
        y: 0,
        z: -ORBIT_RADIUS * Math.sin(orbitAngle),
      },
      INCLINATION,
    ),
    ASCENDING_NODE,
  );
}

function sunGeocentricPosition(simSeconds: number): Vec3 {
  const angle = (TAU * simSeconds) / YEAR_SECONDS;
  return rotateX(
    {
      x: SUN_DISTANCE * Math.cos(angle),
      y: 0,
      z: -SUN_DISTANCE * Math.sin(angle),
    },
    EARTH_OBLIQUITY,
  );
}

function moonGeocentricPosition(simSeconds: number): Vec3 {
  const angle =
    MOON_ARGUMENT_AT_EPOCH + (TAU * simSeconds) / MOON_PERIOD_SECONDS;
  return rotateX(
    rotateX(
      {
        x: MOON_DISTANCE * Math.cos(angle),
        y: 0,
        z: -MOON_DISTANCE * Math.sin(angle),
      },
      MOON_INCLINATION,
    ),
    EARTH_OBLIQUITY,
  );
}

export function getOrbitMapState(simSeconds: number): OrbitMapState {
  const sun = inertialToOrbitPlane(sunGeocentricPosition(simSeconds));
  const moon = inertialToOrbitPlane(moonGeocentricPosition(simSeconds));
  return {
    orbitalPhase: orbitalPhaseAt(simSeconds),
    sunAngle: Math.atan2(-sun.z, sun.x),
    moonAngle: Math.atan2(-moon.z, moon.x),
    moonOutOfPlane: Math.atan2(moon.y, Math.hypot(moon.x, moon.z)),
    orbitPeriodSeconds: ORBIT_PERIOD_SECONDS,
  };
}

/** Exact point-source sphere/ray eclipse test. Directions need not be unit. */
export function isInEarthShadow(
  geocentricPosition: Vec3,
  towardSun: Vec3,
): boolean {
  const direction = unit(towardSun);
  const along =
    geocentricPosition.x * direction.x +
    geocentricPosition.y * direction.y +
    geocentricPosition.z * direction.z;
  if (along >= 0) return false;
  const distanceSquared =
    geocentricPosition.x ** 2 +
    geocentricPosition.y ** 2 +
    geocentricPosition.z ** 2;
  return distanceSquared - along ** 2 < EARTH_RADIUS ** 2;
}

/** Approximate visible fraction during the Sun's finite-size limb crossing. */
export function solarVisibility(
  geocentricPosition: Vec3,
  sunPosition: Vec3,
): number {
  const toEarth = unit({
    x: -geocentricPosition.x,
    y: -geocentricPosition.y,
    z: -geocentricPosition.z,
  });
  const toSun = subtract(sunPosition, geocentricPosition);
  const sunDistance = length(toSun);
  const direction = unit(toSun);
  const separation = Math.acos(
    Math.max(
      -1,
      Math.min(
        1,
        toEarth.x * direction.x +
          toEarth.y * direction.y +
          toEarth.z * direction.z,
      ),
    ),
  );
  const earthAngle = Math.asin(EARTH_RADIUS / length(geocentricPosition));
  const sunAngle = Math.asin(SUN_RADIUS / sunDistance);
  const edge = Math.max(
    0,
    Math.min(1, (separation - earthAngle + sunAngle) / (2 * sunAngle)),
  );
  return edge * edge * (3 - 2 * edge);
}

export function getOrbitState(
  simSeconds: number,
  frame: OrbitFrame = "habitat",
): OrbitState {
  const orbitalPhase = orbitalPhaseAt(simSeconds);
  const habitat = habitatGeocentricPosition(simSeconds);
  const sun = sunGeocentricPosition(simSeconds);
  const moon = moonGeocentricPosition(simSeconds);
  const transform = (vector: Vec3) =>
    inertialToSkyFrame(vector, simSeconds, frame);
  const earthPosition = transform({
    x: -habitat.x,
    y: -habitat.y,
    z: -habitat.z,
  });
  const sunPosition = transform(subtract(sun, habitat));
  const moonPosition = transform(subtract(moon, habitat));
  const moonSunDirection = unit(transform(subtract(sun, moon)));
  const sunlight = solarVisibility(habitat, sun);
  return {
    earthPosition,
    moonPosition,
    sunPosition,
    sunDirection: unit(sunPosition),
    earthNorthDirection: transform({ x: 0, y: 1, z: 0 }),
    earthPrimeDirection: transform(
      rotateY(
        { x: 1, y: 0, z: 0 },
        EARTH_PRIME_AT_EPOCH + (TAU * simSeconds) / EARTH_SIDEREAL_DAY,
      ),
    ),
    moonSunDirection,
    moonNorthDirection: transform(
      rotateX({ x: 0, y: 1, z: 0 }, EARTH_OBLIQUITY + MOON_INCLINATION),
    ),
    moonSunlight: solarVisibility(moon, sun),
    sunlight,
    eclipsed: sunlight < 0.5,
    earthAngularRadius: Math.asin(EARTH_RADIUS / length(earthPosition)),
    moonAngularRadius: Math.asin(MOON_RADIUS / length(moonPosition)),
    sunAngularRadius: Math.asin(SUN_RADIUS / length(sunPosition)),
    orbitalPhase,
    orbitPeriodSeconds: ORBIT_PERIOD_SECONDS,
    altitudeKm: ORBIT_ALTITUDE_KM,
  };
}
