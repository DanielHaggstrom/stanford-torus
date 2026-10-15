import assert from "node:assert/strict";
import test from "node:test";
import {
  FLOOR_RADIUS,
  rotateY,
  stepFreeFlight,
  type MotionState,
  type Vec3,
} from "../src/physics.ts";
import {
  getTramState,
  TRAM_TRACK_ACROSS,
  TRAM_LAP_SECONDS,
  TRAM_LEG_SECONDS,
  TRAM_DWELL_SECONDS,
  TRAM_TRAVEL_SECONDS,
  TRAM_STATION_ANGLE,
  TRAM_STATION_COUNT,
  TRAM_ANTISPINWARD_OFFSET_SECONDS,
  type TramDirection,
} from "../src/tram-motion.ts";
import {
  carryTramRider,
  isOnTramDeck,
  PLAYER_RADIUS,
  resolveTramCollision,
  stationSupportHeight,
  walkingSupportHeight,
  tramSurfaceVelocity,
  TRAM_LENGTH,
  TRAM_DECK_HEIGHT,
  TRAM_WIDTH,
  TRAM_PLATFORM_HEIGHT,
  TRAM_PLATFORM_ACROSS,
  TRAM_PLATFORM_WIDTH,
  TRAM_PLATFORM_LENGTH,
  type TramSupport,
} from "../src/tram-physics.ts";

const DECK_RADIUS = FLOOR_RADIUS - TRAM_DECK_HEIGHT;
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

function atAngle(angle: number, across: number, height = 0): Vec3 {
  return {
    x: Math.cos(angle) * (FLOOR_RADIUS - height),
    y: across,
    z: Math.sin(angle) * (FLOOR_RADIUS - height),
  };
}

function onCar(
  support: TramSupport,
  time: number,
  { along = 0, across = 0, height = TRAM_DECK_HEIGHT } = {},
): Vec3 {
  const angle =
    getTramState(time, support.direction, support.carIndex).angle +
    along / DECK_RADIUS;
  return atAngle(
    angle,
    (support.direction === "spinward" ? 1 : -1) * TRAM_TRACK_ACROSS + across,
    height,
  );
}

function verticalState(position: Vec3, down = 0): MotionState {
  const radius = Math.hypot(position.x, position.z);
  return {
    position,
    velocity: {
      x: (position.x / radius) * down,
      y: 0,
      z: (position.z / radius) * down,
    },
  };
}

function stoppedTime(direction: TramDirection): number {
  return direction === "spinward"
    ? 2
    : TRAM_LEG_SECONDS - TRAM_ANTISPINWARD_OFFSET_SECONDS + 2;
}

function movingTime(direction: TramDirection): number {
  return (
    TRAM_DWELL_SECONDS +
    TRAM_TRAVEL_SECONDS / 2 -
    (direction === "antispinward" ? TRAM_ANTISPINWARD_OFFSET_SECONDS : 0)
  );
}

test("six station platforms and linear ramps line up on both promenade sides", () => {
  for (let station = 0; station < TRAM_STATION_COUNT; station++) {
    for (const side of [-1, 1]) {
      const angle = station * TRAM_STATION_ANGLE;
      near(
        stationSupportHeight(atAngle(angle, side * TRAM_PLATFORM_ACROSS)),
        TRAM_PLATFORM_HEIGHT,
      );
      near(stationSupportHeight(atAngle(angle, side * 3.4)), 0);
      near(
        stationSupportHeight(atAngle(angle, side * 4.45)),
        TRAM_PLATFORM_HEIGHT / 2,
      );
      near(
        stationSupportHeight(atAngle(angle, side * 5.5)),
        TRAM_PLATFORM_HEIGHT,
      );
      near(
        stationSupportHeight(atAngle(angle + 1.5 / FLOOR_RADIUS, side * 4.45)),
        TRAM_PLATFORM_HEIGHT / 2,
      );
      near(
        stationSupportHeight(atAngle(angle + 1.6 / FLOOR_RADIUS, side * 4.45)),
        0,
      );
      near(
        stationSupportHeight(
          atAngle(
            angle + (TRAM_PLATFORM_LENGTH / 2 + 0.1) / FLOOR_RADIUS,
            side * TRAM_PLATFORM_ACROSS,
          ),
        ),
        0,
      );
      near(stationSupportHeight(atAngle(angle, side * 2)), 0);
      near(stationSupportHeight(atAngle(angle, side * 8.1)), 0);
    }
  }
  near(
    stationSupportHeight(atAngle(2 * Math.PI - 0.001, 4.45)),
    TRAM_PLATFORM_HEIGHT / 2,
  );
});

