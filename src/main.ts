import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildHabitat, HABITAT_DISTRICTS } from "./habitat";
import {
  ANGULAR_SPEED,
  FLOOR_RADIUS,
  GRAVITY,
  advanceBallistic,
  firstHabitatImpact,
  floorNormal,
  resolveHabitatCollision,
  sampleTrajectory,
  stepFreeFlight,
} from "./physics";
import type { MotionState } from "./physics";
import "./style.css";

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const canvas = element<HTMLCanvasElement>("world");
canvas.tabIndex = 0;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch (error) {
  element("fatal-error").hidden = false;
  throw error;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#101c23");
const camera = new THREE.PerspectiveCamera(
  60,
  innerWidth / innerHeight,
  0.08,
  6000,
);
const habitat = buildHabitat(scene);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.minDistance = 270;
controls.maxDistance = 1100;
controls.enablePan = false;
controls.autoRotate = !matchMedia("(prefers-reduced-motion: reduce)").matches;
controls.autoRotateSpeed = 0.45;
camera.position.set(395, 325, 420);
controls.target.set(0, 0, 0);

type View = "intro" | "explore" | "orbit";
let view: View = "intro";
let flight = false;
let grounded = true;
let yaw = 0;
let pitch = 0.12;
let player: MotionState = {
  position: { x: FLOOR_RADIUS, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
};
const keys = new Set<string>();
const up = new THREE.Vector3();
const tangent = new THREE.Vector3();
const heading = new THREE.Vector3();
const right = new THREE.Vector3();
const direction = new THREE.Vector3();
const position = new THREE.Vector3();
const velocity = new THREE.Vector3();
let dragLooking = false;
let pointerUnavailable = false;
let fallbackResumed = false;
let lastShot = -Infinity;
let elapsed = 0;
let fixedAccumulator = 0;
let ghostRefresh = 0;
const STEP = 1 / 120;
const eyeHeight = 1.7;
const launchSpeed = element<HTMLInputElement>("launch-speed");
const ghostToggle = element<HTMLInputElement>("ghost-toggle");
const help = element<HTMLDialogElement>("help-dialog");
const ghostPositions = new Float32Array(1600 * 3);
const ghostGeometry = new THREE.BufferGeometry();
ghostGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(ghostPositions, 3).setUsage(THREE.DynamicDrawUsage),
);
const ghostDistances = new Float32Array(1600);
ghostGeometry.setAttribute(
  "lineDistance",
  new THREE.BufferAttribute(ghostDistances, 1).setUsage(THREE.DynamicDrawUsage),
);
ghostGeometry.setDrawRange(0, 0);
const ghost = new THREE.Line(
  ghostGeometry,
  new THREE.LineDashedMaterial({
    color: "#e6ffc0",
    dashSize: 0.8,
    gapSize: 0.55,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
  }),
);
ghost.frustumCulled = false;
scene.add(ghost);
const impactMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.35, 0.52, 32),
  new THREE.MeshBasicMaterial({
    color: "#e6ffc0",
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  }),
);
scene.add(impactMarker);
const probeGeometry = new THREE.IcosahedronGeometry(0.24, 1);
const probeMaterial = new THREE.MeshStandardMaterial({
  color: "#ffd28e",
  emissive: "#d38e2d",
  emissiveIntensity: 1.3,
  roughness: 0.4,
});
interface Probe {
  state: MotionState;
  mesh: THREE.Mesh;
  trail: THREE.Line;
  trailPoints: THREE.Vector3[];
  age: number;
  stopped: boolean;
}
const probes: Probe[] = [];

function notice(message: string) {
  const box = element("notice");
  box.textContent = message;
  box.classList.add("visible");
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => box.classList.remove("visible"), 3500);
}
let noticeTimer = 0;

