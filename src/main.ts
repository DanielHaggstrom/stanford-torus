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
import { buildSky } from "./sky";
import { buildAvatar } from "./avatar";
import { updateMotionRamp, walkSpeed, flightSpeed } from "./movement";
import {
  CHARGE_DELAY_SECONDS,
  TAP_LAUNCH_SPEED,
  chargeFraction,
  launchSpeed,
} from "./launcher";
import { buildOrbitMap } from "./orbit-map";
import {
  getOrbitState,
  ORBIT_PERIOD_SECONDS,
  ORBIT_START_PHASE,
} from "./orbit";
import { nextOrbitOccurrence } from "./time-skip";
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
scene.background = null;
function overviewFov(aspect: number) {
  return THREE.MathUtils.clamp(
    THREE.MathUtils.radToDeg(
      2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(55)) / aspect),
    ),
    65,
    105,
  );
}
const camera = new THREE.PerspectiveCamera(
  overviewFov(innerWidth / innerHeight),
  innerWidth / innerHeight,
  0.08,
  6000,
);
const habitat = buildHabitat(scene);
scene.background = null;
const sky = buildSky();
const avatar = buildAvatar();
renderer.autoClear = false;
const overviewPosition = new THREE.Vector3(600, 220, 300);
const overviewUp = new THREE.Vector3(-0.26, 0.805, 0.53).normalize();
const overviewTarget = new THREE.Vector3();
camera.position.copy(overviewPosition);
camera.up.copy(overviewUp);
const controls = new OrbitControls(camera, canvas);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
controls.minDistance = 270;
controls.maxDistance = 1100;
controls.enablePan = false;
controls.autoRotate = false;
controls.enableDamping = false;
controls.target.set(0, 0, 0);
controls.update();

type View = "intro" | "explore" | "orbit";
let view: View = "intro";
let hasEnteredHabitat = false;
let flight = false;
let grounded = true;
const OPENING_YAW = Math.PI;
const OPENING_PITCH = 1.1;
let yaw = OPENING_YAW;
let pitch = OPENING_PITCH;
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
let simulationRate = 1;
const TIME_RATES = [1, 5, 10];
const MAX_PROBES = 5;
let motionRamp = 0;
let chargeSource: "mouse" | "button" | "keyboard" | null = null;
let chargeStartedAt = 0;
let recoil = 0;
let fixedAccumulator = 0;
let ghostRefresh = 0;
const STEP = 1 / 120;
const eyeHeight = 1.7;
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
// Screen-sized markers keep the ghost readable against both sky and pale paving.
const ghostDotGeometry = new THREE.BufferGeometry();
ghostDotGeometry.setAttribute(
  "position",
  new THREE.BufferAttribute(new Float32Array(400 * 3), 3).setUsage(
    THREE.DynamicDrawUsage,
  ),
);
ghostDotGeometry.setDrawRange(0, 0);
const ghostDotBorder = new THREE.Points(
  ghostDotGeometry,
  new THREE.PointsMaterial({
    color: "#16352d",
    size: 5,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }),
);
const ghostDots = new THREE.Points(
  ghostDotGeometry,
  new THREE.PointsMaterial({
    color: "#d9ffab",
    size: 3,
    sizeAttenuation: false,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }),
);
ghostDotBorder.frustumCulled = ghostDots.frustumCulled = false;
ghostDotBorder.renderOrder = 2;
ghostDots.renderOrder = 3;
scene.add(ghostDotBorder, ghostDots);
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
const orbitMap = buildOrbitMap(element("orbit-map-panel"), skipToOrbitPhase);

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

function explorationActive() {
  return (
    view === "explore" &&
    !help.open &&
    (document.pointerLockElement === canvas ||
      (pointerUnavailable && fallbackResumed))
  );
}

function heldChargeSeconds() {
  return chargeSource
    ? Math.max(0, (performance.now() - chargeStartedAt) / 1000)
    : 0;
}

function effectiveLaunchSpeed() {
  return launchSpeed(heldChargeSeconds());
}

function updateLauncherUI() {
  const heldSeconds = heldChargeSeconds();
  const speed = Math.round(launchSpeed(heldSeconds));
  element("preview-label").textContent = `NEXT SHOT · ${speed} m/s`;
  element("charge-meter").setAttribute(
    "value",
    String(chargeFraction(heldSeconds)),
  );
  element("charge-status").textContent = chargeSource
    ? `${speed} m/s · ${heldSeconds < CHARGE_DELAY_SECONDS ? "hold to charge" : "release to launch"}`
    : "TAP TO FIRE · HOLD TO CHARGE";
  element("probe-count").textContent = `${probes.length} / ${MAX_PROBES}`;
  element("launch-button").classList.toggle("charging", chargeSource !== null);
  element<HTMLButtonElement>("launch-button").disabled = !explorationActive();
  element("launch-button").title = explorationActive()
    ? "Hold to charge; release to launch"
    : "Resume exploration to use the launcher";
}

