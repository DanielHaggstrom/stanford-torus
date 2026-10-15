import assert from "node:assert/strict";
import test from "node:test";
import { rotationVelocity } from "../src/physics.ts";
import {
  getTramState,
  TRAM_ANTISPINWARD_OFFSET_SECONDS,
  TRAM_DWELL_SECONDS,
  TRAM_LAP_SECONDS,
  TRAM_LEG_SECONDS,
  TRAM_STATION_ANGLE,
  TRAM_STATION_COUNT,
  TRAM_TRACK_RADIUS,
  TRAM_TRAVEL_SECONDS,
  TRAMS_PER_DIRECTION,
} from "../src/tram-motion.ts";
import type { TramDirection } from "../src/tram-motion.ts";

const TAU = Math.PI * 2;
const directions: TramDirection[] = ["spinward", "antispinward"];

function near(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} ≠ ${expected}`,
  );
}

function angleDistance(first: number, second: number): number {
  return Math.abs(
    Math.atan2(Math.sin(first - second), Math.cos(first - second)),
  );
}

function directionOffset(direction: TramDirection): number {
  return direction === "antispinward" ? TRAM_ANTISPINWARD_OFFSET_SECONDS : 0;
}

test("six stations receive three cars on each track, with an eight-second dwell", () => {
  assert.equal(TRAM_STATION_COUNT, 6);
  assert.equal(TRAMS_PER_DIRECTION, 3);
  assert.equal(TRAM_DWELL_SECONDS, 8);
  for (const direction of directions) {
    const sign = direction === "spinward" ? -1 : 1;
    for (let car = 0; car < TRAMS_PER_DIRECTION; car += 1) {
      for (let leg = 0; leg < TRAM_STATION_COUNT; leg += 1) {
        const time = leg * TRAM_LEG_SECONDS - directionOffset(direction);
        const station =
          (car * 2 + sign * leg + TRAM_STATION_COUNT) % TRAM_STATION_COUNT;
        for (const dwellTime of [0, 0.5, 4, TRAM_DWELL_SECONDS - 0.001]) {
          const state = getTramState(time + dwellTime, direction, car);
          assert.equal(state.stopped, true);
          assert.equal(state.stationIndex, station);
          assert.equal(
            state.nextStationIndex,
            (station + sign + TRAM_STATION_COUNT) % TRAM_STATION_COUNT,
          );
          near(state.angle, station * TRAM_STATION_ANGLE);
          near(state.speed, 0);
          near(state.secondsToDeparture, TRAM_DWELL_SECONDS - dwellTime);
          near(state.secondsToArrival, 0);
        }
      }
    }
  }
});

test("spinward velocity follows the habitat's +Y rotation, with the reverse on the other track", () => {
  for (const direction of directions) {
    const time =
      TRAM_DWELL_SECONDS + TRAM_TRAVEL_SECONDS / 2 - directionOffset(direction);
    const state = getTramState(time, direction);
    assert.equal(state.stopped, false);
    const position = {
      x: TRAM_TRACK_RADIUS * Math.cos(state.angle),
      y: 0,
      z: TRAM_TRACK_RADIUS * Math.sin(state.angle),
    };
    const velocity = {
      x: -position.z * state.angularVelocity,
      z: position.x * state.angularVelocity,
    };
    const rotation = rotationVelocity(position);
    const alignment = velocity.x * rotation.x + velocity.z * rotation.z;
    assert.ok(direction === "spinward" ? alignment > 0 : alignment < 0);
    assert.ok(state.speed >= 18 && state.speed < 20);
    near(
      state.speed,
      (TRAM_TRACK_RADIUS * TRAM_STATION_ANGLE * Math.PI) /
        (2 * TRAM_TRAVEL_SECONDS),
    );
    near(state.secondsToArrival, TRAM_TRAVEL_SECONDS / 2);
    near(state.secondsToDeparture, 0);
  }
});

test("each leg starts and ends continuously at rest at the correct platform", () => {
  const epsilon = 1e-5;
  for (const direction of directions) {
    const offset = directionOffset(direction);
    for (const boundary of [
      TRAM_DWELL_SECONDS,
      TRAM_LEG_SECONDS,
      TRAM_LAP_SECONDS,
    ]) {
      const before = getTramState(boundary - offset - epsilon, direction);
      const after = getTramState(boundary - offset + epsilon, direction);
      assert.ok(angleDistance(before.angle, after.angle) < 1e-10);
      assert.ok(before.speed < 0.0001 && after.speed < 0.0001);
    }
    const departure = getTramState(TRAM_DWELL_SECONDS - offset, direction);
    assert.equal(departure.stopped, false);
    near(departure.speed, 0);
    const arrival = getTramState(TRAM_LEG_SECONDS - offset, direction);
    assert.equal(arrival.stopped, true);
    near(
      arrival.angle,
      direction === "spinward" ? TAU - TRAM_STATION_ANGLE : TRAM_STATION_ANGLE,
    );
    near(arrival.secondsToDeparture, TRAM_DWELL_SECONDS);
  }
});

test("reported velocity matches the path derivative throughout travel", () => {
  const epsilon = 1e-4;
  for (const direction of directions) {
    for (const fraction of [0.05, 0.25, 0.5, 0.8, 0.99]) {
      const time =
        TRAM_DWELL_SECONDS +
        fraction * TRAM_TRAVEL_SECONDS -
        directionOffset(direction);
      const state = getTramState(time, direction);
      const before = getTramState(time - epsilon, direction).angle;
      const after = getTramState(time + epsilon, direction).angle;
      const measured =
        Math.atan2(Math.sin(after - before), Math.cos(after - before)) /
        (2 * epsilon);
      near(state.angularVelocity, measured, 1e-10);
      near(state.speed, Math.abs(measured) * TRAM_TRACK_RADIUS, 1e-7);
    }
  }
});

test("cars on a track stay exactly two stations apart, including across a time skip", () => {
  for (const direction of directions) {
    for (const time of [
      0,
      TRAM_DWELL_SECONDS - 1,
      TRAM_DWELL_SECONDS,
      TRAM_DWELL_SECONDS + TRAM_TRAVEL_SECONDS * 0.371,
      TRAM_LEG_SECONDS - 0.001,
      TRAM_LEG_SECONDS,
      TRAM_LEG_SECONDS * 2.775,
      TRAM_LAP_SECONDS - 0.1,
      TRAM_LAP_SECONDS,
      1e12 + 13.25,
    ]) {
      const states = Array.from({ length: TRAMS_PER_DIRECTION }, (_, car) =>
        getTramState(time, direction, car),
      );
      for (let car = 0; car < TRAMS_PER_DIRECTION; car += 1) {
        const next = states[(car + 1) % TRAMS_PER_DIRECTION]!;
        near(
          angleDistance(states[car]!.angle, next.angle),
          2 * TRAM_STATION_ANGLE,
        );
        near(states[car]!.speed, next.speed);
      }
    }
  }
});

test("timetable jumps use the shared clock and repeat exactly each lap", () => {
  for (const direction of directions) {
    for (const time of [0, 1, 37.25, 173.5, -59.125]) {
      const expected = getTramState(time, direction);
      assert.deepEqual(
        getTramState(time + TRAM_LAP_SECONDS, direction),
        expected,
      );
      assert.deepEqual(
        getTramState(time + TRAM_LAP_SECONDS * 1e9, direction),
        expected,
      );
    }
  }
  assert.equal(getTramState(0, "spinward").stopped, true);
  assert.equal(getTramState(0, "antispinward").stopped, false);
});

test("invalid time and car identifiers are rejected", () => {
  for (const time of [NaN, Infinity, -Infinity]) {
    assert.throws(() => getTramState(time, "spinward"), RangeError);
  }
  for (const car of [-1, 3, 1.5, NaN]) {
    assert.throws(() => getTramState(0, "spinward", car), RangeError);
  }
});
