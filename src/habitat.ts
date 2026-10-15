import * as THREE from "three";

/** Metres, in the habitat's co-rotating frame. The spin axis is world Y. */
export const HABITAT_RADIUS = 210;
export const HABITAT_HALF_WIDTH = 22;

export const HABITAT_DISTRICTS = [
  { name: "Aurora Commons", angle: 0, color: "#65e3d0" },
  { name: "Sunward Farms", angle: Math.PI / 3, color: "#e4c773" },
  { name: "The Reservoir", angle: (Math.PI * 2) / 3, color: "#7ccfe8" },
  { name: "Zenith Gardens", angle: Math.PI, color: "#b7d893" },
  { name: "Orchard Quarter", angle: (Math.PI * 4) / 3, color: "#e8aa8e" },
  { name: "Starlight Village", angle: (Math.PI * 5) / 3, color: "#bdaee5" },
] as const;

export interface HabitatHandle {
  root: THREE.Group;
  update: (elapsedSeconds: number) => void;
  dispose: () => void;
}

type Instance = { matrix: THREE.Matrix4; color?: THREE.ColorRepresentation };
const TAU = Math.PI * 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const LOCAL_FORWARD = new THREE.Vector3(0, -1, 0);

function randomGenerator(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let next = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

/** Local X follows the promenade, local Y points toward the axis, local Z = -world Y. */
function floorMatrix(
  angle: number,
  across: number,
  height: number,
  scale = new THREE.Vector3(1, 1, 1),
  tangentOffset = 0,
): THREE.Matrix4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const tangent = new THREE.Vector3(-s, 0, c);
  const up = new THREE.Vector3(-c, 0, -s);
  const rotation = new THREE.Matrix4().makeBasis(tangent, up, LOCAL_FORWARD);
  const position = new THREE.Vector3(
    (HABITAT_RADIUS - height) * c - tangentOffset * s,
    across,
    (HABITAT_RADIUS - height) * s + tangentOffset * c,
  );
  return rotation.scale(scale).setPosition(position);
}

