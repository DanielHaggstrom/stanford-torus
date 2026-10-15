import { ANGULAR_SPEED, rotateY } from "./physics.ts";
import type { Vec3 } from "./physics.ts";

/**
 * A deliberately small analytic sky model, in metres and SI seconds.
 *
 * The habitat follows a circular 2,000 km orbit, inclined 28.5° to the equator.
 * Its fixed spin axis is tilted 18° from the orbit normal (no LVLH yaw).
 * Equatorial inertial +Y is north; +X is the vernal equinox and -Z is east.
 * t=0 is a demonstration equinox, with the habitat at the ascending node,
 * Greenwich facing +X, and the Moon 125° along its inclined circular orbit.
 * These are scenario phases, not a claim to reproduce today's ephemeris.
 *
 * Earth/Moon/Sun radii, Earth GM, and mean periods: NASA NSSDC fact sheets.
 * Circular orbits omit eccentricity, precession, perturbations and penumbra
 * shape. Finite solar angular size gives a short smooth eclipse transition.
 */
export const EARTH_RADIUS = 6_371_000;
export const EARTH_GM = 3.986004418e14;
export const ORBIT_ALTITUDE_KM = 2000;
export const ORBIT_INCLINATION_DEG = 28.5;
export const HABITAT_AXIS_TILT_DEG = 18;
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

export interface OrbitState {
  /** Apparent body centres relative to the habitat, in the rotating frame. */
  earthPosition: Vec3;
  moonPosition: Vec3;
  sunPosition: Vec3;
  /** Unit vector from the habitat toward the Sun, in the rotating frame. */
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

function rotateX(vector: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: vector.x,
    y: c * vector.y - s * vector.z,
    z: s * vector.y + c * vector.z,
  };
}

function rotateZ(vector: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: c * vector.x - s * vector.y,
    y: s * vector.x + c * vector.y,
    z: vector.z,
  };
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

/** Enter the orbital plane, apply the fixed axis tilt, then undo habitat spin. */
export function inertialToHabitat(vector: Vec3, simSeconds: number): Vec3 {
  return rotateY(
    rotateZ(rotateX(vector, -INCLINATION), AXIS_TILT),
    -ANGULAR_SPEED * simSeconds,
  );
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

export function getOrbitState(simSeconds: number): OrbitState {
  const orbitalPhase = (((simSeconds / ORBIT_PERIOD_SECONDS) % 1) + 1) % 1;
  const orbitAngle = orbitalPhase * TAU;
  const habitat = rotateX(
    {
      x: ORBIT_RADIUS * Math.cos(orbitAngle),
      y: 0,
      z: -ORBIT_RADIUS * Math.sin(orbitAngle),
    },
    INCLINATION,
  );
  const sunAngle = (TAU * simSeconds) / YEAR_SECONDS;
  const sun = rotateX(
    {
      x: SUN_DISTANCE * Math.cos(sunAngle),
      y: 0,
      z: -SUN_DISTANCE * Math.sin(sunAngle),
    },
    EARTH_OBLIQUITY,
  );
  const moonAngle =
    (125 * Math.PI) / 180 + (TAU * simSeconds) / MOON_PERIOD_SECONDS;
  const moon = rotateX(
    rotateX(
      {
        x: MOON_DISTANCE * Math.cos(moonAngle),
        y: 0,
        z: -MOON_DISTANCE * Math.sin(moonAngle),
      },
      MOON_INCLINATION,
    ),
    EARTH_OBLIQUITY,
  );
  const earthPosition = inertialToHabitat(
    { x: -habitat.x, y: -habitat.y, z: -habitat.z },
    simSeconds,
  );
  const sunPosition = inertialToHabitat(subtract(sun, habitat), simSeconds);
  const moonPosition = inertialToHabitat(subtract(moon, habitat), simSeconds);
  const moonSunDirection = unit(
    inertialToHabitat(subtract(sun, moon), simSeconds),
  );
  const sunlight = solarVisibility(habitat, sun);
  return {
    earthPosition,
    moonPosition,
    sunPosition,
    sunDirection: unit(sunPosition),
    earthNorthDirection: inertialToHabitat({ x: 0, y: 1, z: 0 }, simSeconds),
    earthPrimeDirection: inertialToHabitat(
      rotateY({ x: 1, y: 0, z: 0 }, (TAU * simSeconds) / EARTH_SIDEREAL_DAY),
      simSeconds,
    ),
    moonSunDirection,
    moonNorthDirection: inertialToHabitat(
      rotateX({ x: 0, y: 1, z: 0 }, EARTH_OBLIQUITY + MOON_INCLINATION),
      simSeconds,
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
