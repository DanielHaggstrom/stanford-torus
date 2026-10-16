import * as THREE from "three";

type FacilityMaterials = {
  structure: THREE.Material;
  trim: THREE.Material;
  hub: THREE.Material;
  cyan: THREE.Material;
};
type Part = { matrix: THREE.Matrix4 };
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

function part(position: THREE.Vector3, scale: THREE.Vector3, rotation = new THREE.Quaternion()): Part {
  return { matrix: new THREE.Matrix4().compose(position, rotation, scale) };
}

function tube(a: THREE.Vector3, b: THREE.Vector3, radius: number): Part {
  const axis = b.clone().sub(a);
  return part(a.clone().add(b).multiplyScalar(0.5), new THREE.Vector3(radius, axis.length(), radius),
    new THREE.Quaternion().setFromUnitVectors(Y, axis.normalize()));
}

/** The profile reaches the axis at both ends, sealing the pressure vessel. */
function pressureBarrel(): THREE.LatheGeometry {
  return new THREE.LatheGeometry([
    new THREE.Vector2(0, -0.5), new THREE.Vector2(0.35, -0.495),
    new THREE.Vector2(0.73, -0.47), new THREE.Vector2(0.95, -0.42),
    new THREE.Vector2(1, -0.36), new THREE.Vector2(1, 0.36),
    new THREE.Vector2(0.95, 0.42), new THREE.Vector2(0.73, 0.47),
    new THREE.Vector2(0.35, 0.495), new THREE.Vector2(0, 0.5),
  ], 24);
}