test("a grounded walk can go from promenade through ramp and platform into a cart without jumping", () => {
  for (const side of [-1, 1]) {
    const direction: TramDirection = side === 1 ? "spinward" : "antispinward";
    const time = stoppedTime(direction);
    const car: TramSupport = { direction, carIndex: 0 };
    const angle = getTramState(time, direction).angle;
    let previous = verticalState(atAngle(angle, 0));
    let support: TramSupport | null = null;
    for (let index = 1; index <= 108; index++) {
      const across = (side * index * 10) / 120;
      const point = atAngle(angle, across);
      const terrainHeight = support
        ? TRAM_DECK_HEIGHT
        : walkingSupportHeight(point, previous.position, time);
      const current = verticalState(atAngle(angle, across, terrainHeight));
      current.velocity.y = side * 10;
      const contact = resolveTramCollision(
        previous,
        current,
        time,
        time,
        support,
      );
      assert.equal(contact.grounded, true, `grounded at y=${across}`);
      assert.equal(contact.pushed, false);
      support = contact.support;
      previous = contact.state;
    }
    assert.deepEqual(support, car);
    assert.ok(isOnTramDeck(previous.position, car, time));
  }
});

test("station and ramp landings stop descent while preserving lateral momentum", () => {
  for (const across of [4.45, TRAM_PLATFORM_ACROSS, 0]) {
    const target = stationSupportHeight(atAngle(0, across));
    const previous = verticalState(atAngle(0, across, target + 0.08), 3);
    const current = verticalState(atAngle(0, across, target - 0.02), 3);
    current.velocity.y = 1.5;
    const contact = resolveTramCollision(
      previous,
      current,
      1,
      1 + 1 / 120,
      null,
    );
    assert.equal(contact.grounded, true);
    assert.equal(contact.support, null);
    near(
      FLOOR_RADIUS -
        Math.hypot(contact.state.position.x, contact.state.position.z),
      target,
    );
    nearVector(contact.state.velocity, { x: 0, y: 1.5, z: 0 });
  }
});

test("boarding support bridges from a platform but never lifts a floor-level player under a cart", () => {
  for (const direction of directions) {
    const support: TramSupport = { direction, carIndex: 0 };
    const time = stoppedTime(direction);
    const point = onCar(support, time, { across: 0, height: 0 });
    near(walkingSupportHeight(point, point, time), 0);
    near(
      walkingSupportHeight(
        point,
        onCar(support, time, { height: TRAM_PLATFORM_HEIGHT }),
        time,
      ),
      TRAM_DECK_HEIGHT,
    );
    near(
      walkingSupportHeight(point, onCar(support, time, { height: 0.4 }), time),
      0,
    );
  }
});

test("deck velocity follows the faster timetable and is zero at a stop", () => {
  for (const direction of directions) {
    const support: TramSupport = { direction, carIndex: 1 };
    const stopped = stoppedTime(direction);
    nearVector(tramSurfaceVelocity(onCar(support, stopped), support, stopped), {
      x: 0,
      y: 0,
      z: 0,
    });
    const time = movingTime(direction);
    const velocity = tramSurfaceVelocity(onCar(support, time), support, time);
    assert.ok(Math.hypot(velocity.x, velocity.z) > 18);
    const epsilon = 1e-4;
    const before = onCar(support, time - epsilon);
    const after = onCar(support, time + epsilon);
    nearVector(
      velocity,
      {
        x: (after.x - before.x) / (2 * epsilon),
        y: 0,
        z: (after.z - before.z) / (2 * epsilon),
      },
      1e-7,
    );
  }
});

