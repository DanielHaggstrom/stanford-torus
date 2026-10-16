import * as THREE from "three";
import { FLOOR_RADIUS, type Vec3 } from "./physics.ts";

const TAU = Math.PI * 2;
export const ENCLOSURE_LIGHT_BAYS = 24;
const LIGHT_RADIUS = FLOOR_RADIUS - 19;
const LIGHT_ACROSS = 19.5;

export function lightingLevels(sunlight: number) {
  const day = Number.isFinite(sunlight) ? THREE.MathUtils.clamp(sunlight, 0, 1) : 0;
  return { sun: 3.2 * day, hemisphere: 0.16 + 0.38 * day, ambient: 0.11 + 0.09 * day, lamps: 1400 - 450 * day };
}

/** Four unshadowed practical lights crossfade between fixed ceiling fixtures. */
export function localLampSamples(position: Vec3) {
  const phase = ((Math.atan2(position.z, position.x) / TAU) % 1 + 1) % 1 * ENCLOSURE_LIGHT_BAYS;
  const bay = Math.floor(phase);
  const blend = Math.sin((phase - bay) * Math.PI / 2) ** 2;
  return [0, 1].flatMap((next) => [-1, 1].map((side) => {
    const angle = (bay + next) / ENCLOSURE_LIGHT_BAYS * TAU;
    return {
      position: { x: LIGHT_RADIUS * Math.cos(angle), y: side * LIGHT_ACROSS, z: LIGHT_RADIUS * Math.sin(angle) },
      weight: next ? blend : 1 - blend,
    };
  }));
}

/** Directional sunlight, restrained bounce, and a fixed-size pool of practical lights. */
export function buildHabitatLighting(root: THREE.Group) {
  const sun = new THREE.DirectionalLight("#fff4df", 3.2);
  sun.name = "Direct sunlight";
  sun.position.set(350, 600, -400).normalize().multiplyScalar(1000);
  sun.target.position.set(0, 0, 0);
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -240, right: 240, top: 240, bottom: -240, near: 400, far: 1550 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.12;
  sun.shadow.radius = 2;
  const hemisphere = new THREE.HemisphereLight("#c8def0", "#61715d", 0.54);
  hemisphere.name = "Diffuse sky and habitat bounce";
  const ambient = new THREE.AmbientLight("#a1b3bd", 0.2);
  ambient.name = "Interior bounce floor";
  root.add(sun, sun.target, hemisphere, ambient);
  const practicals = Array.from({ length: 4 }, () => {
    const light = new THREE.PointLight("#ffe3b0", 0, 65, 2);
    light.name = "Pooled enclosure streetlight";
    root.add(light);
    return light;
  });

  const housings: THREE.Matrix4[] = [];
  const diffusers: THREE.Matrix4[] = [];
  const brackets: THREE.Matrix4[] = [];
  const structuralHousings: THREE.Matrix4[] = [];
  const structuralDiffusers: THREE.Matrix4[] = [];
  for (let bay = 0; bay < ENCLOSURE_LIGHT_BAYS; bay++) {
    const angle = bay / ENCLOSURE_LIGHT_BAYS * TAU;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const up = radial.clone().negate();
    const rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(tangent, up, new THREE.Vector3(0, -1, 0)));
    const part = (radius: number, across: number, size: THREE.Vector3) => new THREE.Matrix4().compose(radial.clone().multiplyScalar(radius).setY(across), rotation, size);
    for (const side of [-1, 1]) {
      // Shoulder lamps hang just inside the curved enclosure, facing the deck.
      housings.push(part(LIGHT_RADIUS - 0.18, side * LIGHT_ACROSS, new THREE.Vector3(2.7, 0.38, 0.85)));
      diffusers.push(part(LIGHT_RADIUS + 0.04, side * LIGHT_ACROSS, new THREE.Vector3(2.25, 0.08, 0.62)));
      brackets.push(part(LIGHT_RADIUS - 1.0, side * (LIGHT_ACROSS + 0.45), new THREE.Vector3(0.22, 1.6, 0.22)));
    }
    // Crown and spine-facing fixtures make the structure readable from below.
    housings.push(part(175.6, 0, new THREE.Vector3(4.2, 0.32, 1.25)));
    diffusers.push(part(175.82, 0, new THREE.Vector3(3.7, 0.08, 0.98)));
  }
  for (let spoke = 0; spoke < 6; spoke++) {
    const angle = spoke / 6 * TAU + Math.PI / 6;
    const radial = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
    for (const side of [-1, 1]) for (const radius of [60, 112, 160]) {
      if (side < 0 && spoke % 2 === 0) continue;
      const point = radial.clone().multiplyScalar(radius).setY(side * (19 + (radius - 12) / 198 * 4));
      structuralHousings.push(new THREE.Matrix4().compose(point, rotation, new THREE.Vector3(1.6, 0.32, 0.7)));
      structuralDiffusers.push(new THREE.Matrix4().compose(point.clone().add(new THREE.Vector3(0, -side * 0.21, 0)), rotation,
        new THREE.Vector3(1.1, 0.08, 0.46)));
    }
  }
  const cube = new THREE.BoxGeometry();
  const metal = new THREE.MeshStandardMaterial({ color: "#485b60", roughness: 0.65, metalness: 0.35 });
  const glow = new THREE.MeshBasicMaterial({ color: "#ffe3b0", toneMapped: false });
  for (const [name, matrices, material] of [
    ["Enclosure streetlight housings", housings, metal],
    ["Enclosure streetlight diffusers", diffusers, glow],
    ["Enclosure lamp brackets", brackets, metal],
    ["Structural service light housings", structuralHousings, metal],
    ["Structural service light diffusers", structuralDiffusers, glow],
  ] as const) {
    const object = new THREE.InstancedMesh(cube, material, matrices.length);
    object.name = name;
    matrices.forEach((matrix, index) => object.setMatrixAt(index, matrix));
    object.computeBoundingSphere();
    root.add(object);
  }
  return {
    update(sunDirection: Vec3, sunlight: number, viewer: Vec3, shadows: boolean) {
      const levels = lightingLevels(sunlight);
      sun.position.copy(sunDirection).normalize().multiplyScalar(1000);
      sun.intensity = levels.sun;
      sun.castShadow = shadows && levels.sun > 0.01;
      hemisphere.intensity = levels.hemisphere;
      ambient.intensity = levels.ambient;
      localLampSamples(viewer).forEach((sample, index) => {
        practicals[index].position.copy(sample.position);
        practicals[index].intensity = levels.lamps * sample.weight;
      });
    },
    dispose() { sun.shadow.dispose(); },
  };
}
