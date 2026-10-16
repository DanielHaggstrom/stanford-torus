import * as THREE from "three";
import { ANGULAR_SPEED } from "./physics.ts";
import { getAxisPose } from "./axis-tracking.ts";

type AxisMaterials = {
  structure: THREE.Material;
  trim: THREE.Material;
  hub: THREE.Material;
  glass: THREE.Material;
  cyan: THREE.Material;
};
type Part = { matrix: THREE.Matrix4 };
export interface AxisStructureHandle {
  root: THREE.Group;
  update: (elapsedSeconds: number) => void;
}
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const WING_SPAN = 56;
const WING_WIDTH = 22;
const WING_ROWS = [-142, -103, -64, 64, 103, 142];

function box(x: number, y: number, z: number, sx: number, sy: number, sz: number): Part {
  return { matrix: new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz),
  ) };
}

function strut(a: THREE.Vector3, b: THREE.Vector3, width: number): Part {
  const direction = b.clone().sub(a);
  return { matrix: new THREE.Matrix4().compose(
    a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(Y, direction.clone().normalize()),
    new THREE.Vector3(width, direction.length(), width),
  ) };
}

/** A reusable wing's frame components merge into one instanced draw. */
function boxDetails(parts: Part[]): THREE.BufferGeometry {
  const cube = new THREE.BoxGeometry().toNonIndexed();
  const vertices = cube.getAttribute("position");
  const normals = cube.getAttribute("normal");
  const positions: number[] = [];
  const directions: number[] = [];
  const point = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  for (const part of parts) {
    normalMatrix.getNormalMatrix(part.matrix);
    for (let i = 0; i < vertices.count; i++) {
      point.fromBufferAttribute(vertices, i).applyMatrix4(part.matrix);
      positions.push(point.x, point.y, point.z);
      point.fromBufferAttribute(normals, i).applyMatrix3(normalMatrix).normalize();
      directions.push(point.x, point.y, point.z);
    }
  }
  cube.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(directions, 3));
  return geometry;
}

/** Cell seams and radiator channels share their skin's depth and fade below a pixel. */
function panelMaterial(kind: "solar" | "radiator"): THREE.MeshStandardMaterial {
  const solar = kind === "solar";
  const material = new THREE.MeshStandardMaterial({
    color: solar ? "#204868" : "#d8ddd5",
    roughness: solar ? 0.45 : 0.78,
    metalness: solar ? 0.6 : 0.2,
  });
  material.customProgramCacheKey = () => `panel-skin-${kind}`;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vPanelPosition;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPanelPosition = position.xy;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vPanelPosition;")
      .replace("#include <color_fragment>", solar ? `
        #include <color_fragment>
        vec2 cell = (vPanelPosition + vec2(26.95, 10.075)) / vec2(3.85, 4.03);
        vec2 footprint = max(fwidth(cell), vec2(0.00001));
        vec2 edgeDistance = min(fract(cell), 1.0 - fract(cell));
        vec2 interior = smoothstep(vec2(0.018) - footprint, vec2(0.018) + footprint, edgeDistance);
        float detail = 1.0 - smoothstep(0.18, 0.5, max(footprint.x, footprint.y));
        float seam = (1.0 - interior.x * interior.y) * detail;
        float variation = mod(floor(cell.x) * 3.0 + floor(cell.y), 4.0) / 3.0;
        diffuseColor.rgb *= mix(vec3(0.82, 0.9, 0.94), vec3(1.1, 1.05, 1.04), mix(0.5, variation, detail));
        diffuseColor.rgb *= 1.0 - seam * 0.42;
      ` : `
        #include <color_fragment>
        float channel = vPanelPosition.x / 2.0;
        float footprint = max(fwidth(channel), 0.00001);
        float edgeDistance = abs(fract(channel + 0.5) - 0.5);
        float detail = 1.0 - smoothstep(0.18, 0.5, footprint);
        float rib = 1.0 - smoothstep(0.035 - footprint, 0.035 + footprint, edgeDistance);
        diffuseColor.rgb *= 1.0 - rib * detail * 0.2;
      `);
  };
  return material;
}

function dishGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const radialSlices = 6;
  const sectors = 24;
  for (let ring = 0; ring <= radialSlices; ring++) {
    const radius = ring / radialSlices * 3.4;
    for (let sector = 0; sector <= sectors; sector++) {
      const angle = sector / sectors * Math.PI * 2;
      positions.push(radius * Math.cos(angle), radius * Math.sin(angle), 0.095 * radius * radius);
      if (ring < radialSlices && sector < sectors) {
        const a = ring * (sectors + 1) + sector;
        const b = a + sectors + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** The bearing-mounted service spine is independent of habitat rotation. */
export function buildAxisStructure(parent: THREE.Group, materials: AxisMaterials): AxisStructureHandle {
  const root = new THREE.Group();
  root.name = "Independent service axis";
  parent.add(root);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 6);
  const cube = new THREE.BoxGeometry();
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    root.add(object);
    return object;
  };
  const instances = (geometry: THREE.BufferGeometry, material: THREE.Material, parts: Part[], name: string) => {
    const object = new THREE.InstancedMesh(geometry, material, parts.length);
    object.name = name;
    parts.forEach((part, index) => object.setMatrixAt(index, part.matrix));
    object.computeBoundingSphere();
    root.add(object);
    return object;
  };

  const core = mesh(new THREE.CylinderGeometry(10.9, 10.9, 47, 24), materials.hub, "Stationary bearing hub");
  core.userData.component = "axis";
  const longerons: Part[] = [];
  const braces: Part[] = [];
  const joints: Part[] = [];
  const ports: Part[] = [];
  const lights: Part[] = [];
  for (const side of [-1, 1]) {
    const shoulder = mesh(new THREE.CylinderGeometry(side > 0 ? 4.4 : 10.8, side > 0 ? 10.8 : 4.4, 8, 24), materials.hub, "Hub service shoulder");
    shoulder.position.y = side * 27.5;
    const conduit = mesh(new THREE.CylinderGeometry(2.65, 2.65, 136, 12), materials.hub, "Axial service conduit");
    conduit.position.y = side * 101;
    for (let corner = 0; corner < 4; corner++) {
      const x = corner < 2 ? -4.6 : 4.6;
      const z = corner % 2 === 0 ? -4.6 : 4.6;
      longerons.push(strut(new THREE.Vector3(x, side * 32, z), new THREE.Vector3(x, side * 168, z), 0.4));
      for (let bay = 0; bay < 12; bay++) {
        const y = side * (32 + bay * 136 / 12);
        const nextY = side * (32 + (bay + 1) * 136 / 12);
        const nextX = corner === 0 || corner === 3 ? -x : x;
        const nextZ = corner === 0 || corner === 3 ? z : -z;
        braces.push(strut(new THREE.Vector3(x, y, z), new THREE.Vector3(nextX, y, nextZ), 0.18));
        braces.push(strut(new THREE.Vector3(x, y, z), new THREE.Vector3(nextX, nextY, nextZ), 0.13));
        if (bay % 3 === 0) joints.push(box(x, y, z, 0.8, 0.8, 0.8));
      }
    }
    // Docking ports terminate the spine, beyond the thermal array wings.
    const docking = mesh(new THREE.CylinderGeometry(3.8, 3.8, 3.5, 20), materials.structure, "Axial docking collar");
    docking.position.y = side * 169.5;
    const hatch = mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.15, 20), materials.glass, "Docking hatch");
    hatch.position.y = side * 171.3;
    for (const corner of [-1, 1]) {
      longerons.push(strut(new THREE.Vector3(corner * 4.6, side * 156, 4.6), new THREE.Vector3(corner * 9.5, side * 176, 4.6), 0.14));
      braces.push(strut(new THREE.Vector3(corner * 8.5, side * 172, 4.6), new THREE.Vector3(corner * 11.5, side * 172, 4.6), 0.1));
      lights.push(box(corner * 9.5, side * 176, 4.6, 0.4, 0.65, 0.4));
    }
    for (let hatchIndex = 0; hatchIndex < 8; hatchIndex++) {
      const angle = hatchIndex / 8 * Math.PI * 2;
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.sin(angle) * 10.95, side * 14, Math.cos(angle) * 10.95),
        new THREE.Quaternion().setFromAxisAngle(Y, angle), new THREE.Vector3(1.7, 3.1, 0.15),
      );
      ports.push({ matrix });
    }
  }
  for (const y of WING_ROWS) {
    longerons.push(strut(new THREE.Vector3(-40, y, 0), new THREE.Vector3(40, y, 0), 0.6));
    for (const side of [-1, 1]) {
      braces.push(strut(new THREE.Vector3(side * 4.6, y - 6, 4.6), new THREE.Vector3(side * 12, y, 0), 0.23));
      braces.push(strut(new THREE.Vector3(side * 4.6, y + 6, -4.6), new THREE.Vector3(side * 12, y, 0), 0.23));
      joints.push(box(side * 10.5, y, 0, 1.8, 2.2, 2.2));
    }
  }
  instances(cylinder, materials.structure, longerons, "Service-spine longerons and array axles");
  instances(cylinder, materials.trim, braces, "Service-spine lattice and antenna supports");
  instances(cube, materials.hub, joints, "Array drive housings and truss nodes");
  instances(cube, materials.glass, ports, "Service hub access hatches");
  instances(cube, materials.cyan, lights, "Antenna tip lights");

  const dishMaterial = new THREE.MeshStandardMaterial({ color: "#d9dfd8", roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide });
  const dishParts: Part[] = [];
  const dishSupportParts: Part[] = [];
  for (const side of [-1, 1]) {
    for (const arm of [-1, 1]) {
      const position = new THREE.Vector3(arm * 16, side * 43, 2);
      const rotation = new THREE.Quaternion().setFromUnitVectors(Z, new THREE.Vector3(arm * 0.8, 0, 0.6));
      dishParts.push({ matrix: new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1)) });
      const toWorld = (point: THREE.Vector3) => point.applyQuaternion(rotation).add(position);
      dishSupportParts.push(strut(new THREE.Vector3(arm * 4.6, side * 40, 0), position, 0.38));
      for (let support = 0; support < 3; support++) {
        const angle = support / 3 * Math.PI * 2;
        dishSupportParts.push(strut(toWorld(new THREE.Vector3(3.2 * Math.cos(angle), 3.2 * Math.sin(angle), 1.05)), toWorld(new THREE.Vector3(0, 0, 2.7)), 0.09));
      }
      dishSupportParts.push(strut(toWorld(new THREE.Vector3(0, 0, 2.35)), toWorld(new THREE.Vector3(0, 0, 3.1)), 0.4));
    }
  }
  instances(dishGeometry(), dishMaterial, dishParts, "Communications dishes");
  instances(cylinder, materials.structure, dishSupportParts, "Dish feeds and mounts");

  const solar = panelMaterial("solar");
  const radiator = panelMaterial("radiator");
  const edge = new THREE.MeshStandardMaterial({ color: "#899a9f", roughness: 0.42, metalness: 0.7 });
  const panelBases: Part[] = WING_ROWS.flatMap((y) => [-1, 1].map((side) => box(side * 40, y, 0, 1, 1, 1)));
  const wingMeshes: THREE.InstancedMesh[] = [];
  const wing = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const object = instances(geometry, material, panelBases, name);
    object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // A wing can tilt through 90 degrees; its rest-pose bounds are insufficient.
    object.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 177);
    wingMeshes.push(object);
    return object;
  };
  // The perimeter closes the two skins. A solid box behind them would compete
  // for the same depth-buffer values when viewed from the habitat.
  const frameParts = [
    box(0, -10.7, 0, WING_SPAN, 0.6, 0.65), box(0, 10.7, 0, WING_SPAN, 0.6, 0.65),
    box(-27.7, 0, 0, 0.6, WING_WIDTH, 0.65), box(27.7, 0, 0, 0.6, WING_WIDTH, 0.65),
  ];
  wing(boxDetails(frameParts), edge, "Solar-radiator wing substrates");
  wing(new THREE.PlaneGeometry(54.8, 20.8).translate(0, 0, 0.2), solar, "Sun-facing solar cells");
  const reverse = new THREE.PlaneGeometry(54.8, 20.8).rotateY(Math.PI).translate(0, 0, -0.2);
  wing(reverse, radiator, "Shaded radiator faces");

  const hinge = new THREE.Matrix4();
  const matrix = new THREE.Matrix4();
  let previousTilt = NaN;
  const handle: AxisStructureHandle = {
    root,
    update(elapsedSeconds) {
      const pose = getAxisPose(elapsedSeconds);
      // The parent follows habitat spin in orbit view. The same compensation
      // also gives a stationary inertial axis when seen from its rotating deck.
      root.rotation.y = pose.yaw - ANGULAR_SPEED * elapsedSeconds;
      if (pose.tilt !== previousTilt) {
        hinge.makeRotationX(pose.tilt);
        for (let index = 0; index < panelBases.length; index++) {
          matrix.multiplyMatrices(panelBases[index].matrix, hinge);
          for (const object of wingMeshes) object.setMatrixAt(index, matrix);
        }
        for (const object of wingMeshes) object.instanceMatrix.needsUpdate = true;
        previousTilt = pose.tilt;
      }
    },
  };
  handle.update(0);
  return handle;
}