function basis() {
  const rho = Math.hypot(player.position.x, player.position.z);
  up.copy(floorNormal(player.position));
  tangent.set(
    -player.position.z / (rho || 1),
    0,
    player.position.x / (rho || 1),
  );
  right.crossVectors(tangent, up).normalize();
  heading
    .copy(tangent)
    .multiplyScalar(Math.cos(yaw))
    .addScaledVector(right, Math.sin(yaw))
    .normalize();
  right.crossVectors(heading, up).normalize();
  direction
    .copy(heading)
    .multiplyScalar(Math.cos(pitch))
    .addScaledVector(up, Math.sin(pitch))
    .normalize();
}

function updateCamera() {
  basis();
  camera.up.copy(up);
  camera.position.copy(player.position).addScaledVector(up, eyeHeight);
  camera.lookAt(position.copy(camera.position).add(direction));
}

function resetPlayer() {
  player = {
    position: { x: FLOOR_RADIUS, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
  };
  grounded = true;
  yaw = 0;
  pitch = 0.12;
  updateCamera();
  for (const probe of probes) removeProbe(probe);
  probes.length = 0;
}

function setFlight(enabled: boolean) {
  flight = enabled;
  element("walk-button").classList.toggle("selected", !flight);
  element("fly-button").classList.toggle("selected", flight);
  element("mode-description").textContent = flight
    ? "Stabilized thrusters. Space rises; Q descends."
    : "Follow the promenade. Space to jump.";
  if (view === "explore")
    notice(
      flight
        ? "Flight enabled · Space to rise, Q to descend"
        : "Walking enabled · Space to jump",
    );
}

function showPause() {
  const resumed =
    document.pointerLockElement === canvas ||
    (pointerUnavailable && fallbackResumed);
  element("resume-hint").hidden = view !== "explore" || resumed;
  element("crosshair").hidden = view !== "explore" || !resumed;
}

async function captureMouse() {
  if (view !== "explore") return;
  if (pointerUnavailable) {
    fallbackResumed = true;
    element("resume-button").blur();
    showPause();
    return;
  }
  try {
    if (!canvas.requestPointerLock) throw new Error("Pointer Lock unavailable");
    await canvas.requestPointerLock();
  } catch {
    pointerUnavailable = true;
    element("drag-hint").hidden = false;
    element("resume-button").textContent = "Continue with drag to look ↗";
    notice("Use WASD to move, and drag the world to look.");
    showPause();
  }
}

function enterHabitat() {
  view = "explore";
  controls.enabled = false;
  document.body.className = "playing";
  element("intro").hidden = true;
  element("scene-caption").hidden = true;
  element("flight-panel").hidden = false;
  element("key-guide").hidden = false;
  camera.fov = 72;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  resetPlayer();
  element("enter-button").blur();
  element("exit-button").blur();
  void captureMouse();
  showPause();
}

function orbitView() {
  document.exitPointerLock?.();
  keys.clear();
  view = "orbit";
  fallbackResumed = false;
  dragLooking = false;
  document.body.className = "orbiting";
  element("intro").hidden = true;
  element("scene-caption").hidden = true;
  element("flight-panel").hidden = false;
  element("resume-hint").hidden = true;
  element("crosshair").hidden = true;
  element("key-guide").hidden = true;
  controls.enabled = true;
  camera.up.set(0, 1, 0);
  camera.position.set(370, 345, 410);
  camera.fov = 60;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  controls.target.set(0, 0, 0);
  ghost.visible = impactMarker.visible = false;
  notice("Orbit view · Drag to rotate, scroll to zoom");
}

function currentShot(): MotionState {
  updateCamera();
  const origin = camera.position.clone().addScaledVector(direction, 0.65);
  // Avoid starting beyond the side wall when aiming outwards near an edge.
  origin.y = THREE.MathUtils.clamp(origin.y, -21.9, 21.9);
  const initialVelocity = direction
    .clone()
    .multiplyScalar(Number(launchSpeed.value))
    .add(new THREE.Vector3().copy(player.velocity));
  return {
    position: { x: origin.x, y: origin.y, z: origin.z },
    velocity: {
      x: initialVelocity.x,
      y: initialVelocity.y,
      z: initialVelocity.z,
    },
  };
}

function refreshGhost() {
  ghost.visible = view === "explore" && ghostToggle.checked;
  impactMarker.visible = false;
  if (!ghost.visible) return;
  const shot = currentShot();
  const points = sampleTrajectory(shot, { duration: 30, step: 0.04 });
  points.forEach((point, index) => {
    ghostPositions[index * 3] = point.x;
    ghostPositions[index * 3 + 1] = point.y;
    ghostPositions[index * 3 + 2] = point.z;
  });
  ghostGeometry.setDrawRange(0, points.length);
  ghostGeometry.getAttribute("position").needsUpdate = true;
  // Distances use only active vertices; unused buffer entries never reach the GPU.
  ghostDistances[0] = 0;
  for (let i = 1; i < points.length; i++)
    ghostDistances[i] =
      ghostDistances[i - 1] +
      Math.hypot(
        points[i].x - points[i - 1].x,
        points[i].y - points[i - 1].y,
        points[i].z - points[i - 1].z,
      );
  ghostGeometry.getAttribute("lineDistance").needsUpdate = true;
  const impact = firstHabitatImpact(shot, 30);
  element("flight-time").textContent = impact
    ? `${impact.time.toFixed(1)} s to contact`
    : "> 30 s";
  if (impact) {
    impactMarker.position
      .copy(impact.position)
      .addScaledVector(impact.normal, 0.07);
    impactMarker.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3().copy(impact.normal),
    );
    impactMarker.visible = true;
  }
}

