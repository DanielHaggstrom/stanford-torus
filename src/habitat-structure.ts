import * as THREE from "three";
import { FLOOR_RADIUS } from "./physics.ts";
import { ENCLOSURE_HEIGHT, ENCLOSURE_HALF_WIDTH } from "./habitat-volume.ts";

type StructureMaterials = {
  structure: THREE.Material;
  trim: THREE.Material;
  hub: THREE.Material;
  glass: THREE.Material;
  roofGlass: THREE.Material;
  cyan: THREE.Material;
};
type Part = { matrix: THREE.Matrix4; color?: THREE.ColorRepresentation };
const TAU = Math.PI * 2;
const Y = new THREE.Vector3(0, 1, 0);

/** Shared, low-poly structural parts; the canopy remains transparent from inside. */
export function buildHabitatStructure(
  root: THREE.Group,
  materials: StructureMaterials,
): void {
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const object = new THREE.Mesh(geometry, material);
    root.add(object);
    return object;
  };
  const instances = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parts: Part[],
  ) => {
    const object = new THREE.InstancedMesh(geometry, material, parts.length);
    const color = new THREE.Color();
    parts.forEach((part, index) => {
      object.setMatrixAt(index, part.matrix);
      if (part.color !== undefined) object.setColorAt(index, color.set(part.color));
    });
    object.computeBoundingSphere();
    root.add(object);
    return object;
  };
  const strut = (a: THREE.Vector3, b: THREE.Vector3, width: number) => {
    const direction = b.clone().sub(a);
    return new THREE.Matrix4().compose(
      a.clone().add(b).multiplyScalar(0.5),
      new THREE.Quaternion().setFromUnitVectors(Y, direction.clone().normalize()),
      new THREE.Vector3(width, direction.length(), width),
    );
  };
  const box = (position: THREE.Vector3, size: THREE.Vector3, angle = 0) =>
    new THREE.Matrix4().compose(
      position,
      new THREE.Quaternion().setFromAxisAngle(Y, -angle),
      size,
    );
  const ring = (radius: number, width: number, across: number, material: THREE.Material) => {
    const object = mesh(new THREE.TorusGeometry(radius, width, 5, 128), material);
    object.rotation.x = Math.PI / 2;
    object.position.y = across;
    return object;
  };
  const archPoint = (angle: number, t: number, hull = false) => {
    const radius = FLOOR_RADIUS + (hull ? 3.2 : -ENCLOSURE_HEIGHT) * Math.sin(t);
    return new THREE.Vector3(
      radius * Math.cos(angle),
      -ENCLOSURE_HALF_WIDTH * Math.cos(t),
      radius * Math.sin(angle),
    );
  };
  const shell = (hull: boolean) => {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const sectors = 96;
    const slices = hull ? 12 : 24;
    const color = new THREE.Color();
    // Duplicate vertices at each bay so subtle panel colour changes stay crisp.
    for (let bay = 0; bay < sectors; bay++) {
      const shade = ["#9bacae", "#b9c6c4", "#acbabb", "#b1bfbc"][Math.floor(bay / 2) % 4];
      color.set(shade);
      for (let slice = 0; slice < slices; slice++) {
        const base = positions.length / 3;
        for (const [a, t] of [
          [bay / sectors, slice / slices],
          [(bay + 1) / sectors, slice / slices],
          [bay / sectors, (slice + 1) / slices],
          [(bay + 1) / sectors, (slice + 1) / slices],
        ]) {
          const point = archPoint(a * TAU, t * Math.PI, hull);
          positions.push(point.x, point.y, point.z);
          colors.push(color.r, color.g, color.b);
        }
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    if (hull) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  };

  // An armoured shallow underside closes the pressure vessel below its deck.
  const hullMaterial = new THREE.MeshStandardMaterial({
    color: "#ffffff", vertexColors: true, side: THREE.DoubleSide,
    metalness: 0.4, roughness: 0.68,
  });
  mesh(shell(true), hullMaterial).name = "Segmented pressure hull";
  mesh(shell(false), materials.roofGlass).name = "Continuous pressure canopy";

  const frames: Part[] = [];
  const secondary: Part[] = [];
  const nodes: Part[] = [];
  const serviceLines: Part[] = [];
  const guideLights: Part[] = [];
  for (let rib = 0; rib < 48; rib++) {
    const angle = rib / 48 * TAU;
    const main = rib % 2 === 0;
    for (let slice = 0; slice < 20; slice++) {
      const a = archPoint(angle, slice / 20 * Math.PI);
      const b = archPoint(angle, (slice + 1) / 20 * Math.PI);
      (main ? frames : secondary).push({ matrix: strut(a, b, main ? 0.17 : 0.075) });
      if (main && slice % 4 === 0)
        nodes.push({ matrix: box(a, new THREE.Vector3(0.48, 0.32, 0.48), angle) });
      if (main)
        secondary.push({
          matrix: strut(
            archPoint(angle, slice / 20 * Math.PI, true),
            archPoint(angle, (slice + 1) / 20 * Math.PI, true),
            0.14,
          ),
        });
    }
    for (const side of [-1, 1]) {
      const foot = archPoint(angle, side < 0 ? 0 : Math.PI);
      nodes.push({ matrix: box(foot, new THREE.Vector3(1.2, 0.65, 1.2), angle) });
    }
  }
  // Longitudinal mullions divide the glazing into replaceable pressure panels.
  for (let hoop = 1; hoop < 8; hoop++) {
    const t = hoop / 8 * Math.PI;
    for (let section = 0; section < 96; section++)
      secondary.push({ matrix: strut(
        archPoint(section / 96 * TAU, t),
        archPoint((section + 1) / 96 * TAU, t),
        hoop === 4 ? 0.12 : 0.055,
      ) });
  }
  // Twin service mains sit outside the promenades, with regular isolation boxes.
  for (const side of [-1, 1]) {
    const t = side < 0 ? 0.075 : Math.PI - 0.075;
    for (let section = 0; section < 96; section++) {
      const a = section / 96 * TAU;
      const b = (section + 1) / 96 * TAU;
      serviceLines.push({ matrix: strut(archPoint(a, t), archPoint(b, t), 0.16) });
      if (section % 4 === 0) {
        nodes.push({ matrix: box(archPoint(a, t), new THREE.Vector3(0.7, 0.6, 0.7), a) });
        const light = archPoint(a, side < 0 ? 0.11 : Math.PI - 0.11);
        guideLights.push({ matrix: box(light, new THREE.Vector3(0.45, 0.12, 0.45), a) });
      }
    }
  }

  // Sealed spoke passages are supported by three longerons and alternating
  // diagonal braces. Their feet meet the outer pressure-wall structural ring.
  const passages: Part[] = [];
  for (let spoke = 0; spoke < 6; spoke++) {
    const angle = spoke / 6 * TAU + Math.PI / 6;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    for (const side of [-1, 1]) {
      const point = (section: number, corner = -1) => {
        const f = section / 10;
        const value = radial.clone().multiplyScalar(12 + f * (FLOOR_RADIUS - 12));
        value.y = side * (20 + f * (ENCLOSURE_HALF_WIDTH - 20));
        if (corner === 0) value.addScaledVector(tangent, -1.35);
        if (corner === 1) value.addScaledVector(tangent, 1.35);
        if (corner === 2) value.y += side * 2.6;
        return value;
      };
      passages.push({ matrix: strut(point(0), point(10), 0.8) });
      for (let corner = 0; corner < 3; corner++) {
        frames.push({ matrix: strut(point(0, corner), point(10, corner), 0.18) });
        for (let section = 0; section < 10; section++) {
          const next = (corner + 1) % 3;
          const a = section % 2 === 0 ? corner : next;
          const b = section % 2 === 0 ? next : corner;
          secondary.push({ matrix: strut(point(section, a), point(section + 1, b), 0.085) });
          secondary.push({ matrix: strut(point(section, corner), point(section, next), 0.085) });
        }
        nodes.push({ matrix: box(point(10, corner), new THREE.Vector3(1.1, 0.8, 1.1), angle) });
      }
    }
  }
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 4);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  instances(cylinder, materials.structure, frames).name = "Primary pressure ribs and trusses";
  instances(cylinder, materials.trim, secondary).name = "Panel mullions and truss diagonals";
  instances(cube, materials.hub, nodes).name = "Structural joints and service boxes";
  instances(cylinder, materials.trim, serviceLines).name = "Ventilation and utility mains";
  instances(cylinder, materials.hub, passages).name = "Spoke transit passages";
  instances(cube, materials.cyan, guideLights).name = "Pressure-wall marker lights";

  mesh(new THREE.CylinderGeometry(11, 11, 47, 24), materials.hub).name = "Axial hub";
  mesh(new THREE.CylinderGeometry(14, 14, 12, 24), materials.glass);
  for (const y of [-24, -7, 7, 24])
    ring(Math.abs(y) === 24 ? 11.8 : 14.3, 0.4, y, materials.structure);
  const hubDetail: Part[] = [];
  const darkPorts: Part[] = [];
  const radiatorPanels: Part[] = [];
  for (let panel = 0; panel < 24; panel++) {
    const angle = panel / 24 * TAU;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    hubDetail.push({ matrix: strut(
      radial.clone().multiplyScalar(14.1).setY(-6),
      radial.clone().multiplyScalar(14.1).setY(6), 0.15,
    ) });
    if (panel % 3 === 0) {
      for (const side of [-1, 1]) {
        hubDetail.push({ matrix: box(
          radial.clone().multiplyScalar(11.15).setY(side * 16),
          new THREE.Vector3(0.55, 6.3, 0.55), angle,
        ) });
      }
    }
  }
  for (const side of [-1, 1]) {
    const shoulder = mesh(new THREE.CylinderGeometry(side > 0 ? 4.5 : 10.9, side > 0 ? 10.9 : 4.5, 5, 24), materials.hub);
    shoulder.position.y = side * 26;
    const neck = mesh(new THREE.CylinderGeometry(4.5, 4.5, 7, 20), materials.structure);
    neck.position.y = side * 32;
    for (const y of [29, 34.5, 36]) ring(4.8, 0.22, side * y, materials.hub);
    const port = mesh(new THREE.CylinderGeometry(3.9, 3.9, 0.18, 20), materials.glass);
    port.position.y = side * 36.2;
    ring(4.2, 0.1, side * 36.4, materials.cyan);
    // Small paired thermal radiators on the hub, clear of the habitat floor.
    for (const wing of [-1, 1]) {
      const center = new THREE.Vector3(wing * 18, side * 30, 0);
      radiatorPanels.push({ matrix: box(center, new THREE.Vector3(18, 0.2, 9)) });
      hubDetail.push({ matrix: strut(new THREE.Vector3(wing * 4, side * 30, 0), center, 0.24) });
      for (let seam = -3; seam <= 3; seam++)
        hubDetail.push({ matrix: box(
          new THREE.Vector3(wing * 18, side * 30.15, seam * 1.2),
          new THREE.Vector3(18, 0.06, 0.06),
        ) });
    }
    // Recessed service hatches add scale to otherwise blank hub barrel sections.
    for (let hatch = 0; hatch < 6; hatch++) {
      const angle = hatch / 6 * TAU;
      darkPorts.push({ matrix: box(
        new THREE.Vector3(Math.cos(angle) * 11, side * 14, Math.sin(angle) * 11),
        new THREE.Vector3(1.4, 2.5, 0.15), angle - Math.PI / 2,
      ) });
    }
  }
  instances(cube, materials.structure, hubDetail).name = "Hub framing and radiator fins";
  instances(cube, materials.glass, darkPorts).name = "Hub service hatches";
  instances(cube, materials.trim, radiatorPanels).name = "Thermal radiators";
  root.userData.structureVersion = 2;
}
