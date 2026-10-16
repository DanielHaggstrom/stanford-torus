import * as THREE from "three";
import { FLOOR_RADIUS } from "./physics.ts";
import {
  getTramState,
  TRAM_STATION_COUNT,
  TRAM_TRACK_ACROSS,
  TRAM_TRACK_RADIUS,
  TRAMS_PER_DIRECTION,
} from "./tram-motion.ts";
import {
  TRAM_LENGTH,
  TRAM_WIDTH,
  TRAM_DECK_HEIGHT,
  TRAM_PLATFORM_HEIGHT,
  TRAM_PLATFORM_ACROSS,
  TRAM_PLATFORM_WIDTH,
  TRAM_PLATFORM_LENGTH,
} from "./tram-physics.ts";

type Station = { name: string; angle: number; color: string };
type Direction = "spinward" | "antispinward";

const TAU = Math.PI * 2;
const WHITE = "#dce6db";
const DARK = "#304b4b";
const MINT = "#90bbaa";
const AMBER = "#c5af86";
const SEGMENTS = [
  [1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 0, 0, 0, 0],
  [1, 1, 0, 1, 1, 0, 1],
  [1, 1, 1, 1, 0, 0, 1],
  [0, 1, 1, 0, 0, 1, 1],
  [1, 0, 1, 1, 0, 1, 1],
  [1, 0, 1, 1, 1, 1, 1],
] as const;

/** Packs small procedural parts into one draw call, keeping their flat normals. */
class Parts {
  private positions: number[] = [];
  private normals: number[] = [];
  private colors: number[] = [];

  add(geometry: THREE.BufferGeometry, transform: THREE.Matrix4, color: string) {
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const index = geometry.getIndex();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
    const point = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const tint = new THREE.Color(color);
    const count = index?.count ?? positions.count;
    for (let i = 0; i < count; i++) {
      const vertex = index ? index.getX(i) : i;
      point.fromBufferAttribute(positions, vertex).applyMatrix4(transform);
      normal
        .fromBufferAttribute(normals, vertex)
        .applyMatrix3(normalMatrix)
        .normalize();
      this.positions.push(point.x, point.y, point.z);
      this.normals.push(normal.x, normal.y, normal.z);
      this.colors.push(tint.r, tint.g, tint.b);
    }
  }

  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.positions, 3),
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(this.normals, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(this.colors, 3),
    );
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function placement(angle: number, across: number, height: number, forward = 1) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new THREE.Matrix4()
    .makeBasis(
      new THREE.Vector3(-s * forward, 0, c * forward),
      new THREE.Vector3(-c, 0, -s),
      new THREE.Vector3(0, -forward, 0),
    )
    .setPosition(
      (FLOOR_RADIUS - height) * c,
      across,
      (FLOOR_RADIUS - height) * s,
    );
}

function localBox(
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
) {
  return new THREE.Matrix4()
    .makeScale(width, height, depth)
    .setPosition(x, y, z);
}