function removeProbe(probe: Probe) {
  scene.remove(probe.mesh, probe.trail);
  probe.trail.geometry.dispose();
  (probe.trail.material as THREE.Material).dispose();
}

function launch() {
  if (view !== "explore" || elapsed - lastShot < 0.2) return;
  lastShot = elapsed;
  if (probes.length >= 24) removeProbe(probes.shift()!);
  const state = currentShot();
  const mesh = new THREE.Mesh(probeGeometry, probeMaterial);
  mesh.position.copy(state.position);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(450 * 3), 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  trailGeometry.setDrawRange(0, 0);
  const trail = new THREE.Line(
    trailGeometry,
    new THREE.LineBasicMaterial({
      color: "#ffcc8a",
      transparent: true,
      opacity: 0.65,
    }),
  );
  trail.frustumCulled = false;
  scene.add(mesh, trail);
  probes.push({
    state,
    mesh,
    trail,
    trailPoints: [mesh.position.clone()],
    age: 0,
    stopped: false,
  });
}

function simulatePlayer(dt: number) {
  basis();
  const moveForward =
    Number(keys.has("KeyW") || keys.has("ArrowUp")) -
    Number(keys.has("KeyS") || keys.has("ArrowDown"));
  const moveRight =
    Number(keys.has("KeyD") || keys.has("ArrowRight")) -
    Number(keys.has("KeyA") || keys.has("ArrowLeft"));
  const boost = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const desired = new THREE.Vector3()
    .addScaledVector(flight ? direction : heading, moveForward)
    .addScaledVector(right, moveRight);
  if (flight)
    desired.addScaledVector(
      up,
      Number(keys.has("Space")) - Number(keys.has("KeyQ")),
    );
  if (desired.lengthSq() > 1) desired.normalize();
  desired.multiplyScalar(flight ? (boost ? 36 : 15) : boost ? 10 : 5);
  velocity.copy(player.velocity);
  if (flight) {
    // Powered, damped flight deliberately counters apparent gravity.
    velocity.lerp(desired, 1 - Math.exp(-5 * dt));
    position.copy(player.position).addScaledVector(velocity, dt);
    const rho = Math.hypot(position.x, position.z);
    if (rho < 6) {
      position.x *= 6 / Math.max(rho, 0.001);
      position.z *= 6 / Math.max(rho, 0.001);
    }
    const collision = resolveHabitatCollision(
      { position, velocity },
      { halfWidth: 21.5 },
    );
    player = collision.state;
    grounded = collision.hitFloor;
  } else if (grounded) {
    const vertical = velocity.dot(up);
    velocity
      .addScaledVector(up, -vertical)
      .lerp(desired, 1 - Math.exp(-12 * dt));
    position.copy(player.position).addScaledVector(velocity, dt);
    const rho = Math.hypot(position.x, position.z);
    position.x *= FLOOR_RADIUS / rho;
    position.z *= FLOOR_RADIUS / rho;
    player = resolveHabitatCollision(
      { position, velocity },
      { halfWidth: 21.5 },
    ).state;
  } else {
    // Modest air steering; jumping otherwise shares the probes' free-flight physics.
    const lateralVelocity = velocity
      .clone()
      .addScaledVector(up, -velocity.dot(up));
    velocity.addScaledVector(
      desired.sub(lateralVelocity),
      Math.min(0.8 * dt, 1),
    );
    player = stepFreeFlight({ position: player.position, velocity }, dt);
    const collision = resolveHabitatCollision(player, { halfWidth: 21.5 });
    player = collision.state;
    grounded = collision.hitFloor;
  }
}