function cancelCharge() {
  chargeSource = null;
  chargeStartedAt = 0;
  updateLauncherUI();
}

function beginCharge(source: "mouse" | "button" | "keyboard") {
  if (!explorationActive() || chargeSource) return;
  chargeSource = source;
  chargeStartedAt = performance.now();
  updateLauncherUI();
}

function releaseCharge() {
  if (!chargeSource) return;
  const speed = effectiveLaunchSpeed();
  const canFire = explorationActive();
  cancelCharge();
  if (canFire) launch(speed);
}

function clearProbes(showNotice = true) {
  for (const probe of probes) removeProbe(probe);
  probes.length = 0;
  updateLauncherUI();
  if (showNotice) notice("All probes cleared");
}

function setTimeRate(rate: number) {
  simulationRate = rate;
  element<HTMLSelectElement>("time-scale").value = String(rate);
  notice(`Simulation speed ${rate}×`);
}

function stepTimeRate(delta: number) {
  const index = TIME_RATES.indexOf(simulationRate);
  setTimeRate(
    TIME_RATES[THREE.MathUtils.clamp(index + delta, 0, TIME_RATES.length - 1)],
  );
}

function resetPlayer() {
  player = {
    position: { x: FLOOR_RADIUS, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
  };
  grounded = true;
  motionRamp = 0;
  yaw = OPENING_YAW;
  pitch = OPENING_PITCH;
  updateCamera();
  cancelCharge();
  clearProbes(false);
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
  if (!resumed) motionRamp = 0;
  updateLauncherUI();
}

async function captureMouse() {
  if (view !== "explore") return;
  element("resume-button").blur();
  canvas.focus({ preventScroll: true });
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
  if (view !== "explore") {
    overviewPosition.copy(camera.position);
    overviewUp.copy(camera.up);
    overviewTarget.copy(controls.target);
  }
  view = "explore";
  controls.enabled = false;
  scene.rotation.y = 0;
  document.body.className = "playing";
  element("intro").hidden = true;
  element("scene-caption").hidden = true;
  element("flight-panel").hidden = false;
  element("key-guide").hidden = false;
  element("orbit-map-panel").hidden = true;
  element("orbit-view-hint").hidden = true;
  camera.fov = 72;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  if (!hasEnteredHabitat) {
    resetPlayer();
    hasEnteredHabitat = true;
  } else updateCamera();
  element("enter-button").blur();
  element("tour-button").blur();
  void captureMouse();
  showPause();
}

function orbitView() {
  cancelCharge();
  document.exitPointerLock?.();
  keys.clear();
  view = "orbit";
  fallbackResumed = false;
  dragLooking = false;
  document.body.className = "orbiting";
  element("intro").hidden = true;
  element("scene-caption").hidden = true;
  element("flight-panel").hidden = true;
  element("resume-hint").hidden = true;
  element("crosshair").hidden = true;
  element("key-guide").hidden = true;
  element("orbit-map-panel").hidden = false;
  element("orbit-view-hint").hidden = false;
  controls.enabled = true;
  camera.up.copy(overviewUp);
  camera.position.copy(overviewPosition);
  camera.fov = overviewFov(camera.aspect);
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  controls.target.copy(overviewTarget);
  controls.update();
  orbitMap.update(elapsed);
  canvas.focus({ preventScroll: true });
  ghost.visible =
    ghostDots.visible =
    ghostDotBorder.visible =
    impactMarker.visible =
      false;
  notice("Inertial orbit view · O returns to the habitat");
}

function toggleOrbitView() {
  if (view === "orbit") enterHabitat();
  else orbitView();
}

function skipToOrbitPhase(targetPhase: number) {
  if (view !== "orbit") return;
  const previousTime = elapsed;
  elapsed = nextOrbitOccurrence(
    elapsed,
    targetPhase,
    ORBIT_PERIOD_SECONDS,
    ORBIT_START_PHASE,
  );
  cancelCharge();
  keys.clear();
  motionRamp = 0;
  fixedAccumulator = 0;
  let removed = 0;
  for (let i = probes.length - 1; i >= 0; i--) {
    if (!probes[i].stopped) {
      removeProbe(probes[i]);
      probes.splice(i, 1);
      removed++;
    }
  }
  player.velocity = { x: 0, y: 0, z: 0 };
  grounded =
    Math.hypot(player.position.x, player.position.z) >= FLOOR_RADIUS - 0.001;
  updateLauncherUI();
  updateTelemetry();
  orbitMap.update(elapsed);
  notice(
    `Skipped forward ${((elapsed - previousTime) / 60).toFixed(1)} min · ${removed} airborne probes cleared`,
  );
}

function currentShot(speed = effectiveLaunchSpeed()): MotionState {
  updateCamera();
  const origin = camera.position
    .clone()
    .addScaledVector(direction, 0.65)
    .addScaledVector(right, 0.25)
    .addScaledVector(up, -0.2);
  const originRadius = Math.hypot(origin.x, origin.z);
  if (originRadius > FLOOR_RADIUS - 0.1) {
    origin.x *= (FLOOR_RADIUS - 0.1) / originRadius;
    origin.z *= (FLOOR_RADIUS - 0.1) / originRadius;
  }
  // Avoid starting beyond the side wall when aiming outwards near an edge.
  origin.y = THREE.MathUtils.clamp(origin.y, -21.9, 21.9);
  const initialVelocity = direction
    .clone()
    .multiplyScalar(speed)
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
  ghostDots.visible = ghostDotBorder.visible = ghost.visible;
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
  const dotPositions = ghostDotGeometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;
  let dotCount = 0;
  for (let i = 4; i < points.length && dotCount < 400; i += 4) {
    dotPositions.setXYZ(dotCount++, points[i].x, points[i].y, points[i].z);
  }
  dotPositions.needsUpdate = true;
  ghostDotGeometry.setDrawRange(0, dotCount);
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

function launch(speed = TAP_LAUNCH_SPEED) {
  const now = performance.now() / 1000;
  if (!explorationActive() || now - lastShot < 0.16) return;
  lastShot = now;
  recoil = 1;
  if (probes.length >= MAX_PROBES) removeProbe(probes.shift()!);
  const state = currentShot(speed);
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
  updateLauncherUI();
  notice(
    `Probe launched at ${Math.round(speed)} m/s · ${probes.length} / ${MAX_PROBES} probes`,
  );
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
  motionRamp = updateMotionRamp(motionRamp, desired.lengthSq() > 0, dt);
  desired.multiplyScalar(
    flight ? flightSpeed(motionRamp, boost) : walkSpeed(motionRamp, boost),
  );
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
element("walk-button").addEventListener("click", () => {
  setFlight(false);
  element("walk-button").blur();
});
element("fly-button").addEventListener("click", () => {
  setFlight(true);
  element("fly-button").blur();
});
element("resume-button").addEventListener("click", () => void captureMouse());
element("launch-button").addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  beginCharge("button");
  element("launch-button").setPointerCapture(event.pointerId);
});
element("launch-button").addEventListener("click", (event) => {
  if (event.detail === 0) launch();
  element("launch-button").blur();
});
element("clear-button").addEventListener("click", () => {
  cancelCharge();
  clearProbes();
  element("clear-button").blur();
});
element<HTMLSelectElement>("time-scale").addEventListener("change", (event) => {
  setTimeRate(Number((event.target as HTMLSelectElement).value));
  (event.target as HTMLSelectElement).blur();
});
ghostToggle.addEventListener("change", refreshGhost);
element("help-button").addEventListener("click", () => {
  cancelCharge();
  document.exitPointerLock?.();
  keys.clear();
  help.showModal();
});
element("close-help").addEventListener("click", () => help.close());
document.addEventListener("pointerlockchange", () => {
  cancelCharge();
  keys.clear();
  dragLooking = false;
  showPause();
});
document.addEventListener("pointerlockerror", () => {
  cancelCharge();
  pointerUnavailable = true;
  element("drag-hint").hidden = false;
  element("resume-button").textContent = "Continue with drag to look ↗";
  showPause();
});
canvas.addEventListener("click", () => {
  if (view !== "explore") return;
  if (document.pointerLockElement !== canvas && !pointerUnavailable)
    void captureMouse();
});
canvas.addEventListener("pointerdown", (event) => {
  canvas.focus({ preventScroll: true });
  if (event.button === 0 && document.pointerLockElement === canvas)
    beginCharge("mouse");
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
document.addEventListener("pointerup", (event) => {
  if (
    event.button === 0 &&
    (chargeSource === "mouse" || chargeSource === "button")
  )
    releaseCharge();
});
document.addEventListener("pointercancel", () => {
  cancelCharge();
  dragLooking = false;
  showPause();
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
  if (help.open || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.code === "KeyO") {
    event.preventDefault();
    if (!event.repeat) toggleOrbitView();
    return;
  }
  const tag = (event.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "SELECT" || tag === "BUTTON") return;
  if (["Comma", "Period"].includes(event.code)) {
    event.preventDefault();
    stepTimeRate(event.code === "Period" ? 1 : -1);
    return;
  }
  if (
    (view === "explore" || view === "orbit") &&
    event.code === "KeyC" &&
    !event.repeat
  ) {
    cancelCharge();
    clearProbes();
    return;
  }
  if (view !== "explore") return;
  if (event.code === "Escape" && pointerUnavailable) {
    cancelCharge();
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
  if (event.code === "KeyF") beginCharge("keyboard");
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
document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  if (event.code === "KeyF" && chargeSource === "keyboard") releaseCharge();
});
window.addEventListener("blur", () => {
  keys.clear();
  cancelCharge();
  motionRamp = 0;
});
document.addEventListener("visibilitychange", () => {
  keys.clear();
  cancelCharge();
  fixedAccumulator = 0;
  previous = performance.now();
});
window.addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = view === "explore" ? 72 : overviewFov(camera.aspect);
  if (view === "intro" && innerWidth > 700)
    camera.setViewOffset(
      innerWidth,
      innerHeight,
      -innerWidth * 0.12,
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
  const dt = Math.min((now - previous) / 1000, 0.1);
  previous = now;
  if (document.hidden) return;
  const active = explorationActive();
  const simulationRunning = !help.open && (active || view === "orbit");
  const simulationDelta = simulationRunning ? dt * simulationRate : 0;
  elapsed += simulationDelta;
  if (active && chargeSource) {
    updateLauncherUI();
  }
  if (!active && chargeSource) cancelCharge();
  recoil *= Math.exp(-13 * dt);
  if (active || (view === "orbit" && hasEnteredHabitat && simulationRunning)) {
    fixedAccumulator += simulationDelta;
    while (fixedAccumulator >= STEP) {
      simulatePlayer(STEP);
      fixedAccumulator -= STEP;
    }
  } else {
    fixedAccumulator = 0;
  }
  if (view === "explore") updateCamera();
  else controls.update(dt);
  document.body.classList.toggle(
    "looking-down",
    view === "explore" && pitch < -0.65,
  );
  if (simulationRunning) {
    for (let i = probes.length - 1; i >= 0; i--) {
      const probe = probes[i];
      probe.age += simulationDelta;
      if (!probe.stopped) {
        const result = advanceBallistic(probe.state, simulationDelta);
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
      if (!probe.stopped && probe.age > 32) {
        removeProbe(probe);
        probes.splice(i, 1);
        updateLauncherUI();
      }
    }
  }
  ghostRefresh += dt;
  if (view === "explore" && ghostRefresh > 1 / 24) {
    refreshGhost();
    ghostRefresh = 0;
  }
  const inertialView = view !== "explore";
  scene.rotation.y = inertialView
    ? (elapsed * ANGULAR_SPEED) % (Math.PI * 2)
    : 0;
  const orbit = sky.update(
    elapsed,
    camera,
    inertialView ? "inertial" : "habitat",
  );
  habitat.update(elapsed, inertialView ? getOrbitState(elapsed) : orbit);
  avatar.update({
    deltaSeconds: dt,
    movementSpeed: Math.hypot(
      player.velocity.x,
      player.velocity.y,
      player.velocity.z,
    ),
    grounded,
    flying: flight,
    charge: chargeFraction(heldChargeSeconds()),
    recoil,
    pitch,
    aspect: camera.aspect,
    visible: view === "explore",
    reducedMotion: reducedMotion.matches,
  });
  telemetryClock += dt;
  if (telemetryClock > 0.1) {
    updateTelemetry();
    if (view === "orbit") orbitMap.update(elapsed);
    const totalSeconds = Math.floor(elapsed);
    element("simulation-clock").textContent =
      `T+${String(Math.floor(totalSeconds / 3600)).padStart(2, "0")}:${String(Math.floor(totalSeconds / 60) % 60).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
    element("sun-state").textContent =
      orbit.sunlight < 0.01
        ? "EARTH SHADOW"
        : orbit.sunlight < 0.99
          ? "PENUMBRA"
          : "SUNLIT";
    telemetryClock = 0;
  }
  renderer.clear();
  renderer.render(sky.scene, sky.camera);
  renderer.clearDepth();
  renderer.render(scene, camera);
  if (view === "explore") {
    renderer.clearDepth();
    renderer.render(avatar.scene, avatar.camera);
  }
}
if (innerWidth > 700)
  camera.setViewOffset(
    innerWidth,
    innerHeight,
    -innerWidth * 0.12,
    0,
    innerWidth,
    innerHeight,
  );
updateLauncherUI();
requestAnimationFrame(frame);