/** Closed orbital modules, airlocks and docking hardware on the facility end. */
export function buildAxisFacility(parent: THREE.Group, materials: FacilityMaterials): THREE.Group {
  const root = new THREE.Group();
  root.name = "Pressurized orbital facility";
  parent.add(root);
  const pressure = new THREE.MeshStandardMaterial({ color: "#ced7d2", roughness: 0.65, metalness: 0.25 });
  const hatch = new THREE.MeshStandardMaterial({ color: "#40585f", roughness: 0.55, metalness: 0.6 });
  const porthole = new THREE.MeshStandardMaterial({ color: "#1d353e", emissive: "#15363d", emissiveIntensity: 0.2, roughness: 0.4, metalness: 0.4 });
  const status = new THREE.MeshStandardMaterial({ color: "#d4ebba", emissive: "#bddf9f", emissiveIntensity: 0.7, roughness: 0.6 });
  const hazard = new THREE.MeshStandardMaterial({ color: "#c7a65e", roughness: 0.65, metalness: 0.35 });
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 24);
  const cube = new THREE.BoxGeometry();
  const instances = (geometry: THREE.BufferGeometry, material: THREE.Material, parts: Part[], name: string) => {
    const object = new THREE.InstancedMesh(geometry, material, parts.length);
    object.name = name;
    parts.forEach((value, index) => object.setMatrixAt(index, value.matrix));
    object.computeBoundingSphere();
    root.add(object);
    return object;
  };
  const vessels: Part[] = [];
  const corridors: Part[] = [];
  const bands: Part[] = [];
  const equipment: Part[] = [];
  const windows: Part[] = [];
  const fixtures: Part[] = [];
  const trusses: Part[] = [];
  const flat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const modules = [
    { x: 0, y: -65, z: 0, radius: 14, length: 44 },
    { x: 0, y: -107, z: 0, radius: 10, length: 40 },
    { x: 0, y: -143, z: 0, radius: 8, length: 30 },
    { x: -21, y: -105, z: 0, radius: 6, length: 39 },
    { x: 20, y: -104, z: 0, radius: 7, length: 42 },
    { x: 0, y: -116, z: -20, radius: 5.5, length: 32 },
    { x: 0, y: -116, z: 20, radius: 5.5, length: 32 },
  ];
  for (const module of modules) {
    vessels.push(part(new THREE.Vector3(module.x, module.y, module.z), new THREE.Vector3(module.radius, module.length, module.radius)));
    for (const offset of [-0.32, 0.32]) bands.push(part(
      new THREE.Vector3(module.x, module.y + module.length * offset, module.z),
      new THREE.Vector3(module.radius + 0.08, module.radius + 0.08, module.radius + 0.08), flat,
    ));
  }
  // An enclosed transfer neck meets the habitat bearing. A sealed axial
  // passage continues through the barrels, joining their domed end sections.
  corridors.push(tube(new THREE.Vector3(0, -23, 0), new THREE.Vector3(0, -42.5, 0), 7.4));
  corridors.push(tube(new THREE.Vector3(0, -30, 0), new THREE.Vector3(0, -158, 0), 5));
  for (const [x, z] of [[-21, 0], [20, 0], [0, -20], [0, 20]]) {
    corridors.push(tube(new THREE.Vector3(0, -103, 0), new THREE.Vector3(x, -103, z), 3.2));
    trusses.push(tube(new THREE.Vector3(0, -85, 0), new THREE.Vector3(x, -98, z), 0.36));
    trusses.push(tube(new THREE.Vector3(0, -139, 0), new THREE.Vector3(x, -122, z), 0.36));
  }
  for (let window = 0; window < 12; window++) {
    const angle = window / 12 * Math.PI * 2;
    const rotation = new THREE.Quaternion().setFromAxisAngle(Y, angle);
    windows.push(part(new THREE.Vector3(Math.sin(angle) * 14.07, -57, Math.cos(angle) * 14.07),
      new THREE.Vector3(1.6, 2.7, 0.18), rotation));
  }
  for (const side of [-1, 1]) {
    for (const y of [-51, -69, -95]) {
      equipment.push(part(new THREE.Vector3(side * 11.5, y, 10), new THREE.Vector3(3.3, 5, 3)));
      fixtures.push(part(new THREE.Vector3(side * 13.2, y + 2, 11.6), new THREE.Vector3(0.3, 0.8, 0.25)));
    }
    const mastEnd = new THREE.Vector3(side * 19, -178, 9);
    trusses.push(tube(new THREE.Vector3(side * 7, -147, 5), mastEnd, 0.17));
    trusses.push(tube(new THREE.Vector3(side * 16.5, -173, 9), new THREE.Vector3(side * 21.5, -173, 9), 0.1));
    trusses.push(tube(new THREE.Vector3(side * 17, -170, 9), new THREE.Vector3(side * 21, -170, 9), 0.1));
    fixtures.push(part(mastEnd, new THREE.Vector3(0.4, 0.6, 0.4)));
  }

  const chambers: Part[] = [];
  const docking: Part[] = [];
  const flanges: Part[] = [];
  const hatches: Part[] = [];
  const latches: Part[] = [];
  const warnings: Part[] = [];
  const closedLock = (center: THREE.Vector3, direction: THREE.Vector3, radius: number, length: number, dock = false) => {
    const rotation = new THREE.Quaternion().setFromUnitVectors(Y, direction);
    (dock ? docking : chambers).push(part(center, new THREE.Vector3(radius, length, radius), rotation));
    const outside = center.clone().addScaledVector(direction, length / 2 + 0.16);
    const torusRotation = new THREE.Quaternion().setFromUnitVectors(Z, direction);
    for (const offset of [-length / 2 + 0.3, length / 2 - 0.1]) flanges.push(part(
      center.clone().addScaledVector(direction, offset), new THREE.Vector3(radius + 0.2, radius + 0.2, radius + 0.2), torusRotation,
    ));
    hatches.push(part(outside, new THREE.Vector3(radius * 0.84, 0.22, radius * 0.84), rotation));
    const door = new THREE.Matrix4().compose(outside, rotation, new THREE.Vector3(1, 1, 1));
    const doorPart = (x: number, z: number, sx: number, sz: number): Part => {
      const local = part(new THREE.Vector3(x, 0.18, z), new THREE.Vector3(sx, 0.14, sz));
      return { matrix: door.clone().multiply(local.matrix) };
    };
    latches.push(doorPart(0, 0, radius * 1.25, 0.22));
    latches.push(doorPart(0, 0, 0.22, radius * 1.25));
    for (const sign of [-1, 1]) {
      warnings.push(doorPart(sign * radius * 0.8, 0, 0.22, radius * 0.65));
      const local = part(new THREE.Vector3(sign * radius * 0.66, 0.19, radius * 0.48), new THREE.Vector3(0.26, 0.15, 0.36));
      fixtures.push({ matrix: door.clone().multiply(local.matrix) });
    }
  };
  // Four radial pressure locks are shut; the opaque barrel remains behind
  // them. Each lock has a flange, a distinct circular hatch and latch bars.
  for (const side of [-1, 1]) {
    closedLock(new THREE.Vector3(side * 18, -64, 0), new THREE.Vector3(side, 0, 0), 3.3, 8);
    closedLock(new THREE.Vector3(0, -78, side * 18), new THREE.Vector3(0, 0, side), 3.3, 8);
  }
  closedLock(new THREE.Vector3(0, -163, 0), new THREE.Vector3(0, -1, 0), 4, 12, true);
  closedLock(new THREE.Vector3(20, -128, 0), new THREE.Vector3(0, -1, 0), 3.4, 12, true);

  instances(pressureBarrel(), pressure, vessels, "Closed pressure-vessel modules");
  instances(cylinder, pressure, corridors, "Sealed transfer passages");
  instances(cylinder, pressure, chambers, "Airlock pressure chambers");
  instances(cylinder, materials.structure, docking, "Facility docking collars");
  instances(new THREE.TorusGeometry(1, 0.025, 5, 24), materials.trim, bands, "Pressure-vessel structural bands");
  instances(new THREE.TorusGeometry(1, 0.065, 5, 24), materials.structure, flanges, "Pressure-lock flange rings");
  instances(cylinder, hatch, hatches, "Closed airlock and docking hatches");
  instances(cube, materials.structure, latches, "Pressure-hatch latch bars");
  instances(cube, hazard, warnings, "Airlock identification strips");
  instances(cube, materials.trim, equipment, "External facility service equipment");
  instances(cube, porthole, windows, "Sealed facility portholes");
  instances(cube, status, fixtures, "Facility service and approach lights");
  instances(new THREE.CylinderGeometry(1, 1, 1, 6), materials.structure, trusses, "Facility antenna masts and exterior trusses");
  return root;
}