element("enter-button").addEventListener("click", enterHabitat);
element("tour-button").addEventListener("click", orbitView);
element("exit-button").addEventListener("click", () =>
  view === "orbit" ? enterHabitat() : orbitView(),
);
element("walk-button").addEventListener("click", () => {
  setFlight(false);
  element("walk-button").blur();
});
element("fly-button").addEventListener("click", () => {
  setFlight(true);
  element("fly-button").blur();
});
element("resume-button").addEventListener("click", () => void captureMouse());
element("launch-button").addEventListener("click", () => {
  launch();
  element("launch-button").blur();
});
launchSpeed.addEventListener("input", () => {
  element("launch-value").textContent = launchSpeed.value;
  refreshGhost();
});
ghostToggle.addEventListener("change", refreshGhost);
element("help-button").addEventListener("click", () => {
  document.exitPointerLock?.();
  keys.clear();
  help.showModal();
});
element("close-help").addEventListener("click", () => help.close());
document.addEventListener("pointerlockchange", () => {
  keys.clear();
  dragLooking = false;
  showPause();
});
document.addEventListener("pointerlockerror", () => {
  pointerUnavailable = true;
  element("drag-hint").hidden = false;
  element("resume-button").textContent = "Continue with drag to look ↗";
  showPause();
});
canvas.addEventListener("click", () => {
  if (view !== "explore") return;
  if (document.pointerLockElement === canvas) launch();
  else if (!pointerUnavailable) void captureMouse();
});
canvas.addEventListener("pointerdown", (event) => {
  canvas.focus({ preventScroll: true });
  if (view === "explore" && pointerUnavailable) {
    dragLooking = true;
    canvas.setPointerCapture(event.pointerId);
    showPause();
  }
});
canvas.addEventListener("pointerup", () => {
  if (pointerUnavailable) {
    dragLooking = false;
    showPause();
  }
});
document.addEventListener("mousemove", (event) => {
  if (
    view !== "explore" ||
    (document.pointerLockElement !== canvas && !dragLooking)
  )
    return;
  yaw += event.movementX * 0.0022;
  pitch = THREE.MathUtils.clamp(pitch - event.movementY * 0.0022, -1.48, 1.48);
});
document.addEventListener("keydown", (event) => {
  if (view !== "explore" || help.open) return;
  const tag = (event.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "BUTTON") return;
  if (event.code === "Escape" && pointerUnavailable) {
    fallbackResumed = false;
    dragLooking = false;
    keys.clear();
    showPause();
    return;
  }
  if (
    document.pointerLockElement !== canvas &&
    !(pointerUnavailable && fallbackResumed)
  )
    return;
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
      event.code,
    )
  )
    event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === "KeyR") {
    resetPlayer();
    notice("Returned to the Commons");
  }
  if (event.code === "Digit1") setFlight(false);
  if (event.code === "Digit2") setFlight(true);
  if (event.code === "Space" && grounded && !flight) {
    basis();
    player.velocity = velocity
      .copy(player.velocity)
      .addScaledVector(up, 7)
      .clone();
    grounded = false;
  }
});
document.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => keys.clear());
document.addEventListener("visibilitychange", () => {
  keys.clear();
  fixedAccumulator = 0;
});
window.addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  if (view === "intro" && innerWidth > 700)
    camera.setViewOffset(
      innerWidth,
      innerHeight,
      -innerWidth * 0.19,
      0,
      innerWidth,
      innerHeight,
    );
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
});