test("exact carrying preserves car-relative position and walking through curves, stops, and wraps", () => {
  for (const direction of directions) {
    const support: TramSupport = { direction, carIndex: 0 };
    for (const [from, to] of [
      [2, 15],
      [TRAM_LEG_SECONDS - 0.1, TRAM_LEG_SECONDS + 1],
      [TRAM_LAP_SECONDS - 0.5, TRAM_LAP_SECONDS + 2],
      [13, 13 + TRAM_LAP_SECONDS * 15],
    ]) {
      const position = onCar(support, from!, { along: 2.1, across: 0.4 });
      const surface = tramSurfaceVelocity(position, support, from!);
      const walking = { x: 0.2, y: -1.1, z: 2.3 };
      const state = {
        position,
        velocity: {
          x: surface.x + walking.x,
          y: walking.y,
          z: surface.z + walking.z,
        },
      };
      const snapshot = structuredClone(state);
      const carried = carryTramRider(state, support, from!, to!);
      nearVector(
        carried.position,
        onCar(support, to!, { along: 2.1, across: 0.4 }),
        1e-8,
      );
      const newSurface = tramSurfaceVelocity(carried.position, support, to!);
      const relative = rotateY(
        walking,
        getTramState(from!, direction).angle -
          getTramState(to!, direction).angle,
      );
      nearVector(carried.velocity, {
        x: relative.x + newSurface.x,
        y: relative.y,
        z: relative.z + newSurface.z,
      });
      assert.ok(isOnTramDeck(carried.position, support, to!));
      assert.deepEqual(state, snapshot);
    }
  }
});

test("descending feet land on moving and stopped decks", () => {
  for (const direction of directions) {
    const support: TramSupport = { direction, carIndex: 0 };
    for (const time of [stoppedTime(direction), movingTime(direction)]) {
      const previous = verticalState(
        onCar(support, time - 1 / 120, { height: TRAM_DECK_HEIGHT + 0.04 }),
        3,
      );
      const current = verticalState(
        onCar(support, time, { height: TRAM_DECK_HEIGHT - 0.02 }),
        3,
      );
      const surface = tramSurfaceVelocity(current.position, support, time);
      current.velocity.x += surface.x;
      current.velocity.z += surface.z;
      const contact = resolveTramCollision(
        previous,
        current,
        time - 1 / 120,
        time,
        null,
      );
      assert.deepEqual(contact.support, support);
      assert.equal(contact.grounded, true);
      assert.equal(contact.pushed, false);
      nearVector(contact.state.velocity, surface);
      near(
        Math.hypot(contact.state.position.x, contact.state.position.z),
        DECK_RADIUS,
      );
    }
  }
});

test("walking from a stopped deck onto its platform releases the cart without falling", () => {
  const support: TramSupport = { direction: "spinward", carIndex: 0 };
  const time = 2;
  const previous = verticalState(onCar(support, time));
  const current = verticalState(
    atAngle(0, TRAM_PLATFORM_ACROSS, TRAM_PLATFORM_HEIGHT),
  );
  current.velocity.y = -2;
  const contact = resolveTramCollision(previous, current, time, time, support);
  assert.equal(contact.support, null);
  assert.equal(contact.grounded, true);
  assert.equal(contact.pushed, false);
  nearVector(contact.state.position, current.position);
});

test("walking off an unsupported deck edge releases support and falls without a sideways teleport", () => {
  const support: TramSupport = { direction: "spinward", carIndex: 0 };
  const time = movingTime("spinward");
  const previous = verticalState(onCar(support, time));
  for (const offset of [
    { along: TRAM_LENGTH / 2 + 0.2 },
    { across: TRAM_WIDTH / 2 + 0.2 },
  ]) {
    const current = verticalState(onCar(support, time, offset));
    const contact = resolveTramCollision(
      previous,
      current,
      time,
      time,
      support,
    );
    assert.equal(contact.support, null);
    assert.equal(contact.grounded, false);
    assert.equal(contact.pushed, false);
    assert.equal(contact.state, current);
  }
});

