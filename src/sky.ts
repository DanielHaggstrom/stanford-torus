import * as THREE from "three";
import { isLand } from "./continents";
import { getOrbitState, inertialToHabitat } from "./orbit";
import type { OrbitState } from "./orbit";

export interface SkyHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update: (
    simSeconds: number,
    viewCamera: THREE.PerspectiveCamera,
  ) => OrbitState;
  dispose: () => void;
}

const vertexShader = `
  attribute vec3 color;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec3 vPosition;
  void main() {
    vColor = color;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vLocal = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const bodyFragmentShader = `
  uniform vec3 sunDirection;
  uniform float sunlight;
  uniform float clouds;
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vLocal;
  varying vec3 vPosition;
  void main() {
    vec3 normal = normalize(vNormal);
    float lambert = max(dot(normal, sunDirection), 0.0);
    vec3 albedo = vColor;
    // Thin, broken ribbons leave the simplified coastlines easy to recognize.
    float longitude = atan(vLocal.z, vLocal.x);
    float latitude = asin(clamp(vLocal.y, -1.0, 1.0));
    float field = sin(latitude * 70.0 + sin(longitude * 7.0 + latitude * 11.0) * 1.7)
      + 0.55 * sin(longitude * 37.0 + latitude * 23.0)
      + 0.35 * sin(longitude * 89.0 - latitude * 51.0);
    float breaks = smoothstep(-0.4, 0.55, sin(longitude * 19.0 + sin(latitude * 17.0)));
    float cover = smoothstep(0.9, 1.5, field) * breaks * 0.4 * clouds;
    albedo = mix(albedo, vec3(0.89, 0.94, 0.95), cover);
    vec3 light = albedo * (0.018 + pow(lambert, 0.8) * sunlight * 1.25);
    // A restrained blue limb makes the atmosphere visible at low orbit.
    float limb = pow(1.0 - max(dot(normal, normalize(-vPosition)), 0.0), 4.0);
    light += vec3(0.025, 0.13, 0.26) * limb * clouds * lambert;
    gl_FragColor = vec4(light, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function bodyMaterial(clouds: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      sunDirection: { value: new THREE.Vector3(1, 0, 0) },
      sunlight: { value: 1 },
      clouds: { value: clouds ? 1 : 0 },
    },
    vertexShader,
    fragmentShader: bodyFragmentShader,
  });
}

function earthGeometry(): THREE.SphereGeometry {
  const geometry = new THREE.SphereGeometry(1, 192, 96);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  const ocean = new THREE.Color("#14599c");
  const ice = new THREE.Color("#d8edf1");
  const forest = new THREE.Color("#41866b");
  const grass = new THREE.Color("#7fa276");
  const desert = new THREE.Color("#c0a675");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const latitude = (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI;
    const longitude = (Math.atan2(-z, x) * 180) / Math.PI;
    const land = isLand(longitude, latitude);
    color.copy(ocean);
    if (land) {
      color.copy(grass).lerp(forest, Math.max(0, 1 - Math.abs(latitude) / 25));
      // The Sahara, Arabia, central Asia and Australia's dry interior.
      if (
        (longitude > -18 && longitude < 59 && latitude > 14 && latitude < 33) ||
        (longitude > 113 &&
          longitude < 145 &&
          latitude < -19 &&
          latitude > -32) ||
        (longitude > 45 && longitude < 100 && latitude > 35 && latitude < 47)
      ) {
        color.copy(desert);
      }
      if (Math.abs(latitude) > 66)
        color.lerp(ice, Math.min(1, (Math.abs(latitude) - 66) / 9));
      if (
        latitude < -64 ||
        (longitude > -64 && longitude < -24 && latitude > 65)
      )
        color.copy(ice);
    } else if (Math.abs(latitude) > 78)
      color.lerp(ice, (Math.abs(latitude) - 78) / 12);
    const relief = 0.95 + 0.05 * Math.sin(longitude * 0.21 + latitude * 0.35);
    color.multiplyScalar(relief).toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function moonGeometry(): THREE.SphereGeometry {
  const geometry = new THREE.SphereGeometry(1, 40, 24);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const pale = new THREE.Color("#c4c6c2");
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const maria = Math.max(
      0,
      Math.sin(x * 9 + z * 5) + Math.cos(y * 12 - z * 3),
    );
    const craters = Math.sin(x * 45 + y * 27) * Math.cos(z * 39 - y * 21);
    pale
      .clone()
      .multiplyScalar(0.82 - 0.16 * maria + 0.06 * craters)
      .toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function makeStars(): THREE.Points {
  const positions = new Float32Array(1900 * 3);
  const colors = new Float32Array(1900 * 3);
  let seed = 1769;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < positions.length; i += 3) {
    const y = random() * 2 - 1;
    const azimuth = random() * Math.PI * 2;
    const radial = Math.sqrt(1 - y * y);
    positions.set(
      [
        Math.cos(azimuth) * radial * 2000,
        y * 2000,
        Math.sin(azimuth) * radial * 2000,
      ],
      i,
    );
    const brightness = 0.3 + random() * 0.6;
    colors.set([brightness * 0.83, brightness * 0.92, brightness], i);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 1.35,
      sizeAttenuation: false,
      vertexColors: true,
      toneMapped: false,
    }),
  );
}