function updateTelemetry() {
  const rho = Math.hypot(player.position.x, player.position.z);
  element("gravity-value").innerHTML =
    `${((ANGULAR_SPEED ** 2 * rho) / GRAVITY).toFixed(2)} <small>g</small>`;
  element("altitude-value").innerHTML =
    `${Math.max(0, FLOOR_RADIUS - rho).toFixed(1)} <small>m</small>`;
  element("speed-value").innerHTML =
    `${Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z).toFixed(1)} <small>m/s</small>`;
  const angle =
    (Math.atan2(player.position.z, player.position.x) + Math.PI * 2) %
    (Math.PI * 2);
  const nearest = HABITAT_DISTRICTS.reduce((best, item) =>
    Math.abs(
      Math.atan2(Math.sin(angle - item.angle), Math.cos(angle - item.angle)),
    ) <
    Math.abs(
      Math.atan2(Math.sin(angle - best.angle), Math.cos(angle - best.angle)),
    )
      ? item
      : best,
  );
  element("district").textContent =
    view === "explore" ? nearest.name.toUpperCase() : "STANFORD TORUS / 01";
  const marker = document.getElementById("map-position")!;
  marker.setAttribute("cx", String(40 + 29 * Math.cos(angle)));
  marker.setAttribute("cy", String(40 + 29 * Math.sin(angle)));
}

let previous = performance.now();
let telemetryClock = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - previous) / 1000, 0.05);
  previous = now;
  if (document.hidden) return;
  elapsed += dt;
  const active =
    view === "explore" &&
    !help.open &&
    (document.pointerLockElement === canvas ||
      (pointerUnavailable && fallbackResumed));
  if (active) {
    fixedAccumulator += dt;
    while (fixedAccumulator >= STEP) {
      simulatePlayer(STEP);
      fixedAccumulator -= STEP;
    }
  } else {
    fixedAccumulator = 0;
  }
  if (view === "explore") updateCamera();
  else controls.update(dt);
  if (!help.open && (active || view !== "explore")) {
    for (let i = probes.length - 1; i >= 0; i--) {
      const probe = probes[i];
      probe.age += dt;
      if (!probe.stopped) {
        const result = advanceBallistic(probe.state, dt);
        probe.state = result.state;
        probe.stopped = !!result.impact;
        probe.mesh.position.copy(probe.state.position);
        probe.trailPoints.push(probe.mesh.position.clone());
        if (probe.trailPoints.length > 450) probe.trailPoints.shift();
        const trailAttribute = probe.trail.geometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        probe.trailPoints.forEach((point, index) =>
          trailAttribute.setXYZ(index, point.x, point.y, point.z),
        );
        trailAttribute.needsUpdate = true;
        probe.trail.geometry.setDrawRange(0, probe.trailPoints.length);
      }
      if (probe.age > 32) {
        removeProbe(probe);
        probes.splice(i, 1);
      }
    }
  }
  ghostRefresh += dt;
  if (view === "explore" && ghostRefresh > 1 / 24) {
    refreshGhost();
    ghostRefresh = 0;
  }
  habitat.update(elapsed);
  telemetryClock += dt;
  if (telemetryClock > 0.1) {
    updateTelemetry();
    telemetryClock = 0;
  }
  renderer.render(scene, camera);
}
if (innerWidth > 700)
  camera.setViewOffset(
    innerWidth,
    innerHeight,
    -innerWidth * 0.19,
    0,
    innerWidth,
    innerHeight,
  );
requestAnimationFrame(frame);
