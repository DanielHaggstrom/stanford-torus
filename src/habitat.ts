import * as THREE from "three";
import { buildTramSystem } from "./trams";
import { stationSupportHeight } from "./tram-physics";

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

/** Lighting supplied by the orbital sky, in the habitat's rotating coordinates. */
export interface HabitatLighting {
  sunDirection: { x: number; y: number; z: number };
  sunlight: number;
}

export interface HabitatHandle {
  root: THREE.Group;
  update: (elapsedSeconds: number, lighting?: HabitatLighting) => void;
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
  const floorHeight = stationSupportHeight({
    x: HABITAT_RADIUS * c,
    y: across,
    z: HABITAT_RADIUS * s,
  });
  const radius = HABITAT_RADIUS - height - floorHeight;
  const position = new THREE.Vector3(
    radius * c - tangentOffset * s,
    across,
    radius * s + tangentOffset * c,
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

/** Unit triangular prism: its ridge follows X, and its base lies on Y = 0. */
function pitchedRoofGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -0.5, 0, -0.5, 0.5, 0, -0.5, -0.5, 0, 0.5, 0.5, 0, 0.5, -0.5, 1, 0, 0.5,
        1, 0,
      ],
      3,
    ),
  );
  geometry.setIndex([
    0, 4, 1, 1, 4, 5, 2, 3, 4, 3, 5, 4, 0, 2, 4, 1, 5, 3, 0, 1, 2, 1, 3, 2,
  ]);
  const flatGeometry = geometry.toNonIndexed();
  geometry.dispose();
  flatGeometry.computeVertexNormals();
  return flatGeometry;
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
    pitchedRoof: standard("#b77c67", { flatShading: true }),
    greenhouse: standard("#b3e0d5", {
      roughness: 0.2,
      metalness: 0.23,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
    furniture: standard("#8e725b"),
    clothing: standard("#e8e9e2"),
    skin: standard("#e8e9e2", { roughness: 1 }),
    hair: standard("#e8e9e2", { roughness: 1 }),
    shoes: standard("#384650"),
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

  const hemisphereLight = add(
    new THREE.HemisphereLight("#d9f4ff", "#61735b", 2.1),
  );
  const ambientLight = add(new THREE.AmbientLight("#8cabb9", 0.6));
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
  const pitchedRoofs: Instance[] = [];
  const greenhouseWalls: Instance[] = [];
  const greenhouseRoofs: Instance[] = [];
  const trunks: Instance[] = [];
  const leaves: Instance[] = [];
  const conifers: Instance[] = [];
  const furniture: Instance[] = [];
  const peopleClothing: Instance[] = [];
  const peopleSkin: Instance[] = [];
  const peopleHair: Instance[] = [];
  const peopleShoes: Instance[] = [];
  const peopleArms: Instance[] = [];
  let peopleCount = 0;
  let buildingCount = 0;
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
    const evergreen = random() < 0.27;
    if (evergreen) {
      for (let crown = 0; crown < 3; crown++) {
        conifers.push({
          matrix: floorMatrix(
            angle,
            across,
            height * (0.68 + crown * 0.22),
            new THREE.Vector3(
              (1.3 - crown * 0.27) * variation,
              (1.8 - crown * 0.2) * variation,
              (1.3 - crown * 0.27) * variation,
            ),
          ),
          color: new THREE.Color().setHSL(
            0.39 + random() * 0.035,
            0.26,
            0.32 + random() * 0.08,
          ),
        });
      }
      return;
    }
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

  // Residents use shared low-poly meshes. Their poses are fixed, including
  // conversations and people sitting on benches; no animation or AI is needed.
  const shirtPalette = [
    "#d6a15f",
    "#78aeb0",
    "#b98586",
    "#7794ba",
    "#e2d9ba",
    "#9581b0",
    "#7eaa85",
  ];
  const skinPalette = [
    "#e8bd94",
    "#c58e68",
    "#8d5d43",
    "#f0c9ad",
    "#ae7755",
    "#70503e",
  ];
  const hairPalette = ["#302c2a", "#664d37", "#b69760", "#a5a6a1", "#5d3e31"];
  const placePerson = (
    angle: number,
    across: number,
    facing: number,
    seated = false,
    pose = 0,
  ) => {
    peopleCount++;
    const scale = 0.9 + random() * 0.16;
    const anchor = floorMatrix(angle, across, 0.1)
      .multiply(new THREE.Matrix4().makeRotationY(facing))
      .scale(new THREE.Vector3(scale, scale, scale));
    const shirt = shirtPalette[Math.floor(random() * shirtPalette.length)];
    const skin = skinPalette[Math.floor(random() * skinPalette.length)];
    const hair = hairPalette[Math.floor(random() * hairPalette.length)];
    const trousers = random() < 0.5 ? "#405365" : "#736a5c";
    const part = (
      collection: Instance[],
      position: THREE.Vector3,
      size: THREE.Vector3,
      color: THREE.ColorRepresentation,
    ) =>
      collection.push({
        matrix: anchor
          .clone()
          .multiply(
            new THREE.Matrix4()
              .makeScale(size.x, size.y, size.z)
              .setPosition(position),
          ),
        color,
      });
    const limb = (
      from: THREE.Vector3,
      to: THREE.Vector3,
      color: THREE.ColorRepresentation,
      radius = 0.065,
    ) => {
      peopleArms.push({
        matrix: anchor.clone().multiply(strutMatrix(from, to, radius)),
        color,
      });
    };
    const hip = seated ? 0.56 : 0.84;
    part(
      peopleClothing,
      new THREE.Vector3(0, hip + 0.32, 0),
      new THREE.Vector3(0.42, 0.56, 0.25),
      shirt,
    );
    part(
      peopleClothing,
      new THREE.Vector3(0, hip, 0),
      new THREE.Vector3(0.34, 0.2, 0.24),
      trousers,
    );
    part(
      peopleSkin,
      new THREE.Vector3(0, hip + 0.79, 0),
      new THREE.Vector3(0.145, 0.17, 0.14),
      skin,
    );
    part(
      peopleHair,
      new THREE.Vector3(0, hip + 0.82, -0.012),
      new THREE.Vector3(0.15, 0.17, 0.148),
      hair,
    );
    for (const side of [-1, 1]) {
      if (seated) {
        part(
          peopleClothing,
          new THREE.Vector3(side * 0.11, 0.5, 0.17),
          new THREE.Vector3(0.13, 0.14, 0.38),
          trousers,
        );
        part(
          peopleClothing,
          new THREE.Vector3(side * 0.11, 0.27, 0.33),
          new THREE.Vector3(0.12, 0.42, 0.13),
          trousers,
        );
        part(
          peopleShoes,
          new THREE.Vector3(side * 0.11, 0.07, 0.41),
          new THREE.Vector3(0.16, 0.13, 0.29),
          "#384650",
        );
      } else {
        const step = pose === 2 ? side * 0.1 : 0;
        part(
          peopleClothing,
          new THREE.Vector3(side * 0.11, 0.44, step),
          new THREE.Vector3(0.13, 0.7, 0.15),
          trousers,
        );
        part(
          peopleShoes,
          new THREE.Vector3(side * 0.11, 0.075, step + 0.055),
          new THREE.Vector3(0.16, 0.13, 0.29),
          "#384650",
        );
      }
      const shoulder = new THREE.Vector3(side * 0.25, hip + 0.52, 0);
      const elbow = new THREE.Vector3(
        side * 0.3,
        hip + 0.28,
        seated ? 0.12 : 0.01,
      );
      const hand = new THREE.Vector3(
        side * 0.28,
        hip + 0.04,
        seated ? 0.28 : 0.04,
      );
      if (pose === 1 && side > 0) {
        elbow.set(0.46, hip + 0.33, 0.08);
        hand.set(0.5, hip + 0.59, 0.1);
      }
      limb(shoulder, elbow, shirt, 0.075);
      limb(elbow, hand, skin, 0.058);
    }
  };

  const makeGreenhouse = (
    angle: number,
    across: number,
    width: number,
    depth: number,
  ) => {
    buildingCount++;
    placeBox(greenhouseWalls, angle, across, 1.35, width, 2.5, depth);
    placeBox(
      greenhouseRoofs,
      angle,
      across,
      2.6,
      width + 0.2,
      1.5,
      depth + 0.2,
    );
    placeBox(trims, angle, across, 0.18, width + 0.25, 0.25, depth + 0.25);
    for (const edge of [-1, 1]) {
      placeBox(
        trims,
        angle,
        across + edge * depth * 0.5,
        1.4,
        width + 0.1,
        0.1,
        0.1,
      );
      for (let rib = -1; rib <= 1; rib++) {
        placeBox(
          trims,
          angle,
          across + edge * depth * 0.5,
          1.4,
          0.09,
          2.5,
          0.09,
          undefined,
          rib * width * 0.42,
        );
      }
    }
  };

  // A small number of shared meshes draw a whole inhabited ring. The central
  // seven metres stay clear for walking, jumping and ballistic experiments.
  for (let i = 0; i < 72; i++) {
    const angle = (i / 72) * TAU;
    const district = Math.floor(i / 12);
    for (const side of [-1, 1]) {
      if (i % 2 === 0 && i % 12 !== 0) {
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
      if (i % 12 !== 0)
        plantTree(
          angle + 0.013,
          side * (5.65 + random() * 0.25),
          district === 4 ? 1.17 : 1,
        );
      if (i % 3 !== 0) plantTree(angle + 0.041, side * (19.2 + random()), 0.8);

      // Farming and water districts open into gardens; the other districts
      // alternate compact terraces and taller pale apartment buildings.
      const isFarm = district === 1 && i % 3 !== 0;
      const isPool = district === 2 && i % 3 !== 0;
      const isOrchard = district === 4 && i % 3 !== 0;
      if (isFarm) {
        if ((i + (side > 0 ? 1 : 0)) % 4 === 0) {
          makeGreenhouse(
            angle + (random() - 0.5) * 0.009,
            side * 16.1,
            10.5,
            6,
          );
          continue;
        }
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
        buildingCount++;
        const buildingAngle = angle + (random() - 0.5) * 0.018;
        const width = 5.4 + random() * 5.8;
        const depth = 4.8 + random() * 1.7;
        const across = side * (15.9 + random() * 0.75);
        const style = Math.floor(random() * 6);
        const height =
          style === 2
            ? 8.5 + random() * 5.5
            : style === 1 || style === 4
              ? 3 + random() * 1.8
              : 4.2 + random() * 4;
        const facadePalette = [
          "#e8dfc7",
          "#c9dcd5",
          "#d4d7e1",
          "#e2bfa5",
          "#b9c5c4",
          "#d8cfb5",
          "#e5dacf",
        ];
        const facade =
          facadePalette[Math.floor(random() * facadePalette.length)];
        const roofColor = ["#bb8069", "#718d91", "#778687", "#bdac83"][
          Math.floor(random() * 4)
        ];
        const facadeAcross = across - side * (depth / 2 + 0.035);
        placeBox(
          trims,
          buildingAngle,
          across,
          0.25,
          width + 0.7,
          0.35,
          depth + 0.6,
        );

        if (style === 4) {
          // Open U-shaped courtyard homes, with a planted centre and two wings.
          const wingWidth = width * 0.25;
          for (const edge of [-1, 1]) {
            placeBox(
              boxes,
              buildingAngle,
              across,
              height / 2 + 0.1,
              wingWidth,
              height,
              depth,
              facade,
              edge * width * 0.36,
            );
            placeBox(
              pitchedRoofs,
              buildingAngle,
              across,
              height + 0.1,
              wingWidth + 0.3,
              0.9,
              depth + 0.3,
              roofColor,
              edge * width * 0.36,
            );
            placeBox(
              glass,
              buildingAngle,
              facadeAcross,
              1.8,
              wingWidth * 0.65,
              1.15,
              0.06,
              undefined,
              edge * width * 0.36,
            );
          }
          placeBox(
            boxes,
            buildingAngle,
            across + side * depth * 0.35,
            height / 2 + 0.1,
            width,
            height,
            depth * 0.3,
            facade,
          );
          placeBox(
            roofGardens,
            buildingAngle,
            across - side * 0.4,
            0.32,
            width * 0.35,
            0.4,
            depth * 0.42,
          );
        } else if (style === 5) {
          // An airy civic pavilion with a cantilevered solar canopy.
          for (const edge of [-1, 1]) {
            for (const end of [-1, 1]) {
              placeBox(
                trims,
                buildingAngle,
                across + end * depth * 0.37,
                height / 2,
                0.25,
                height,
                0.25,
                undefined,
                edge * width * 0.4,
              );
            }
          }
          placeBox(
            boxes,
            buildingAngle,
            across + side * depth * 0.3,
            height * 0.28,
            width * 0.8,
            height * 0.54,
            depth * 0.28,
            facade,
          );
          placeBox(
            trims,
            buildingAngle,
            across,
            height,
            width + 0.9,
            0.3,
            depth + 0.7,
          );
          placeBox(
            roofs,
            buildingAngle,
            across,
            height + 0.22,
            width + 0.5,
            0.12,
            depth + 0.3,
          );
        } else {
          placeBox(
            boxes,
            buildingAngle,
            across,
            height / 2 + 0.11,
            width,
            height,
            depth,
            facade,
          );
          const levels = Math.max(1, Math.floor(height / 2.6));
          for (let level = 0; level < levels; level++) {
            const floorHeight = 1.65 + level * 2.5;
            if (style === 1 || style === 3) {
              // Separate windows and balcony decks break up long banded facades.
              const bays = Math.max(2, Math.floor(width / 2.2));
              for (let bay = 0; bay < bays; bay++) {
                const offset = ((bay + 0.5) / bays - 0.5) * width * 0.87;
                placeBox(
                  glass,
                  buildingAngle,
                  facadeAcross,
                  floorHeight,
                  (width * 0.62) / bays,
                  1.1,
                  0.07,
                  undefined,
                  offset,
                );
                if (style === 3 && level > 0) {
                  placeBox(
                    trims,
                    buildingAngle,
                    facadeAcross - side * 0.42,
                    floorHeight - 0.7,
                    (width * 0.8) / bays,
                    0.14,
                    1.05,
                    undefined,
                    offset,
                  );
                  placeBox(
                    trims,
                    buildingAngle,
                    facadeAcross - side * 0.9,
                    floorHeight - 0.23,
                    (width * 0.8) / bays,
                    0.08,
                    0.08,
                    undefined,
                    offset,
                  );
                }
              }
            } else {
              placeBox(
                glass,
                buildingAngle,
                facadeAcross,
                floorHeight,
                width * 0.86,
                0.95,
                0.06,
              );
              placeBox(
                trims,
                buildingAngle,
                facadeAcross - side * 0.12,
                floorHeight - 0.55,
                width * 0.95,
                0.13,
                0.4,
              );
            }
          }
          placeBox(
            trims,
            buildingAngle,
            across,
            height + 0.15,
            width + 0.35,
            0.25,
            depth + 0.35,
          );
          if (style === 1) {
            placeBox(
              pitchedRoofs,
              buildingAngle,
              across,
              height + 0.25,
              width + 0.65,
              1.5 + random(),
              depth + 0.65,
              roofColor,
            );
          } else if (style === 2) {
            // Taller, stepped towers have offset upper levels and rooftop gardens.
            const crownHeight = 1.5 + random() * 2;
            const crownOffset = (random() - 0.5) * width * 0.26;
            placeBox(
              boxes,
              buildingAngle,
              across + side * 0.4,
              height + crownHeight / 2 + 0.3,
              width * 0.64,
              crownHeight,
              depth * 0.72,
              facade,
              crownOffset,
            );
            placeBox(
              glass,
              buildingAngle,
              across - side * (depth * 0.36 - 0.38),
              height + crownHeight * 0.55 + 0.3,
              width * 0.54,
              0.8,
              0.08,
              undefined,
              crownOffset,
            );
            placeBox(
              roofs,
              buildingAngle,
              across + side * 0.4,
              height + crownHeight + 0.4,
              width * 0.69,
              0.15,
              depth * 0.77,
              undefined,
              crownOffset,
            );
            placeBox(
              roofGardens,
              buildingAngle,
              across - side * depth * 0.33,
              height + 0.43,
              width * 0.83,
              0.32,
              depth * 0.18,
            );
          } else {
            placeBox(
              roofs,
              buildingAngle,
              across + side * depth * 0.22,
              height + 0.36,
              width * 0.82,
              0.12,
              depth * 0.36,
            );
            placeBox(
              roofGardens,
              buildingAngle,
              across - side * depth * 0.22,
              height + 0.4,
              width * 0.78,
              0.23,
              depth * 0.27,
            );
            if (style === 0) {
              placeBox(
                boxes,
                buildingAngle,
                across + side * 0.3,
                height + 0.95,
                width * 0.4,
                1.6,
                depth * 0.45,
                facade,
                width * 0.18,
              );
            }
          }
          // Entrances face the side paths, and canopies vary independently.
          placeBox(
            glass,
            buildingAngle,
            facadeAcross - side * 0.03,
            1.05,
            0.95,
            1.85,
            0.08,
            undefined,
            -width * 0.2,
          );
          if (random() < 0.7)
            placeBox(
              trims,
              buildingAngle,
              facadeAcross - side * 0.55,
              2.25,
              2.0,
              0.14,
              1.2,
              undefined,
              -width * 0.2,
            );
        }
      }
    }
    // Offset small groups along lawns instead of filling the clear promenade.
    if (i % 3 === 0) {
      const side = random() < 0.5 ? -1 : 1;
      const personAngle = angle + 0.028 + random() * 0.015;
      const facing = side > 0 ? 0 : Math.PI;
      placePerson(personAngle, side * 5.75, facing + 0.45, false, i % 2);
      if (i % 2 === 0)
        placePerson(personAngle + 0.0045, side * 6.4, facing - 0.7, false, 1);
      if (i % 4 === 0)
        placePerson(personAngle - 0.0045, side * 6.8, facing + 1.2, false, 2);
    }
    if (i % 5 === 2) {
      const side = random() < 0.5 ? -1 : 1;
      const benchAngle = angle + 0.026;
      const benchAcross = side * 6.6;
      placeBox(furniture, benchAngle, benchAcross, 0.55, 2.5, 0.14, 0.7);
      placeBox(
        furniture,
        benchAngle,
        benchAcross + side * 0.3,
        0.96,
        2.5,
        0.75,
        0.12,
      );
      for (const edge of [-1, 1])
        placeBox(
          trims,
          benchAngle,
          benchAcross,
          0.29,
          0.12,
          0.5,
          0.6,
          undefined,
          edge * 0.95,
        );
      placePerson(
        benchAngle,
        benchAcross - side * 0.02,
        side > 0 ? 0 : Math.PI,
        true,
      );
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
    const sculptureAcross = index % 2 === 0 ? -6.4 : 6.4;
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
  const roofGeometry = pitchedRoofGeometry();
  instances(roofGeometry, materials.pitchedRoof, pitchedRoofs);
  instances(boxGeometry, materials.greenhouse, greenhouseWalls);
  instances(roofGeometry, materials.greenhouse, greenhouseRoofs);
  instances(new THREE.CylinderGeometry(1, 0.8, 1, 6), materials.trunk, trunks);
  instances(new THREE.IcosahedronGeometry(1, 1), materials.leaves, leaves);
  instances(new THREE.ConeGeometry(1, 1, 6), materials.leaves, conifers);
  instances(boxGeometry, materials.furniture, furniture);
  instances(boxGeometry, materials.clothing, peopleClothing);
  instances(new THREE.SphereGeometry(1, 6, 4), materials.skin, peopleSkin);
  instances(
    new THREE.SphereGeometry(1, 6, 3, 0, TAU, 0, Math.PI * 0.52),
    materials.hair,
    peopleHair,
  );
  instances(boxGeometry, materials.shoes, peopleShoes);
  instances(
    new THREE.CylinderGeometry(1, 1, 1, 5),
    materials.clothing,
    peopleArms,
  );
  root.userData.peopleCount = peopleCount;
  root.userData.buildingCount = buildingCount;
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

  const trams = buildTramSystem(root, HABITAT_DISTRICTS);
  trams.update(0);
  let disposed = false;
  return {
    root,
    update(elapsedSeconds, lighting) {
      if (disposed) return;
      trams.update(elapsedSeconds);
      if (lighting) {
        const daylight = THREE.MathUtils.clamp(lighting.sunlight, 0, 1);
        sunLight.position
          .copy(lighting.sunDirection)
          .normalize()
          .multiplyScalar(1000);
        sunLight.intensity = 2.35 * daylight;
        // The station's own lights keep its interior navigable during eclipse.
        hemisphereLight.intensity = 0.75 + 1.35 * daylight;
        ambientLight.intensity = 0.32 + 0.28 * daylight;
      }
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
      trams.dispose();
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
