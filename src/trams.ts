import * as THREE from "three";
import {
  getTramState,
  TRAM_STATION_COUNT,
  TRAM_TRACK_ACROSS,
  TRAM_TRACK_RADIUS,
  TRAMS_PER_DIRECTION,
} from "./tram-motion";
import { TRAM_LENGTH, TRAM_WIDTH, TRAM_ROOF_HEIGHT } from "./tram-physics";

type Station = { name: string; angle: number; color: string };
type Direction = "spinward" | "antispinward";

const TAU = Math.PI * 2;
const FLOOR_RADIUS = 210;
const WHITE = "#dce6db";
const DARK = "#304b4b";
const MINT = "#6fe1bd";
const AMBER = "#edba6b";
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

/** Twin light-rail loops. Time is analytical, so stops also survive orbit skips. */
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
      color: "#b6cccb",
      metalness: 0.78,
      roughness: 0.3,
    }),
  );
  const bedMaterial = material(
    new THREE.MeshStandardMaterial({ color: "#566b65", roughness: 1 }),
  );
  const platformMaterial = material(
    new THREE.MeshStandardMaterial({ color: "#c9ceba", roughness: 0.9 }),
  );
  const sleeperMaterial = material(
    new THREE.MeshStandardMaterial({ color: "#899384", roughness: 0.95 }),
  );
  const glazing = material(
    new THREE.MeshStandardMaterial({
      color: "#a5dbcf",
      transparent: true,
      opacity: 0.19,
      roughness: 0.19,
      metalness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  const headlight = material(new THREE.MeshBasicMaterial({ color: "#fff1bb" }));
  const taillight = material(new THREE.MeshBasicMaterial({ color: "#ef795e" }));
  const signMaterial = material(
    new THREE.MeshBasicMaterial({ vertexColors: true }),
  );
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const wheel = geometry(
    new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12).rotateX(Math.PI / 2),
  );
  const staticParts = new Parts();
  const signParts = new Parts();
  const rails = new Parts();
  const railSection = geometry(
    new THREE.TorusGeometry(TRAM_TRACK_RADIUS, 0.055, 4, 512).rotateX(
      Math.PI / 2,
    ),
  );
  const sleeperCount = 660;
  const sleepers = new THREE.InstancedMesh(
    box,
    sleeperMaterial,
    sleeperCount * 2,
  );
  sleepers.name = "Rail sleepers";
  root.add(sleepers);
  let sleeperIndex = 0;

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
    root.add(new THREE.Mesh(geometry(strip(209.96, across, 2.8)), bedMaterial));
    for (const gaugeSide of [-1, 1]) {
      rails.add(
        railSection,
        new THREE.Matrix4().makeTranslation(0, across + gaugeSide * 0.65, 0),
        "#ffffff",
      );
    }
    for (let i = 0; i < sleeperCount; i++) {
      sleepers.setMatrixAt(
        sleeperIndex++,
        placement((TAU * i) / sleeperCount, across, 0.115).scale(
          new THREE.Vector3(0.19, 0.075, 2.35),
        ),
      );
    }
    for (let index = 0; index < TRAM_STATION_COUNT; index++) {
      const station = stations[index];
      const angle = station?.angle ?? (index * TAU) / TRAM_STATION_COUNT;
      const platformAcross = side * 6.6;
      const platformArc = 16 / FLOOR_RADIUS;
      const anchor = placement(angle, platformAcross, 0);
      root.add(
        new THREE.Mesh(
          geometry(
            strip(
              209.865,
              platformAcross,
              2.2,
              angle - platformArc / 2,
              platformArc,
            ),
          ),
          platformMaterial,
        ),
      );
      // A wide, unobstructed link back to the central walking promenade.
      stationBox(anchor, 0, 0.085, side * 2.05, 3.1, 0.1, 4.1, "#d1cfb7");
      for (let tile = -4; tile <= 4; tile++) {
        const tileAngle = angle + (tile * 1.7) / FLOOR_RADIUS;
        const curvedAnchor = placement(tileAngle, platformAcross, 0);
        stationBox(
          curvedAnchor,
          0,
          0.16,
          -side * 0.97,
          1.62,
          0.055,
          0.13,
          stripe,
        );
      }
      // Slender shelter is set behind the boarding edge, leaving the link open.
      for (const end of [-1, 1]) {
        stationBox(
          anchor,
          end * 5.4,
          1.55,
          side * 0.7,
          0.11,
          2.8,
          0.11,
          "#94b8ad",
        );
        stationBox(anchor, end * 5.4, 2.95, 0, 0.13, 0.1, 2.3, "#94b8ad");
      }
      stationBox(anchor, 0, 3.03, 0, 11.6, 0.12, 2.3, "#e2dfc5");
      stationBox(anchor, 0, 3.11, -side * 1.03, 11.6, 0.05, 0.17, stripe);
      stationBox(anchor, -3.7, 0.64, side * 0.39, 2.4, 0.14, 0.55, "#8f7960");
      stationBox(anchor, -3.7, 0.91, side * 0.65, 2.4, 0.54, 0.08, "#8f7960");
      for (const leg of [-1, 1])
        stationBox(
          anchor,
          -3.7 + leg * 0.85,
          0.38,
          side * 0.39,
          0.09,
          0.44,
          0.42,
          "#506862",
        );
      const signAnchor = anchor
        .clone()
        .multiply(new THREE.Matrix4().makeTranslation(4.0, 0, side * 0.56));
      stationBox(signAnchor, 0, 1.38, 0, 0.09, 2.52, 0.09, "#668c80");
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
            new THREE.Matrix4().makeTranslation(arrowAt, 0.18, -side * 0.3),
          );
        for (const wing of [-1, 1]) {
          const chevron = new THREE.Matrix4()
            .makeTranslation(direction * -0.16, 0, wing * 0.14)
            .multiply(
              new THREE.Matrix4().makeRotationY(
                (direction * wing * Math.PI) / 4,
              ),
            )
            .scale(new THREE.Vector3(0.52, 0.025, 0.075));
          staticParts.add(box, arrow.clone().multiply(chevron), stripe);
        }
      }
    }
  }
  sleepers.instanceMatrix.needsUpdate = true;
  sleepers.computeBoundingSphere();
  root.add(new THREE.Mesh(geometry(rails.geometry()), railMaterial));
  root.add(new THREE.Mesh(geometry(staticParts.geometry()), painted));
  root.add(new THREE.Mesh(geometry(signParts.geometry()), signMaterial));

  const bodyParts = new Parts();
  const glassParts = new Parts();
  const stripeParts = new Parts();
  const frontLights = new Parts();
  const rearLights = new Parts();
  const carBox = (
    parts: Parts,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color = WHITE,
  ) => parts.add(box, localBox(x, y, z, w, h, d), color);
  carBox(bodyParts, 0, 0.45, 0, 7.9, 0.2, 2.05);
  const localRoofHeight = TRAM_ROOF_HEIGHT - (FLOOR_RADIUS - TRAM_TRACK_RADIUS);
  carBox(
    bodyParts,
    0,
    localRoofHeight - 0.08,
    0,
    TRAM_LENGTH,
    0.16,
    TRAM_WIDTH,
  );
  carBox(bodyParts, 0, 0.24, 0, 6.5, 0.18, 1.3, DARK);
  for (const end of [-1, 1]) {
    for (const side of [-1, 1]) {
      bodyParts.add(
        wheel,
        new THREE.Matrix4().makeTranslation(end * 2.55, 0.24, side * 0.77),
        "#263b3b",
      );
      carBox(
        bodyParts,
        end * 2.55,
        0.48,
        side * 0.84,
        1.3,
        0.25,
        0.19,
        "#728b7e",
      );
    }
    carBox(bodyParts, end * 3.9, 0.87, 0, 0.2, 0.64, 2.03);
    carBox(bodyParts, end * 3.91, 2.33, 0, 0.18, 0.25, 2.03);
    for (const side of [-1, 1])
      carBox(bodyParts, end * 3.9, 1.73, side * 0.95, 0.17, 1.12, 0.13, DARK);
    carBox(glassParts, end * 3.925, 1.73, 0, 0.035, 1.13, 1.77);
    carBox(stripeParts, end * 3.99, 1.13, 0, 0.028, 0.12, 1.85);
    for (const side of [-1, 1])
      carBox(
        end === 1 ? frontLights : rearLights,
        end * 4.016,
        0.89,
        side * 0.69,
        0.035,
        0.13,
        0.27,
      );
  }
  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      carBox(bodyParts, end * 2.36, 0.86, side * 0.98, 2.95, 0.61, 0.1);
      carBox(bodyParts, end * 2.36, 2.32, side * 0.98, 2.95, 0.26, 0.1);
      carBox(glassParts, end * 2.36, 1.73, side * 0.987, 2.86, 1.12, 0.035);
      carBox(stripeParts, end * 2.36, 1.13, side * 1.04, 2.95, 0.12, 0.028);
      // Two longitudinal benches leave a clear aisle through the car.
      carBox(
        bodyParts,
        end * 2.28,
        0.91,
        side * 0.68,
        2.55,
        0.16,
        0.44,
        "#688f81",
      );
      carBox(
        bodyParts,
        end * 2.28,
        1.18,
        side * 0.88,
        2.55,
        0.58,
        0.1,
        "#688f81",
      );
    }
    for (const upright of [-3.72, -0.84, 0.84, 3.72])
      carBox(bodyParts, upright, 1.61, side * 0.99, 0.1, 1.81, 0.1, DARK);
  }
  const doorWindows = new Parts();
  // Actual openings in the door panels keep the glazing see-through.
  // Replace the panel by a narrow frame and lower apron around the clear pane.
  const framedDoor = new Parts();
  carBox(framedDoor, 0, 0.83, 0, 0.72, 0.67, 0.055);
  carBox(framedDoor, 0, 2.32, 0, 0.72, 0.08, 0.055);
  for (const edge of [-1, 1])
    carBox(framedDoor, edge * 0.335, 1.74, 0, 0.05, 1.1, 0.055);
  carBox(doorWindows, 0, 1.74, 0, 0.62, 1.1, 0.025);
  const bodyGeometry = geometry(bodyParts.geometry());
  const glassGeometry = geometry(glassParts.geometry());
  const stripeGeometry = geometry(stripeParts.geometry());
  const headGeometry = geometry(frontLights.geometry());
  const tailGeometry = geometry(rearLights.geometry());
  const doorGeometry = geometry(framedDoor.geometry());
  const doorGlassGeometry = geometry(doorWindows.geometry());
  const cars: {
    root: THREE.Group;
    doors: THREE.InstancedMesh[];
    direction: Direction;
    index: number;
  }[] = [];
  for (const direction of ["spinward", "antispinward"] as const) {
    const routeMaterial = material(
      new THREE.MeshStandardMaterial({
        color: direction === "spinward" ? MINT : AMBER,
        roughness: 0.62,
        metalness: 0.12,
      }),
    );
    for (let index = 0; index < TRAMS_PER_DIRECTION; index++) {
      const car = new THREE.Group();
      car.name = `${direction} tram ${index + 1}`;
      car.matrixAutoUpdate = false;
      car.add(
        new THREE.Mesh(bodyGeometry, painted),
        new THREE.Mesh(glassGeometry, glazing),
        new THREE.Mesh(stripeGeometry, routeMaterial),
        new THREE.Mesh(headGeometry, headlight),
        new THREE.Mesh(tailGeometry, taillight),
      );
      const doors = [
        new THREE.InstancedMesh(doorGeometry, painted, 4),
        new THREE.InstancedMesh(doorGlassGeometry, glazing, 4),
      ];
      // Door leaves slide beside the fixed windows, rather than through passengers.
      for (const mesh of doors) {
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        car.add(mesh);
      }
      root.add(car);
      cars.push({ root: car, doors, direction, index });
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
      let leaf = 0;
      for (const side of [-1, 1]) {
        for (const half of [-1, 1]) {
          const transform = new THREE.Matrix4().makeTranslation(
            half * (0.37 + state.doorsOpenFraction * 0.79),
            0,
            side * 1.045,
          );
          for (const mesh of car.doors) mesh.setMatrixAt(leaf, transform);
          leaf++;
        }
      }
      for (const mesh of car.doors) mesh.instanceMatrix.needsUpdate = true;
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
      sleepers.dispose();
      for (const car of cars) {
        for (const doors of car.doors) doors.dispose();
      }
      for (const resource of geometries) resource.dispose();
      for (const resource of materials) resource.dispose();
    },
  };
}