/** Circular inward-facing strip, generated without image textures. */
function strip(
  radius: number,
  centerAcross: number,
  width: number,
  start = 0,
  arc = TAU,
) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const segments = Math.max(4, Math.ceil((512 * arc) / TAU));
  for (let i = 0; i <= segments; i++) {
    const angle = start + (arc * i) / segments;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    positions.push(
      radius * c,
      centerAcross - width / 2,
      radius * s,
      radius * c,
      centerAcross + width / 2,
      radius * s,
    );
    normals.push(-c, 0, -s, -c, 0, -s);
    if (i < segments) {
      const j = 2 * i;
      indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/** A curved station ramp, with the same linear height profile as foot collisions. */
function stationRamp(angle: number, side: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const slope = TRAM_PLATFORM_HEIGHT / (5.5 - 3.4);
  const normal = new THREE.Vector3();
  for (let i = 0; i <= 4; i++) {
    const a = angle + ((i / 4 - 0.5) * 3.1) / FLOOR_RADIUS;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const edge of [-1, 1]) {
      const across = side > 0 ? (edge < 0 ? 3.4 : 5.5) : edge < 0 ? -5.5 : -3.4;
      const height =
        ((Math.abs(across) - 3.4) / (5.5 - 3.4)) * TRAM_PLATFORM_HEIGHT;
      positions.push(
        (FLOOR_RADIUS - height) * c,
        across,
        (FLOOR_RADIUS - height) * s,
      );
      normal.set(-c, -side * slope, -s).normalize();
      normals.push(normal.x, normal.y, normal.z);
    }
    if (i < 4) {
      const j = i * 2;
      indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
    }
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  result.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  result.setIndex(indices);
  return result;
}

/** Low platform walls follow the same cylinder as the level walking surface. */
function platformSkirt(angle: number, across: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const arc = TRAM_PLATFORM_LENGTH / FLOOR_RADIUS;
  const point = (a: number, y: number, height: number) =>
    new THREE.Vector3(
      (FLOOR_RADIUS - height) * Math.cos(a),
      y,
      (FLOOR_RADIUS - height) * Math.sin(a),
    );
  const quad = (points: THREE.Vector3[], normal: THREE.Vector3) => {
    const cross = points[1]
      .clone()
      .sub(points[0])
      .cross(points[2].clone().sub(points[0]));
    if (cross.dot(normal) < 0)
      points = [points[0], points[3], points[2], points[1]];
    const offset = positions.length / 3;
    for (const value of points) {
      positions.push(value.x, value.y, value.z);
      normals.push(normal.x, normal.y, normal.z);
    }
    indices.push(
      offset,
      offset + 1,
      offset + 2,
      offset,
      offset + 2,
      offset + 3,
    );
  };
  for (const side of [-1, 1]) {
    const y = across + (side * TRAM_PLATFORM_WIDTH) / 2;
    for (let i = 0; i < 16; i++) {
      const a = angle + (i / 16 - 0.5) * arc;
      const b = angle + ((i + 1) / 16 - 0.5) * arc;
      quad(
        [
          point(a, y, 0),
          point(b, y, 0),
          point(b, y, TRAM_PLATFORM_HEIGHT),
          point(a, y, TRAM_PLATFORM_HEIGHT),
        ],
        new THREE.Vector3(0, side, 0),
      );
    }
    const a = angle + (side * arc) / 2;
    quad(
      [
        point(a, across - TRAM_PLATFORM_WIDTH / 2, 0),
        point(a, across + TRAM_PLATFORM_WIDTH / 2, 0),
        point(a, across + TRAM_PLATFORM_WIDTH / 2, TRAM_PLATFORM_HEIGHT),
        point(a, across - TRAM_PLATFORM_WIDTH / 2, TRAM_PLATFORM_HEIGHT),
      ],
      new THREE.Vector3(-Math.sin(a) * side, 0, Math.cos(a) * side),
    );
  }
  const result = new THREE.BufferGeometry();
  result.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  result.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  result.setIndex(indices);
  return result;
}

/** Twin open-cart loops. Time is analytical, so stops survive orbit skips. */
export function buildTramSystem(
  parent: THREE.Group,
  stations: readonly Station[],
) {
  const root = new THREE.Group();
  root.name = "Twin tram loops";
  parent.add(root);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const geometry = <T extends THREE.BufferGeometry>(value: T): T => {
    geometries.add(value);
    return value;
  };
  const material = <T extends THREE.Material>(value: T): T => {
    materials.add(value);
    return value;
  };
  const painted = material(
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.73,
      metalness: 0.18,
    }),
  );
  const railMaterial = material(
    new THREE.MeshStandardMaterial({
      color: "#526b60",
      metalness: 0.35,
      roughness: 0.7,
    }),
  );
  const platformMaterial = material(
    new THREE.MeshStandardMaterial({ color: "#c9ceba", roughness: 0.9 }),
  );
  const headlight = material(new THREE.MeshBasicMaterial({ color: "#fff1bb" }));
  const taillight = material(new THREE.MeshBasicMaterial({ color: "#ef795e" }));
  const signMaterial = material(
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const staticParts = new Parts();
  const signParts = new Parts();
  const rails = new Parts();
  const railSection = geometry(
    new THREE.TorusGeometry(FLOOR_RADIUS - 0.1, 0.085, 4, 512).rotateX(
      Math.PI / 2,
    ),
  );

  const stationBox = (
    anchor: THREE.Matrix4,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    luminous = false,
  ) => {
    (luminous ? signParts : staticParts).add(
      box,
      anchor.clone().multiply(localBox(x, y, z, w, h, d)),
      color,
    );
  };

  const addDigits = (
    anchor: THREE.Matrix4,
    number: number,
    signSide: number,
  ) => {
    const face = anchor
      .clone()
      .multiply(new THREE.Matrix4().makeRotationY(signSide < 0 ? Math.PI : 0));
    const digitWidth = 0.34;
    const segmentPositions = [
      [0, 0.3, 0.28, 0.055],
      [0.14, 0.15, 0.055, 0.26],
      [0.14, -0.15, 0.055, 0.26],
      [0, -0.3, 0.28, 0.055],
      [-0.14, -0.15, 0.055, 0.26],
      [-0.14, 0.15, 0.055, 0.26],
      [0, 0, 0.28, 0.055],
    ];
    [0, number].forEach((digit, digitIndex) => {
      SEGMENTS[digit].forEach((on, segment) => {
        if (!on) return;
        const [x, y, w, h] = segmentPositions[segment];
        stationBox(
          face,
          (digitIndex - 0.5) * (digitWidth + 0.11) + x,
          2.0 + y,
          0.087,
          w,
          h,
          0.025,
          "#e8f4da",
          true,
        );
      });
    });
  };

  for (const side of [-1, 1]) {
    const across = side * TRAM_TRACK_ACROSS;
    const direction = side === 1 ? -1 : 1;
    const stripe = side === 1 ? MINT : AMBER;
    rails.add(
      railSection,
      new THREE.Matrix4().makeTranslation(0, across, 0),
      "#ffffff",
    );
    for (let index = 0; index < TRAM_STATION_COUNT; index++) {
      const station = stations[index];
      const angle = station?.angle ?? (index * TAU) / TRAM_STATION_COUNT;
      const platformAcross = side * TRAM_PLATFORM_ACROSS;
      const platformArc = TRAM_PLATFORM_LENGTH / FLOOR_RADIUS;
      const anchor = placement(angle, platformAcross, TRAM_PLATFORM_HEIGHT);
      root.add(
        new THREE.Mesh(
          geometry(
            strip(
              FLOOR_RADIUS - TRAM_PLATFORM_HEIGHT,
              platformAcross,
              TRAM_PLATFORM_WIDTH,
              angle - platformArc / 2,
              platformArc,
            ),
          ),
          platformMaterial,
        ),
      );
      // A shallow accessible ramp links the promenade to the level boarding deck.
      root.add(
        new THREE.Mesh(geometry(stationRamp(angle, side)), platformMaterial),
      );
      const skirt = geometry(platformSkirt(angle, platformAcross));
      staticParts.add(skirt, new THREE.Matrix4(), "#b4bfaa");
      for (let tile = -4; tile <= 4; tile++) {
        const tileAngle = angle + (tile * 1.7) / FLOOR_RADIUS;
        const curvedAnchor = placement(
          tileAngle,
          platformAcross,
          TRAM_PLATFORM_HEIGHT,
        );
        stationBox(
          curvedAnchor,
          0,
          0.009,
          -side * 0.97,
          1.62,
          0.015,
          0.13,
          stripe,
        );
      }
      // A small shelter covers one end, leaving the platform and sky open.
      for (const end of [-1, 1]) {
        stationBox(
          anchor,
          -4.1 + end * 1.8,
          1.475,
          side * 0.7,
          0.11,
          2.95,
          0.11,
          "#94b8ad",
        );
        stationBox(
          anchor,
          -4.1 + end * 1.8,
          2.95,
          0,
          0.13,
          0.1,
          2.3,
          "#94b8ad",
        );
      }
      stationBox(anchor, -4.1, 3.03, 0, 4.2, 0.12, 2.3, "#e2dfc5");
      stationBox(anchor, -4.1, 3.11, -side * 1.03, 4.2, 0.05, 0.12, stripe);
      stationBox(anchor, -3.7, 0.48, side * 0.39, 2.4, 0.12, 0.55, "#8f7960");
      stationBox(anchor, -3.7, 0.75, side * 0.65, 2.4, 0.5, 0.08, "#8f7960");
      for (const leg of [-1, 1])
        stationBox(
          anchor,
          -3.7 + leg * 0.85,
          0.22,
          side * 0.39,
          0.09,
          0.44,
          0.42,
          "#506862",
        );
      const signAnchor = anchor
        .clone()
        .multiply(new THREE.Matrix4().makeTranslation(4.0, 0, side * 0.56));
      stationBox(signAnchor, 0, 1.32, 0, 0.09, 2.64, 0.09, "#668c80");
      stationBox(signAnchor, 0, 2.0, 0, 1.16, 0.9, 0.14, "#28443f");
      stationBox(
        signAnchor,
        0,
        2.49,
        0,
        1.16,
        0.09,
        0.16,
        station?.color ?? stripe,
      );
      addDigits(signAnchor, index + 1, 1);
      addDigits(signAnchor, index + 1, -1);
      // Painted chevrons point along each track's actual direction of travel.
      for (const arrowAt of [-6.2, 5.8]) {
        const arrow = anchor
          .clone()
          .multiply(
            new THREE.Matrix4().makeTranslation(arrowAt, 0.009, -side * 0.3),
          );
        for (const wing of [-1, 1]) {
          const chevron = new THREE.Matrix4()
            .makeTranslation(direction * -0.16, 0, wing * 0.14)
            .multiply(
              new THREE.Matrix4().makeRotationY(
                (direction * wing * Math.PI) / 4,
              ),
            )
            .scale(new THREE.Vector3(0.52, 0.01, 0.075));
          staticParts.add(box, arrow.clone().multiply(chevron), stripe);
        }
      }
    }
  }
  root.add(new THREE.Mesh(geometry(rails.geometry()), railMaterial));
  root.add(new THREE.Mesh(geometry(staticParts.geometry()), painted));
  root.add(new THREE.Mesh(geometry(signParts.geometry()), signMaterial));

  const bodyParts = new Parts();
  const stripeParts = new Parts();
  const frontLights = new Parts();
  const rearLights = new Parts();
  const carBox = (
    parts: Parts,
    x: number,
    y: number,
    z: number,
    width: number,
    height: number,
    depth: number,
    color = WHITE,
  ) => parts.add(box, localBox(x, y, z, width, height, depth), color);
  const localDeckHeight = TRAM_DECK_HEIGHT - (FLOOR_RADIUS - TRAM_TRACK_RADIUS);
  // A low, completely open deck: broad entries on both sides have no doors.
  carBox(
    bodyParts,
    0,
    localDeckHeight - 0.065,
    0,
    TRAM_LENGTH,
    0.13,
    TRAM_WIDTH,
    "#d2d8bf",
  );
  carBox(bodyParts, 0, localDeckHeight - 0.17, 0, 6.8, 0.12, 0.63, DARK);
  for (const side of [-1, 1]) {
    carBox(
      stripeParts,
      0,
      localDeckHeight - 0.035,
      side * (TRAM_WIDTH / 2 + 0.005),
      7.8,
      0.045,
      0.025,
    );
  }
  // Fine deck seams give the standing area scale without adding obstacles.
  for (const seam of [-0.6, 0, 0.6])
    carBox(
      bodyParts,
      0,
      localDeckHeight + 0.002,
      seam,
      7.85,
      0.005,
      0.012,
      "#b8c4af",
    );
  for (const end of [-1, 1]) {
    // Compact central guide bogies straddle the single monorail underneath.
    carBox(bodyParts, end * 2.65, 0.045, 0, 0.86, 0.18, 0.46, "#344e45");
    carBox(bodyParts, end * 2.65, -0.015, -0.18, 0.67, 0.16, 0.11, "#586b5e");
    carBox(bodyParts, end * 2.65, -0.015, 0.18, 0.67, 0.16, 0.11, "#586b5e");
    // End benches face the open central standing area.
    carBox(
      bodyParts,
      end * 3.22,
      localDeckHeight + 0.45,
      0,
      0.58,
      0.12,
      1.94,
      "#91a78b",
    );
    carBox(
      bodyParts,
      end * 3.5,
      localDeckHeight + 0.65,
      0,
      0.07,
      0.43,
      1.94,
      "#91a78b",
    );
    for (const side of [-1, 1]) {
      carBox(
        bodyParts,
        end * 3.22,
        localDeckHeight + 0.21,
        side * 0.68,
        0.39,
        0.42,
        0.07,
        "#607e6f",
      );
      for (const along of [2.6, 3.87]) {
        carBox(
          bodyParts,
          end * along,
          localDeckHeight + 0.43,
          side * (TRAM_WIDTH / 2 - 0.07),
          0.045,
          0.86,
          0.045,
          "#7b9889",
        );
      }
      // Short side rails protect seated passengers; the middle 5.2m stays open.
      carBox(
        bodyParts,
        end * 3.235,
        localDeckHeight + 0.86,
        side * (TRAM_WIDTH / 2 - 0.07),
        1.32,
        0.045,
        0.045,
        "#8da99a",
      );
      carBox(
        end === 1 ? frontLights : rearLights,
        end * (TRAM_LENGTH / 2 + 0.012),
        localDeckHeight - 0.035,
        side * 0.81,
        0.028,
        0.065,
        0.17,
      );
    }
    carBox(
      bodyParts,
      end * 3.87,
      localDeckHeight + 0.86,
      0,
      0.045,
      0.045,
      TRAM_WIDTH - 0.1,
      "#8da99a",
    );
    carBox(
      stripeParts,
      end * (TRAM_LENGTH / 2 + 0.004),
      localDeckHeight - 0.04,
      0,
      0.025,
      0.045,
      TRAM_WIDTH - 0.2,
    );
  }
  const bodyGeometry = geometry(bodyParts.geometry());
  const stripeGeometry = geometry(stripeParts.geometry());
  const headGeometry = geometry(frontLights.geometry());
  const tailGeometry = geometry(rearLights.geometry());
  const cars: { root: THREE.Group; direction: Direction; index: number }[] = [];
  for (const direction of ["spinward", "antispinward"] as const) {
    const routeMaterial = material(
      new THREE.MeshStandardMaterial({
        color: direction === "spinward" ? MINT : AMBER,
        roughness: 0.8,
        metalness: 0.12,
      }),
    );
    for (let index = 0; index < TRAMS_PER_DIRECTION; index++) {
      const car = new THREE.Group();
      car.name = `${direction} open cart ${index + 1}`;
      car.matrixAutoUpdate = false;
      car.add(
        new THREE.Mesh(bodyGeometry, painted),
        new THREE.Mesh(stripeGeometry, routeMaterial),
        new THREE.Mesh(headGeometry, headlight),
        new THREE.Mesh(tailGeometry, taillight),
      );
      root.add(car);
      cars.push({ root: car, direction, index });
    }
  }
  const update = (simSeconds: number) => {
    for (const car of cars) {
      const state = getTramState(simSeconds, car.direction, car.index);
      const forward = car.direction === "spinward" ? -1 : 1;
      const across =
        car.direction === "spinward" ? TRAM_TRACK_ACROSS : -TRAM_TRACK_ACROSS;
      car.root.matrix.copy(
        placement(
          state.angle,
          across,
          FLOOR_RADIUS - TRAM_TRACK_RADIUS,
          forward,
        ),
      );
      car.root.matrixWorldNeedsUpdate = true;
    }
  };
  update(0);
  let disposed = false;
  return {
    root,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      for (const resource of geometries) resource.dispose();
      for (const resource of materials) resource.dispose();
    },
  };
}