test("jumping from a deck or station cannot get pulled back onto the surface", () => {
  const support: TramSupport = { direction: "spinward", carIndex: 0 };
  for (const across of [TRAM_TRACK_ACROSS, TRAM_PLATFORM_ACROSS]) {
    const previous = verticalState(atAngle(0, across, TRAM_DECK_HEIGHT));
    const current = verticalState(
      atAngle(0, across, TRAM_DECK_HEIGHT + 0.04),
      -8,
    );
    const contact = resolveTramCollision(
      previous,
      current,
      2,
      2 + 1 / 120,
      support,
    );
    assert.equal(contact.support, null);
    assert.equal(contact.grounded, false);
    assert.equal(contact.pushed, false);
    assert.equal(contact.state, current);
  }
});

test("a jump from the promenade can land on the open cart deck", () => {
  const support: TramSupport = { direction: "spinward", carIndex: 0 };
  let state: MotionState = {
    position: onCar(support, 1, { across: -1.8, height: 0 }),
    velocity: { x: -4, y: 2, z: 0 },
  };
  let landed = false;
  const step = 1 / 120;
  for (let index = 0; index < 180 && !landed; index++) {
    const from = 1 + index * step;
    const current = stepFreeFlight(state, step);
    const contact = resolveTramCollision(
      state,
      current,
      from,
      from + step,
      null,
    );
    state = contact.state;
    landed = contact.support !== null;
  }
  assert.ok(landed);
});

test("players below moving carts are pushed clear on both tracks", () => {
  for (const direction of directions) {
    const support: TramSupport = { direction, carIndex: 0 };
    const time = movingTime(direction);
    for (const across of [-0.5, 0, 0.5]) {
      const previous = verticalState(
        onCar(support, time - 1 / 120, { along: 4.5, across, height: 0 }),
      );
      const current = verticalState(
        onCar(support, time, { along: 4.2, across, height: 0 }),
      );
      const contact = resolveTramCollision(
        previous,
        current,
        time - 1 / 120,
        time,
        null,
      );
      const track =
        direction === "spinward" ? TRAM_TRACK_ACROSS : -TRAM_TRACK_ACROSS;
      const side = across === 0 ? -Math.sign(track) : Math.sign(across);
      assert.equal(contact.pushed, true);
      assert.equal(contact.grounded, true);
      assert.equal(contact.support, null);
      near(
        contact.state.position.y - track,
        side * (TRAM_WIDTH / 2 + PLAYER_RADIUS + 0.1),
      );
      near(contact.state.velocity.y, side * 3.5);
    }
  }
});

test("open carts do not block a walker at platform height or a body above the deck", () => {
  const support: TramSupport = { direction: "spinward", carIndex: 0 };
  for (const height of [TRAM_DECK_HEIGHT, 1.5, 3]) {
    const state = verticalState(onCar(support, 2, { height }));
    const contact = resolveTramCollision(state, state, 2, 2, null);
    assert.equal(contact.pushed, false);
    assert.equal(contact.grounded, height === TRAM_DECK_HEIGHT);
  }
});

test("a swept under-deck side impact cannot tunnel through a cart", () => {
  const support: TramSupport = { direction: "spinward", carIndex: 0 };
  const previous = verticalState(onCar(support, 2, { across: -2, height: 0 }));
  const current = verticalState(onCar(support, 2, { across: 2, height: 0 }));
  const contact = resolveTramCollision(previous, current, 2, 2, null);
  assert.equal(contact.pushed, true);
  assert.ok(contact.state.position.y > TRAM_TRACK_ACROSS + TRAM_WIDTH / 2);
});

test("the opposite side of a track does not collide at the angular wrap seam", () => {
  const time = movingTime("spinward");
  const angle = getTramState(time, "spinward").angle + Math.PI;
  const state = verticalState(atAngle(angle, TRAM_TRACK_ACROSS));
  const contact = resolveTramCollision(
    state,
    state,
    time - 0.01,
    time + 0.01,
    null,
  );
  assert.equal(contact.pushed, false);
  assert.equal(contact.support, null);
});
