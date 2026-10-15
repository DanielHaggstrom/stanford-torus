import assert from "node:assert/strict";
import test from "node:test";
import {
  FLOOR_RADIUS,
  rotateY,
  type MotionState,
  type Vec3,
} from "../src/physics.ts";
import {
  getTramState,
  TRAM_TRACK_ACROSS,
  TRAM_LAP_SECONDS,
  type TramDirection,
} from "../src/tram-motion.ts";
import {
  carryTramRider,
  isOnTramRoof,
  PLAYER_RADIUS,
  resolveTramCollision,
  tramSurfaceVelocity,
  TRAM_LENGTH,
  TRAM_ROOF_HEIGHT,
  TRAM_WIDTH,
  type TramSupport,
} from "../src/tram-physics.ts";

const ROOF_RADIUS = FLOOR_RADIUS - TRAM_ROOF_HEIGHT;
const directions: TramDirection[] = ["spinward", "antispinward"];

function near(actual: number, expected: number, tolerance = 1e-9): void {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${actual} ≠ ${expected}`,
  );
}

function nearVector(actual: Vec3, expected: Vec3, tolerance = 1e-9): void {
  near(actual.x, expected.x, tolerance);
  near(actual.y, expected.y, tolerance);
  near(actual.z, expected.z, tolerance);
}

function positionOnCar(
  support: TramSupport,
  time: number,
  { along = 0, across = 0, height = TRAM_ROOF_HEIGHT } = {},
): Vec3 {
  const angle =
    getTramState(time, support.direction, support.carIndex).angle +
    along / ROOF_RADIUS;
  const radius = FLOOR_RADIUS - height;
  return {
    x: Math.cos(angle) * radius,
    y: (support.direction === "spinward" ? 1 : -1) * TRAM_TRACK_ACROSS + across,
    z: Math.sin(angle) * radius,
  };
}

function descendingState(position: Vec3, speed = 3): MotionState {
  const radius = Math.hypot(position.x, position.z);
  return {
    position,
    velocity: {
      x: (position.x / radius) * speed,
      y: 0.2,
      z: (position.z / radius) * speed,
    },
  };
}

test("roof velocity follows each timetable, including stopped cars", () => {
  for (const direction of directions) {
    const support: TramSupport = { direction, carIndex: 1 };
    for (const time of [2, 12, 24, 39.9, 49]) {
      const position = positionOnCar(support, time);
      const velocity = tramSurfaceVelocity(position, support, time);
      const epsilon = 1e-4;
      const before = positionOnCar(support, time - epsilon);
      const after = positionOnCar(support, time + epsilon);
      nearVector(
        velocity,
        {
          x: (after.x - before.x) / (2 * epsilon),
          y: 0,
          z: (after.z - before.z) / (2 * epsilon),
        },
        1e-7,
      );
      near(position.x * velocity.x + position.z * velocity.z, 0, 1e-9);
      if (getTramState(time, direction, 1).stopped) {
        nearVector(velocity, { x: 0, y: 0, z: 0 });
      }
    }
  }
});

test("exact carrying keeps a rider on a curved roof through stops and wraparound", () => {
  for (const direction of directions) {
    const support: TramSupport = { direction, carIndex: 0 };
    for (const [from, to] of [
      [2, 15],
      [36, 43],
      [239, 242],
      [0, 240],
      [13, 3613],
    ]) {
      const position = positionOnCar(support, from!, {
        along: 2.1,
        across: 0.4,
      });
      const state = {
        position,
        velocity: tramSurfaceVelocity(position, support, from!),
      };
      const before = structuredClone(state);
      const carried = carryTramRider(state, support, from!, to!);
      nearVector(
        carried.position,
        positionOnCar(support, to!, { along: 2.1, across: 0.4 }),
        1e-8,
      );
      nearVector(
        carried.velocity,
        tramSurfaceVelocity(carried.position, support, to!),
      );
      assert.ok(isOnTramRoof(carried.position, support, to!));
      assert.deepEqual(
        state,
        before,
        "carrying does not mutate the input state",
      );
    }
  }
});

test("carrying preserves walking velocity relative to the car", () => {
  const support: TramSupport = { direction: "spinward", carIndex: 2 };
  const from = 5;
  const to = 29;
  const position = positionOnCar(support, from, { along: -1 });
  const surface = tramSurfaceVelocity(position, support, from);
  const walking = { x: 0.2, y: -1.1, z: 2.3 };
  const state = {
    position,
    velocity: {
      x: surface.x + walking.x,
      y: walking.y,
      z: surface.z + walking.z,
    },
  };
  const carried = carryTramRider(state, support, from, to);
  const expectedWalking = rotateY(
    walking,
    getTramState(from, "spinward", 2).angle -
      getTramState(to, "spinward", 2).angle,
  );
  const nextSurface = tramSurfaceVelocity(carried.position, support, to);
  nearVector(carried.velocity, {
    x: expectedWalking.x + nextSurface.x,
    y: expectedWalking.y,
    z: expectedWalking.z + nextSurface.z,
  });
  const halfway = carryTramRider(state, support, from, 18);
  const twoSteps = carryTramRider(halfway, support, 18, to);
  nearVector(twoSteps.position, carried.position);
  nearVector(twoSteps.velocity, carried.velocity);
});

test("descending feet land on stopped and moving roofs with tangential momentum intact", () => {
  for (const direction of directions) {
    for (const time of [2, 24]) {
      const support: TramSupport = { direction, carIndex: 0 };
      const previous = descendingState(
        positionOnCar(support, time - 1 / 120, { height: 2.83 }),
      );
      const current = descendingState(
        positionOnCar(support, time, { height: 2.78 }),
      );
      const surface = tramSurfaceVelocity(current.position, support, time);
      current.velocity.x += surface.x;
      current.velocity.z += surface.z;
      const collision = resolveTramCollision(
        previous,
        current,
        time - 1 / 120,
        time,
        null,
      );
      assert.deepEqual(collision.support, support);
      assert.equal(collision.pushed, false);
      near(
        Math.hypot(collision.state.position.x, collision.state.position.z),
        ROOF_RADIUS,
      );
      nearVector(collision.state.velocity, { ...surface, y: 0.2 });
    }
  }
});

test("roof support allows walking and releases at the side or end", () => {
  const support: TramSupport = { direction: "spinward", carIndex: 0 };
  const time = 3;
  const previous = descendingState(positionOnCar(support, time));
  const walking = descendingState(
    positionOnCar(support, time, { along: 2, across: 0.6, height: 2.79 }),
  );
  const supported = resolveTramCollision(
    previous,
    walking,
    time,
    time,
    support,
  );
  assert.deepEqual(supported.support, support);
  near(
    Math.hypot(supported.state.position.x, supported.state.position.z),
    ROOF_RADIUS,
  );
  for (const offset of [
    { along: TRAM_LENGTH / 2 + 0.2 },
    { across: TRAM_WIDTH / 2 + 0.2 },
  ]) {
    const offRoof = descendingState(positionOnCar(support, time, offset));
    assert.equal(isOnTramRoof(offRoof.position, support, time), false);
    const released = resolveTramCollision(
      previous,
      offRoof,
      time,
      time,
      support,
    );
    assert.equal(released.support, null);
    assert.equal(released.pushed, false);
  }
});

test("a jump retains its velocity and cannot be pulled back onto a roof", () => {
  for (const direction of directions) {
    const support: TramSupport = { direction, carIndex: 0 };
    const time = 23;
    const previous = descendingState(positionOnCar(support, time));
    const current = descendingState(
      positionOnCar(support, time, { height: 2.85 }),
      -8,
    );
    const collision = resolveTramCollision(
      previous,
      current,
      time - 1 / 120,
      time,
      support,
    );
    assert.equal(collision.support, null);
    assert.equal(collision.pushed, false);
    assert.equal(collision.state, current);
  }
});

test("front impacts push players to the nearest side on either track", () => {
  for (const direction of directions) {
    const support: TramSupport = { direction, carIndex: 0 };
    const time = 24;
    for (const across of [-0.5, 0, 0.5]) {
      const previous = descendingState(
        positionOnCar(support, time - 1 / 120, {
          along: 4.5,
          across,
          height: 0,
        }),
      );
      const current = descendingState(
        positionOnCar(support, time, { along: 4.2, across, height: 0 }),
      );
      const collision = resolveTramCollision(
        previous,
        current,
        time - 1 / 120,
        time,
        null,
      );
      assert.equal(collision.pushed, true);
      assert.equal(collision.support, null);
      const trackY = (direction === "spinward" ? 1 : -1) * TRAM_TRACK_ACROSS;
      const side = across === 0 ? -Math.sign(trackY) : Math.sign(across);
      near(
        collision.state.position.y - trackY,
        side * (TRAM_WIDTH / 2 + PLAYER_RADIUS + 0.1),
      );
      near(collision.state.velocity.y, side * 3.5);
      near(
        Math.hypot(collision.state.position.x, collision.state.position.z),
        FLOOR_RADIUS,
      );
    }
  }
});

test("a swept side impact cannot tunnel through a car", () => {
  const support: TramSupport = { direction: "spinward", carIndex: 0 };
  const time = 3;
  const previous = descendingState(
    positionOnCar(support, time, { across: -2, height: 1 }),
  );
  const current = descendingState(
    positionOnCar(support, time, { across: 2, height: 1 }),
  );
  const collision = resolveTramCollision(previous, current, time, time, null);
  assert.equal(collision.pushed, true);
  assert.ok(collision.state.position.y > TRAM_TRACK_ACROSS + TRAM_WIDTH / 2);
  assert.ok(collision.state.velocity.y > 0);
});

test("only body overlap causes a shove, without grounding people above or away from a car", () => {
  const support: TramSupport = { direction: "spinward", carIndex: 0 };
  const time = 3;
  for (const offset of [
    { height: 3.1 },
    { across: 3, height: 0 },
    { along: 10, height: 0 },
  ]) {
    const state = descendingState(positionOnCar(support, time, offset), -1);
    const collision = resolveTramCollision(state, state, time, time, null);
    assert.equal(collision.pushed, false);
    assert.equal(collision.support, null);
    assert.equal(collision.state, state);
  }
  // Feet below the chassis but a head inside it still count as a body impact.
  const low = descendingState(positionOnCar(support, time, { height: -0.5 }));
  assert.equal(resolveTramCollision(low, low, time, time, null).pushed, true);
  const below = descendingState(positionOnCar(support, time, { height: -2 }));
  assert.equal(
    resolveTramCollision(below, below, time, time, null).pushed,
    false,
  );
});

test("the opposite side of a track does not collide at the angular wrap seam", () => {
  const support: TramSupport = { direction: "spinward", carIndex: 0 };
  const time = 24;
  const tramAngle = getTramState(time, "spinward").angle;
  const radius = FLOOR_RADIUS;
  const position = {
    x: Math.cos(tramAngle + Math.PI) * radius,
    y: TRAM_TRACK_ACROSS,
    z: Math.sin(tramAngle + Math.PI) * radius,
  };
  const state = { position, velocity: { x: 0, y: 0, z: 0 } };
  const collision = resolveTramCollision(
    state,
    state,
    time - 0.01,
    time + 0.01,
    null,
  );
  assert.equal(collision.pushed, false);
  assert.equal(collision.support, null);
});
