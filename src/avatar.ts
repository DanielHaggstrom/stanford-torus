import * as THREE from "three";

export interface AvatarState {
  deltaSeconds: number;
  movementSpeed: number;
  grounded: boolean;
  flying: boolean;
  charge: number;
  recoil: number;
  pitch: number;
  aspect: number;
  visible: boolean;
  reducedMotion?: boolean;
}

/** Camera-local, procedural player model. Render after the world and clearDepth(). */
export function buildAvatar() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.025, 5);
  const geometry = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const material = (color: string, roughness = 0.75, metalness = 0) => {
    const result = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
    });
    materials.add(result);
    return result;
  };
  const suit = material("#718982");
  const darkSuit = material("#253b3b");
  const panel = material("#b9c9b4");
  const glove = material("#25312f");
  const orange = material("#e9a66b");
  const barrel = material("#52656b", 0.35, 0.55);
  const black = material("#16242b", 0.45, 0.2);
  const chargeMaterial = new THREE.MeshStandardMaterial({
    color: "#a3dfc0",
    emissive: "#86fbd0",
    emissiveIntensity: 0.35,
    roughness: 0.3,
    metalness: 0.15,
  });
  materials.add(chargeMaterial);

  // Gentle studio illumination keeps hands readable through the habitat's eclipse.
  scene.add(new THREE.HemisphereLight("#f1f8e6", "#2d4549", 2.4));
  const light = new THREE.DirectionalLight("#fff1d2", 2.4);
  light.position.set(-2, 4, 3);
  scene.add(light);

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 10);
  geometry.add(boxGeometry);
  geometry.add(cylinderGeometry);

  function box(
    parent: THREE.Object3D,
    mat: THREE.Material,
    size: [number, number, number],
    point: [number, number, number],
  ) {
    const mesh = new THREE.Mesh(boxGeometry, mat);
    mesh.scale.set(...size);
    mesh.position.set(...point);
    parent.add(mesh);
    return mesh;
  }

  function tube(
    parent: THREE.Object3D,
    mat: THREE.Material,
    radius: number,
    length: number,
    point: [number, number, number],
  ) {
    const mesh = new THREE.Mesh(cylinderGeometry, mat);
    mesh.scale.set(radius, length, radius);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(...point);
    parent.add(mesh);
    return mesh;
  }

  function limb(
    parent: THREE.Object3D,
    mat: THREE.Material,
    from: THREE.Vector3,
    to: THREE.Vector3,
    width: number,
    depth = width,
  ) {
    const mesh = new THREE.Mesh(boxGeometry, mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.scale.set(width, from.distanceTo(to), depth);
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize(),
    );
    parent.add(mesh);
    return mesh;
  }

  const body = new THREE.Group();
  scene.add(body);
  box(body, suit, [0.43, 0.48, 0.24], [0, -0.59, 0.07]);
  box(body, panel, [0.3, 0.22, 0.025], [0, -0.55, -0.064]);
  box(body, orange, [0.045, 0.24, 0.03], [-0.155, -0.55, -0.07]);
  box(body, darkSuit, [0.38, 0.1, 0.26], [0, -0.86, 0.07]);
  box(body, barrel, [0.085, 0.065, 0.028], [0, -0.855, -0.073]);
  box(body, suit, [0.36, 0.18, 0.24], [0, -0.97, 0.065]);
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.105, -1.015, 0.06);
    body.add(leg);
    box(leg, suit, [0.15, 0.27, 0.17], [0, -0.13, 0]);
    box(leg, darkSuit, [0.13, 0.23, 0.15], [0, -0.36, 0]);
    box(leg, panel, [0.125, 0.095, 0.027], [0, -0.255, -0.095]);
    box(leg, glove, [0.18, 0.15, 0.3], [0, -0.54, -0.065]);
    box(leg, orange, [0.18, 0.035, 0.3], [0, -0.605, -0.065]);
    legs.push(leg);
  }

  const weapon = new THREE.Group();
  scene.add(weapon);
  // The muzzle sits below/right of the crosshair; the sight line stays unobstructed.
  // World shots are aimed from the corresponding small offset in main.ts.
  box(weapon, darkSuit, [0.15, 0.14, 0.31], [0.02, 0, -0.025]);
  box(weapon, panel, [0.16, 0.045, 0.28], [0.02, 0.086, -0.025]);
  box(weapon, orange, [0.012, 0.07, 0.19], [0.102, 0.02, -0.005]);
  tube(weapon, barrel, 0.058, 0.26, [0.02, 0.01, -0.27]);
  tube(weapon, chargeMaterial, 0.061, 0.014, [0.02, 0.01, -0.23]);
  tube(weapon, chargeMaterial, 0.061, 0.014, [0.02, 0.01, -0.31]);
  tube(weapon, black, 0.068, 0.043, [0.02, 0.01, -0.405]);
  tube(weapon, chargeMaterial, 0.039, 0.004, [0.02, 0.01, -0.429]);
  // Put the grip hand outside the receiver silhouette, with a visible thumb,
  // knuckle plate, and sleeve. The sleeve exits the bottom of the view.
  const grip = box(weapon, black, [0.075, 0.17, 0.09], [0.025, -0.115, 0.045]);
  grip.rotation.x = -0.2;
  box(weapon, glove, [0.105, 0.105, 0.11], [0.08, -0.13, 0.065]);
  box(weapon, suit, [0.07, 0.065, 0.018], [0.085, -0.13, 0.129]);
  box(weapon, glove, [0.065, 0.038, 0.05], [0.025, -0.085, 0.105]);
  box(weapon, darkSuit, [0.115, 0.052, 0.12], [0.09, -0.197, 0.105]);
  box(weapon, orange, [0.118, 0.019, 0.123], [0.09, -0.205, 0.105]);
  limb(
    weapon,
    suit,
    new THREE.Vector3(0.09, -0.227, 0.105),
    new THREE.Vector3(0.22, -0.34, 0.32),
    0.105,
  );
  // The left palm and four simple fingers remain clearly beside/under the
  // barrel rather than disappearing inside the receiver.
  box(weapon, glove, [0.11, 0.075, 0.13], [-0.12, -0.105, -0.17]);
  box(weapon, suit, [0.072, 0.044, 0.018], [-0.13, -0.105, -0.096]);
  for (let finger = 0; finger < 4; finger++) {
    box(
      weapon,
      glove,
      [0.065, 0.038, 0.023],
      [-0.066, -0.073, -0.218 + finger * 0.03],
    );
  }
  box(weapon, glove, [0.04, 0.065, 0.047], [-0.075, -0.055, -0.105]);
  box(weapon, darkSuit, [0.11, 0.07, 0.105], [-0.17, -0.165, -0.095]);
  limb(
    weapon,
    suit,
    new THREE.Vector3(-0.17, -0.195, -0.085),
    new THREE.Vector3(-0.38, -0.32, 0.28),
    0.105,
  );
  box(weapon, orange, [0.113, 0.02, 0.108], [-0.17, -0.165, -0.095]);
  // A bank of three physical charge bars avoids any text or external texture.
  const chargeBars = [0, 1, 2].map((index) => {
    const mat = chargeMaterial.clone();
    materials.add(mat);
    return box(
      weapon,
      mat,
      [0.018, 0.009, 0.075],
      [-0.025 + index * 0.037, 0.114, 0.02],
    );
  });
  const sight = box(
    weapon,
    black,
    [0.055, 0.038, 0.035],
    [0.02, 0.122, -0.105],
  );
  box(sight, chargeMaterial, [0.18, 0.24, 0.2], [0, 0.1, 0.51]);

  let phase = 0;
  let bobStrength = 0;
  let flightBlend = 0;
  let previousVisible = false;
  const constrain = (value: number) => Math.min(1, Math.max(0, value));

  return {
    scene,
    camera,
    update(state: AvatarState) {
      scene.visible = state.visible;
      if (camera.aspect !== state.aspect) {
        camera.aspect = state.aspect;
        camera.updateProjectionMatrix();
      }
      if (!state.visible) {
        previousVisible = false;
        return;
      }
      if (!previousVisible) {
        bobStrength = 0;
        flightBlend = state.flying ? 1 : 0;
      }
      previousVisible = true;
      const dt = Math.min(Math.max(state.deltaSeconds, 0), 0.1);
      const motion = state.reducedMotion ? 0 : 1;
      const pace = Math.min(Math.max(state.movementSpeed, 0) / 5, 1.6);
      const targetBob =
        state.grounded && !state.flying ? Math.min(pace, 1) * motion : 0;
      bobStrength += (targetBob - bobStrength) * (1 - Math.exp(-10 * dt));
      flightBlend +=
        ((state.flying ? 1 : 0) - flightBlend) * (1 - Math.exp(-5 * dt));
      phase += dt * (6 + pace * 3) * motion;
      const bob = Math.sin(phase) * 0.008 * bobStrength;
      const recoil = constrain(state.recoil);
      const charge = constrain(state.charge);

      weapon.position.set(
        0.29 + Math.cos(phase * 0.5) * 0.005 * bobStrength,
        -0.22 + bob - flightBlend * 0.015,
        -0.72 + recoil * 0.065,
      );
      weapon.rotation.set(
        recoil * 0.1 + flightBlend * 0.035,
        -0.025,
        Math.cos(phase * 0.5) * 0.01 * bobStrength - recoil * 0.025,
      );
      chargeMaterial.emissiveIntensity = 0.35 + charge * 2.4;
      chargeBars.forEach((bar, index) => {
        const mat = bar.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = charge >= (index + 1) / 3 ? 2.6 : 0.12;
      });

      // The body remains upright in habitat space when the view pitches down.
      body.visible = state.pitch < -0.4;
      body.rotation.x = -state.pitch;
      // The eyes sit slightly ahead of the chest. Rotate that upright offset
      // with the body so looking down reveals the legs instead of the chest
      // covering their silhouette from the camera to the floor.
      body.position.y = bob * 0.35 - 0.25 * Math.sin(-state.pitch);
      body.position.z = 0.25 * Math.cos(-state.pitch);
      legs.forEach((leg, index) => {
        leg.rotation.x = Math.sin(phase + index * Math.PI) * 0.14 * bobStrength;
        leg.rotation.z = (index === 0 ? 1 : -1) * flightBlend * 0.06;
      });
    },
    dispose() {
      geometry.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      scene.clear();
    },
  };
}