// A small camera-glare treatment makes a correctly sized solar disc legible
// without textures, a postprocessing pass, or an oversized physical Sun.
const SUN_GLARE_RADIUS = THREE.MathUtils.degToRad(3.2);

function makeSunGlare(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: {
        discRadius: { value: 0.08 },
        visibility: { value: 1 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float discRadius;
        uniform float visibility;
        varying vec2 vUv;
        void main() {
          vec2 point = vUv * 2.0 - 1.0;
          float radius = length(point);
          if (radius >= 1.0) discard;
          float distanceFromDisc = max(radius - discRadius, 0.0);
          // Bright golden inner glow, a broad amber halo, and fine eight-point
          // rays read as sunlight even at the Sun's half-degree apparent size.
          float inner = exp(-distanceFromDisc * 24.0);
          float halo = exp(-distanceFromDisc * 6.5) * 0.3;
          float angle = atan(point.y, point.x);
          float rays = pow(abs(cos(angle * 4.0)), 34.0)
            * exp(-radius * 3.2) * 0.28;
          float edge = 1.0 - smoothstep(0.65, 1.0, radius);
          vec3 warm = mix(vec3(1.0, 0.25, 0.035), vec3(1.0, 0.79, 0.35), inner);
          float alpha = (inner * 0.85 + halo + rays) * edge * visibility;
          gl_FragColor = vec4(warm, alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
}

/**
 * Separate, origin-centred sky pass: player motion never adds false parallax.
 * Different render distances preserve each body's exact angular size, while
 * Earth can still occult the Moon and Sun through ordinary depth testing.
 */
export function buildSky(): SkyHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#030911");
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 4000);
  const earth = new THREE.Mesh(earthGeometry(), bodyMaterial(true));
  const moon = new THREE.Mesh(moonGeometry(), bodyMaterial(false));
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 20),
    new THREE.MeshBasicMaterial({ color: "#fffbed", toneMapped: false }),
  );
  const sunGlare = makeSunGlare();
  const stars = makeStars();
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.008, 96, 48),
    new THREE.ShaderMaterial({
      uniforms: { sunDirection: { value: new THREE.Vector3(1, 0, 0) } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(mat3(modelMatrix) * normal);
          vec4 world = modelMatrix * vec4(position, 1.0);
          vPosition = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirection;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          float rim = pow(1.0 - max(dot(normalize(vNormal), normalize(-vPosition)), 0.0), 3.5);
          float day = max(dot(normalize(vNormal), sunDirection), 0.0);
          gl_FragColor = vec4(0.17, 0.48, 0.86, rim * (0.08 + 0.48 * day));
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
    }),
  );
  scene.add(stars, earth, moon, sun, sunGlare, atmosphere);
  const earthX = new THREE.Vector3(),
    earthY = new THREE.Vector3(),
    earthZ = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const placeBody = (
    body: THREE.Mesh,
    position: { x: number; y: number; z: number },
    angularRadius: number,
    distance: number,
  ) => {
    body.position
      .set(position.x, position.y, position.z)
      .normalize()
      .multiplyScalar(distance);
    body.scale.setScalar(Math.sin(angularRadius) * distance);
  };

  return {
    scene,
    camera,
    update(simSeconds, viewCamera) {
      const state = getOrbitState(simSeconds);
      camera.quaternion.copy(viewCamera.quaternion);
      camera.fov = viewCamera.fov;
      camera.aspect = viewCamera.aspect;
      camera.zoom = viewCamera.zoom;
      camera.near = viewCamera.near;
      camera.far = viewCamera.far;
      // Include any asymmetric intro framing or view offset exactly, so Sun
      // lighting, sky directions and foreground geometry remain co-registered.
      camera.projectionMatrix.copy(viewCamera.projectionMatrix);
      camera.projectionMatrixInverse.copy(viewCamera.projectionMatrixInverse);
      placeBody(earth, state.earthPosition, state.earthAngularRadius, 30);
      placeBody(moon, state.moonPosition, state.moonAngularRadius, 150);
      placeBody(sun, state.sunPosition, state.sunAngularRadius, 180);
      sunGlare.position.copy(sun.position);
      sunGlare.lookAt(0, 0, 0);
      const glareSize = Math.tan(SUN_GLARE_RADIUS) * 180;
      sunGlare.scale.setScalar(glareSize);
      sunGlare.material.uniforms.discRadius.value = sun.scale.x / glareSize;
      // Depth testing masks Earth/Moon silhouettes; this also extinguishes
      // camera glare as the solar disc passes fully into Earth's shadow.
      sunGlare.material.uniforms.visibility.value = state.sunlight;
      earthX.set(
        state.earthPrimeDirection.x,
        state.earthPrimeDirection.y,
        state.earthPrimeDirection.z,
      );
      earthY.set(
        state.earthNorthDirection.x,
        state.earthNorthDirection.y,
        state.earthNorthDirection.z,
      );
      earthZ.crossVectors(earthX, earthY).normalize();
      earth.quaternion.setFromRotationMatrix(
        basis.makeBasis(earthX, earthY, earthZ),
      );
      atmosphere.position.copy(earth.position);
      atmosphere.scale.copy(earth.scale);
      // The Moon is synchronously rotating; local +X always faces Earth.
      earthX
        .set(
          state.earthPosition.x - state.moonPosition.x,
          state.earthPosition.y - state.moonPosition.y,
          state.earthPosition.z - state.moonPosition.z,
        )
        .normalize();
      const moonNormal = state.moonNorthDirection;
      earthY.set(moonNormal.x, moonNormal.y, moonNormal.z);
      earthZ.crossVectors(earthX, earthY).normalize();
      earthY.crossVectors(earthZ, earthX).normalize();
      moon.quaternion.setFromRotationMatrix(
        basis.makeBasis(earthX, earthY, earthZ),
      );
      earth.material.uniforms.sunDirection.value.set(
        state.sunDirection.x,
        state.sunDirection.y,
        state.sunDirection.z,
      );
      atmosphere.material.uniforms.sunDirection.value.copy(
        earth.material.uniforms.sunDirection.value,
      );
      moon.material.uniforms.sunDirection.value.set(
        state.moonSunDirection.x,
        state.moonSunDirection.y,
        state.moonSunDirection.z,
      );
      moon.material.uniforms.sunlight.value = state.moonSunlight;
      const sx = inertialToHabitat({ x: 1, y: 0, z: 0 }, simSeconds);
      const sy = inertialToHabitat({ x: 0, y: 1, z: 0 }, simSeconds);
      earthX.set(sx.x, sx.y, sx.z);
      earthY.set(sy.x, sy.y, sy.z);
      earthZ.crossVectors(earthX, earthY);
      stars.quaternion.setFromRotationMatrix(
        basis.makeBasis(earthX, earthY, earthZ),
      );
      return state;
    },
    dispose() {
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
    },
  };
}