function cylinderBand(
  radius: number,
  yMin: number,
  yMax: number,
  start = 0,
  end = TAU,
  segments = 384,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = start + ((end - start) * i) / segments;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    positions.push(radius * c, yMin, radius * s, radius * c, yMax, radius * s);
    normals.push(-c, 0, -s, -c, 0, -s);
    if (i < segments) {
      const j = i * 2;
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

function strutMatrix(
  a: THREE.Vector3,
  b: THREE.Vector3,
  thickness: number,
): THREE.Matrix4 {
  const delta = b.clone().sub(a);
  return new THREE.Matrix4().compose(
    a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(
      Y_AXIS,
      delta.clone().normalize(),
    ),
    new THREE.Vector3(thickness, delta.length(), thickness),
  );
}

/** All visuals are generated geometry; there are no image textures or downloaded assets. */
export function buildHabitat(scene: THREE.Scene): HabitatHandle {
  const root = new THREE.Group();
  root.name = "Procedural Stanford torus";
  scene.add(root);
  const oldBackground = scene.background;
  const oldFog = scene.fog;
  const background = new THREE.Color("#07131e");
  scene.background = background;
  scene.fog = new THREE.FogExp2("#102735", 0.00032);
  const random = randomGenerator(1984);

  const standard = (
    color: THREE.ColorRepresentation,
    extras: THREE.MeshStandardMaterialParameters = {},
  ) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.82,
      metalness: 0.05,
      ...extras,
    });
  const materials = {
    ground: standard("#bac4b2"),
    grass: standard("#719f77"),
    darkGrass: standard("#5c8d6b"),
    path: standard("#e4dfc8"),
    terrace: standard("#c7cdb9"),
    body: standard("#e4e5d5"),
    trim: standard("#9eb4b2", { metalness: 0.3 }),
    glass: standard("#294b5b", {
      roughness: 0.28,
      metalness: 0.45,
      emissive: "#173b49",
      emissiveIntensity: 0.22,
    }),
    solar: standard("#2b4a65", { roughness: 0.24, metalness: 0.55 }),
    trunk: standard("#745d47"),
    leaves: standard("#69a383", { flatShading: true }),
    hedge: standard("#7caa7c"),
    soil: standard("#6c6b50"),
    crops: standard("#a6bd68"),
    structure: standard("#a5bbba", { metalness: 0.55, roughness: 0.38 }),
    hub: standard("#e2e2d1", { roughness: 0.45, metalness: 0.38 }),
    water: standard("#67bfc2", {
      metalness: 0.48,
      roughness: 0.18,
      emissive: "#133d42",
      emissiveIntensity: 0.3,
    }),
    cyan: new THREE.MeshBasicMaterial({ color: "#82dacf" }),
    lamp: new THREE.MeshBasicMaterial({ color: "#ffeac0" }),
    roofGlass: new THREE.MeshBasicMaterial({
      color: "#6bbdd5",
      transparent: true,
      opacity: 0.045,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    railing: new THREE.MeshBasicMaterial({
      color: "#a1dece",
      transparent: true,
      opacity: 0.09,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  };

  const add = <T extends THREE.Object3D>(object: T): T => {
    root.add(object);
    return object;
  };
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) =>
    add(new THREE.Mesh(geometry, material));
  const instances = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    data: Instance[],
  ) => {
    const result = new THREE.InstancedMesh(geometry, material, data.length);
    const color = new THREE.Color();
    data.forEach((instance, i) => {
      result.setMatrixAt(i, instance.matrix);
      if (instance.color !== undefined)
        result.setColorAt(i, color.set(instance.color));
    });
    result.instanceMatrix.needsUpdate = true;
    if (result.instanceColor) result.instanceColor.needsUpdate = true;
    result.computeBoundingSphere();
    add(result);
    return result;
  };
  const band = (
    radius: number,
    min: number,
    max: number,
    material: THREE.Material,
  ) => mesh(cylinderBand(radius, min, max), material);
  const orbitRing = (
    radius: number,
    width: number,
    across: number,
    material: THREE.Material,
  ) => {
    const ring = mesh(new THREE.TorusGeometry(radius, width, 5, 256), material);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = across;
    return ring;
  };

  add(new THREE.HemisphereLight("#d9f4ff", "#61735b", 2.1));
  add(new THREE.AmbientLight("#8cabb9", 0.6));
  const sunLight = add(new THREE.DirectionalLight("#fff2cf", 2.35));
  sunLight.position.set(350, 600, -400);

  // A continuous inward-facing cylinder is the playable ground. Every strip has
  // the same radius apart from tiny offsets to prevent overlapping surfaces.
  band(HABITAT_RADIUS, -22, 22, materials.ground);
  band(209.96, -21.7, -3.65, materials.grass);
  band(209.96, 3.65, 21.7, materials.grass);
  band(209.92, -3.4, 3.4, materials.path);
  band(209.9, -3.5, -3.39, materials.cyan);
  band(209.9, 3.39, 3.5, materials.cyan);
  band(209.91, -12.7, -10.7, materials.terrace);
  band(209.91, 10.7, 12.7, materials.terrace);
  band(209.9, -21.9, -21.25, materials.path);
  band(209.9, 21.25, 21.9, materials.path);

  const boxes: Instance[] = [];
  const glass: Instance[] = [];
  const trims: Instance[] = [];
  const roofs: Instance[] = [];
  const roofGardens: Instance[] = [];
  const trunks: Instance[] = [];
  const leaves: Instance[] = [];
  const lamps: Instance[] = [];
  const bulbs: Instance[] = [];
  const bedBorders: Instance[] = [];
  const beds: Instance[] = [];
  const crops: Instance[] = [];
  const railPosts: Instance[] = [];
  const dashes: Instance[] = [];
  const arches: Instance[] = [];
  const beacons: THREE.Mesh[] = [];
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);

  const placeBox = (
    collection: Instance[],
    angle: number,
    across: number,
    height: number,
    width: number,
    tall: number,
    depth: number,
    color?: THREE.ColorRepresentation,
    tangentOffset = 0,
  ) => {
    collection.push({
      matrix: floorMatrix(
        angle,
        across,
        height,
        new THREE.Vector3(width, tall, depth),
        tangentOffset,
      ),
      color,
    });
  };
  const plantTree = (angle: number, across: number, variation = 1) => {
    const height = (2.6 + random() * 1.0) * variation;
    trunks.push({
      matrix: floorMatrix(
        angle,
        across,
        height * 0.37,
        new THREE.Vector3(0.13, height * 0.74, 0.13),
      ),
    });
    leaves.push({
      matrix: floorMatrix(
        angle,
        across,
        height + 0.45,
        new THREE.Vector3(
          (1.2 + random() * 0.5) * variation,
          (1.5 + random() * 0.5) * variation,
          1.35 * variation,
        ),
      ),
      color: new THREE.Color().setHSL(
        0.35 + random() * 0.065,
        0.22 + random() * 0.14,
        0.38 + random() * 0.12,
      ),
    });
  };

  // A small number of shared meshes draw a whole inhabited ring. The central
  // seven metres stay clear for walking, jumping and ballistic experiments.
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * TAU;
    const district = Math.floor(i / 12);
    for (const side of [-1, 1]) {
      if (i % 2 === 0) {
        lamps.push({
          matrix: floorMatrix(
            angle,
            side * 4.35,
            1.75,
            new THREE.Vector3(0.055, 3.5, 0.055),
          ),
        });
        bulbs.push({
          matrix: floorMatrix(
            angle,
            side * 4.35,
            3.55,
            new THREE.Vector3(0.28, 0.12, 0.28),
          ),
        });
      }
      railPosts.push({
        matrix: floorMatrix(
          angle,
          side * 21.75,
          0.72,
          new THREE.Vector3(0.035, 1.44, 0.035),
        ),
      });
      plantTree(
        angle + 0.013,
        side * (7.1 + random() * 1.15),
        district === 4 ? 1.17 : 1,
      );
      if (i % 3 !== 0) plantTree(angle + 0.041, side * (19.2 + random()), 0.8);

      // Farming and water districts open into gardens; the other districts
      // alternate compact terraces and taller pale apartment buildings.
      const isFarm = district === 1 && i % 3 !== 0;
      const isPool = district === 2 && i % 3 !== 0;
      const isOrchard = district === 4 && i % 3 !== 0;
      if (isFarm) {
        for (let row = 0; row < 3; row++) {
          const across = side * (13.8 + row * 2.1);
          placeBox(bedBorders, angle, across, 0.15, 12.2, 0.3, 1.65);
          placeBox(beds, angle, across, 0.32, 11.8, 0.12, 1.3);
          for (let crop = 0; crop < 7; crop++) {
            placeBox(
              crops,
              angle,
              across,
              0.65,
              0.8,
              0.5 + random() * 0.25,
              0.7,
              row === 1 ? "#bbbc65" : "#85ae70",
              (crop - 3) * 1.6,
            );
          }
        }
      } else if (isPool) {
        mesh(
          cylinderBand(
            209.87,
            side > 0 ? 12.9 : -19.3,
            side > 0 ? 19.3 : -12.9,
            angle - 0.034,
            angle + 0.034,
            10,
          ),
          materials.water,
        );
        for (const offset of [-0.037, 0.037]) {
          placeBox(trims, angle + offset, side * 16.1, 0.13, 0.35, 0.26, 7.2);
        }
      } else if (isOrchard) {
        for (let row = 0; row < 2; row++) {
          plantTree(angle - 0.018, side * (13.6 + row * 4.5), 1.12);
          plantTree(angle + 0.022, side * (13.6 + row * 4.5), 1.05);
        }
      } else {
        const width = 6.3 + random() * 4.7;
        const depth = 5.3 + random() * 2;
        const height = district === 5 ? 7 + random() * 5 : 4.0 + random() * 4.1;
        const across = side * 16.1;
        const facade = new THREE.Color().setHSL(
          0.12 + random() * 0.08,
          0.12,
          0.75 + random() * 0.12,
        );
        placeBox(
          boxes,
          angle,
          across,
          height / 2 + 0.11,
          width,
          height,
          depth,
          facade,
        );
        placeBox(trims, angle, across, 0.31, width + 0.75, 0.5, depth + 0.65);
        placeBox(
          trims,
          angle,
          across,
          height + 0.15,
          width + 0.4,
          0.28,
          depth + 0.4,
        );
        for (let level = 0; level < Math.floor(height / 2.7); level++) {
          placeBox(
            glass,
            angle,
            across - side * (depth / 2 + 0.025),
            1.9 + level * 2.6,
            width * 0.88,
            0.91,
            0.055,
          );
          placeBox(
            trims,
            angle,
            across - side * (depth / 2 + 0.13),
            1.36 + level * 2.6,
            width * 0.95,
            0.13,
            0.38,
          );
        }
        placeBox(
          roofs,
          angle,
          across + side * 1.2,
          height + 0.34,
          width * 0.88,
          0.12,
          depth * 0.37,
        );
        placeBox(
          roofGardens,
          angle,
          across - side * 1.3,
          height + 0.38,
          width * 0.82,
          0.22,
          depth * 0.29,
        );
      }
    }
    if (i % 2 === 0) placeBox(dashes, angle, 0, 0.115, 2.4, 0.025, 0.06);
  }

  // Bright route portals mark each neighbourhood without closing the view.
  for (const [index, district] of HABITAT_DISTRICTS.entries()) {
    const angle = district.angle - 0.08;
    for (const side of [-1, 1]) {
      placeBox(trims, angle, side * 4.05, 2.2, 0.35, 4.4, 0.35);
      placeBox(dashes, angle, side * 4.05, 2.8, 0.13, 2.0, 0.4, district.color);
    }
    placeBox(trims, angle, 0, 4.45, 0.45, 0.35, 8.5);
    placeBox(dashes, angle, 0, 4.65, 0.2, 0.07, 7.9, district.color);

    // Each district has a large geometric navigation sculpture on its lawn.
    const sculptureAcross = index % 2 === 0 ? -9.0 : 9.0;
    const pedestal = mesh(
      new THREE.CylinderGeometry(1.4, 1.7, 0.45, 6),
      materials.path,
    );
    pedestal.matrixAutoUpdate = false;
    pedestal.matrix.copy(
      floorMatrix(district.angle + 0.052, sculptureAcross, 0.3),
    );
    const beaconMaterial = new THREE.MeshStandardMaterial({
      color: district.color,
      emissive: district.color,
      emissiveIntensity: 0.36,
      roughness: 0.3,
      metalness: 0.4,
    });
    const beacon = mesh(new THREE.IcosahedronGeometry(1.15, 0), beaconMaterial);
    beacon.matrixAutoUpdate = false;
    beacon.matrix.copy(
      floorMatrix(district.angle + 0.052, sculptureAcross, 2.3),
    );
    beacon.userData.angle = district.angle + 0.052;
    beacon.userData.across = sculptureAcross;
    beacons.push(beacon);
    const halo = mesh(
      new THREE.TorusGeometry(1.9, 0.065, 5, 32),
      materials.structure,
    );
    halo.matrixAutoUpdate = false;
    halo.matrix.copy(floorMatrix(district.angle + 0.052, sculptureAcross, 2.3));
  }

  instances(boxGeometry, materials.body, boxes);
  instances(boxGeometry, materials.glass, glass);
  instances(boxGeometry, materials.trim, trims);
  instances(boxGeometry, materials.solar, roofs);
  instances(boxGeometry, materials.hedge, roofGardens);
  instances(new THREE.CylinderGeometry(1, 0.8, 1, 6), materials.trunk, trunks);
  instances(new THREE.IcosahedronGeometry(1, 1), materials.leaves, leaves);
  instances(cylinderGeometry, materials.structure, lamps);
  instances(new THREE.SphereGeometry(1, 6, 4), materials.lamp, bulbs);
  instances(boxGeometry, materials.path, bedBorders);
  instances(boxGeometry, materials.soil, beds);
  instances(boxGeometry, materials.crops, crops);
  instances(cylinderGeometry, materials.structure, railPosts);
  instances(boxGeometry, materials.cyan, dashes);

  orbitRing(208.55, 0.075, -21.75, materials.structure);
  orbitRing(208.55, 0.075, 21.75, materials.structure);
  for (const side of [-1, 1]) {
    const guard = mesh(
      new THREE.RingGeometry(208.55, 210, 256),
      materials.railing,
    );
    guard.rotation.x = Math.PI / 2;
    guard.position.y = side * 21.75;
  }

  // The ribbed canopy is deliberately open above the promenade. Lightweight
  // glazing at the shoulders suggests pressure walls while exposing the hub,
  // the stars, and the opposite inhabited arc from ground level.
  const ribPoint = (angle: number, t: number) => {
    const radius = HABITAT_RADIUS - 35 * Math.sin(t);
    return new THREE.Vector3(
      radius * Math.cos(angle),
      -24 * Math.cos(t),
      radius * Math.sin(angle),
    );
  };
  const canopyPositions: number[] = [];
  const canopyIndices: number[] = [];
  for (let rib = 0; rib < 24; rib++) {
    const angle = (rib / 24) * TAU;
    for (let segment = 0; segment < 20; segment++) {
      arches.push({
        matrix: strutMatrix(
          ribPoint(angle, (segment / 20) * Math.PI),
          ribPoint(angle, ((segment + 1) / 20) * Math.PI),
          0.19,
        ),
      });
    }
    for (const [start, end] of [
      [0.05, 0.9],
      [Math.PI - 0.9, Math.PI - 0.05],
    ]) {
      for (let slice = 0; slice < 5; slice++) {
        const t0 = start + ((end - start) * slice) / 5;
        const t1 = start + ((end - start) * (slice + 1)) / 5;
        const base = canopyPositions.length / 3;
        for (const point of [
          ribPoint(angle, t0),
          ribPoint(angle + TAU / 24, t0),
          ribPoint(angle, t1),
          ribPoint(angle + TAU / 24, t1),
        ]) {
          canopyPositions.push(point.x, point.y, point.z);
        }
        canopyIndices.push(
          base,
          base + 1,
          base + 2,
          base + 1,
          base + 3,
          base + 2,
        );
      }
    }
  }
  instances(cylinderGeometry, materials.structure, arches);
  const canopyGeometry = new THREE.BufferGeometry();
  canopyGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(canopyPositions, 3),
  );
  canopyGeometry.setIndex(canopyIndices);
  mesh(canopyGeometry, materials.roofGlass);
  orbitRing(175, 0.2, 0, materials.structure);
  orbitRing(185.25, 0.15, -17, materials.structure);
  orbitRing(185.25, 0.15, 17, materials.structure);

  // A non-rotating-looking axial hub and six pairs of spoke trusses make the
  // station's scale legible both from the promenade and from free flight.
  const hub = mesh(new THREE.CylinderGeometry(11, 11, 47, 20), materials.hub);
  hub.position.y = 0;
  mesh(new THREE.CylinderGeometry(14, 14, 12, 20), materials.glass);
  for (const y of [-24, -7, 7, 24])
    orbitRing(
      y === -24 || y === 24 ? 11.5 : 14.3,
      0.45,
      y,
      materials.structure,
    );
  const hubCaps: Instance[] = [];
  for (const side of [-1, 1]) {
    hubCaps.push({
      matrix: new THREE.Matrix4().compose(
        new THREE.Vector3(0, side * 27, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(9, 5, 9),
      ),
    });
  }
  instances(new THREE.IcosahedronGeometry(1, 1), materials.hub, hubCaps);
  const spokes: Instance[] = [];
  const spokeBraces: Instance[] = [];
  for (let spoke = 0; spoke < 6; spoke++) {
    const angle = (spoke / 6) * TAU + Math.PI / 6;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    for (const side of [-1, 1]) {
      const a = radial
        .clone()
        .multiplyScalar(10)
        .setY(side * 20);
      const b = radial
        .clone()
        .multiplyScalar(184)
        .setY(side * 27);
      spokes.push({ matrix: strutMatrix(a, b, 0.65) });
      for (let section = 0; section < 9; section++) {
        const start = 14 + section * 19;
        const p0 = radial
          .clone()
          .multiplyScalar(start)
          .setY(side * (19 + (start / 184) * 7));
        const p1 = radial
          .clone()
          .multiplyScalar(start + 18)
          .setY(side * (23 + ((start + 18) / 184) * 7));
        spokeBraces.push({ matrix: strutMatrix(p0, p1, 0.11) });
      }
    }
  }
  instances(cylinderGeometry, materials.structure, spokes);
  instances(cylinderGeometry, materials.trim, spokeBraces);

  // Deterministic star positions have a fixed cost and need no texture atlas.
  const starPositions: number[] = [];
  const starColors: number[] = [];
  for (let i = 0; i < 3200; i++) {
    const azimuth = random() * TAU;
    const altitude = Math.acos(random() * 2 - 1);
    const distance = 1700 + random() * 750;
    starPositions.push(
      distance * Math.sin(altitude) * Math.cos(azimuth),
      distance * Math.cos(altitude),
      distance * Math.sin(altitude) * Math.sin(azimuth),
    );
    const color = new THREE.Color().setHSL(
      0.52 + random() * 0.13,
      random() * 0.35,
      0.66 + random() * 0.3,
    );
    starColors.push(color.r, color.g, color.b);
  }
  const starsGeometry = new THREE.BufferGeometry();
  starsGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(starPositions, 3),
  );
  starsGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(starColors, 3),
  );
  const stars = add(
    new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({
        size: 1.45,
        sizeAttenuation: false,
        vertexColors: true,
        fog: false,
        depthWrite: false,
      }),
    ),
  );
  stars.name = "Procedural stars";

  const sun = mesh(
    new THREE.SphereGeometry(22, 16, 12),
    new THREE.MeshBasicMaterial({ color: "#fff2ce", fog: false }),
  );
  sun.position.set(1050, 1800, -1200);

  // A simple distant blue world provides a quiet point of orientation.
  const planet = mesh(
    new THREE.IcosahedronGeometry(155, 4),
    standard("#336d9a", { roughness: 1, flatShading: true, fog: false }),
  );
  planet.position.set(-1000, 560, -1600);
  const planetAtmosphere = mesh(
    new THREE.IcosahedronGeometry(159, 4),
    new THREE.MeshBasicMaterial({
      color: "#74c8e5",
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.2,
      fog: false,
    }),
  );
  planetAtmosphere.position.copy(planet.position);

  // The habitat is held still for navigation. In this co-rotating coordinate
  // system distant inertial objects sweep past at the opposite angular rate.
  const inertialSky = add(new THREE.Group());
  inertialSky.name = "Inertial sky";
  inertialSky.add(stars, sun, planet, planetAtmosphere, sunLight);
  const angularSpeed = Math.sqrt(9.81 / HABITAT_RADIUS);

  let disposed = false;
  return {
    root,
    update(elapsedSeconds) {
      if (disposed) return;
      inertialSky.rotation.y = -elapsedSeconds * angularSpeed;
      for (let i = 0; i < beacons.length; i++) {
        const beacon = beacons[i];
        const base = floorMatrix(
          beacon.userData.angle as number,
          beacon.userData.across as number,
          2.3 + Math.sin(elapsedSeconds * 0.7 + i) * 0.12,
        );
        beacon.matrix.copy(
          base.multiply(
            new THREE.Matrix4().makeRotationY(elapsedSeconds * 0.18 + i),
          ),
        );
        beacon.matrixWorldNeedsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set<THREE.BufferGeometry>();
      const ownedMaterials = new Set<THREE.Material>(Object.values(materials));
      root.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          geometries.add(object.geometry);
          const objectMaterials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          objectMaterials.forEach((material) => ownedMaterials.add(material));
        }
      });
      geometries.forEach((geometry) => geometry.dispose());
      ownedMaterials.forEach((material) => material.dispose());
      root.removeFromParent();
      if (scene.background === background) scene.background = oldBackground;
      scene.fog = oldFog;
    },
  };
}
