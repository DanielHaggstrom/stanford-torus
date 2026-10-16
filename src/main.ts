import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildHabitat, HABITAT_DISTRICTS } from "./habitat";
import {
  ANGULAR_SPEED,
  FLOOR_RADIUS,
  GRAVITY,
  rotationVelocity,
  stepFreeFlight,
} from "./physics";
import type { MotionState } from "./physics";
import { buildSky } from "./sky";
import { buildAvatar } from "./avatar";
import { buildAudio } from "./audio";
import { buildSceneryCollision } from "./scenery-collision";
import { createTrajectoryCache } from "./trajectory-cache";
import { predictionPoint, trailPoint } from "./trajectory-frame";
import { isInsideHabitat } from "./habitat-volume";
import { resolvePlayerDeck, isOverDeck } from "./player-boundaries";
import { AXIS_SUNLIGHT_THRESHOLD } from "./axis-tracking";
import { updateMotionRamp, walkSpeed, flightSpeed } from "./movement";
import { createFlightAssist, advanceAssistedFlight } from "./flight-assist";
import { createJumpAssist } from "./jump-assist";
import { loadPreferences, savePreferences } from "./preferences";
import { constrainToExplorationSphere, firstExplorationExit, getBoundaryClearance } from "./exploration-boundary";
import { buildExplorationShell } from "./exploration-shell";
import {
  CHARGE_DELAY_SECONDS,
  TAP_LAUNCH_SPEED,
  FULL_LAUNCH_SPEED,
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
import { getTramState } from "./tram-motion";
import {
  TRAM_DECK_HEIGHT,
  carryTramRider,
  resolveTramCollision,
  walkingSupportHeight,
  tramSurfaceVelocity,
} from "./tram-physics";
import type { TramSupport } from "./tram-physics";
import { buildTouchControls } from "./touch-controls";
import { getRenderBudget } from "./render-quality";
import type { GraphicsQuality } from "./render-quality";
import { requestLandscape } from "./landscape";
import type { LandscapeOrientation } from "./landscape";
import { buildBenchmark } from "./benchmark";
import "./style.css";
import "./touch.css";

const element = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
let preferenceStorage: Storage | null = null;
try { preferenceStorage = window.localStorage; } catch { /* Storage is optional. */ }
const preferences = loadPreferences(preferenceStorage);
for (const [id, value] of [
  ["input-mode", preferences.inputMode],
  ["graphics-quality", preferences.graphicsQuality],
  ["mouse-sensitivity", preferences.mouseSensitivity],
  ["touch-sensitivity", preferences.touchSensitivity],
  ["sound-volume", preferences.soundVolume * 100],
] as const) element<HTMLInputElement | HTMLSelectElement>(id).value = String(value);
function persistPreferences() { savePreferences(preferenceStorage, preferences); }
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
let renderBudget = getRenderBudget(
  preferences.graphicsQuality,
  matchMedia("(pointer: coarse)").matches,
  devicePixelRatio,
);
renderer.setPixelRatio(renderBudget.pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
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
  0.18,
  2000,
);
const habitat = buildHabitat(scene);
const scenery = buildSceneryCollision(habitat.colliders);
const explorationShell = buildExplorationShell(scene);
const trajectoryCache = createTrajectoryCache((shot: MotionState) => {
  const contact = scenery.firstImpact(shot, 30);
  const exit = firstExplorationExit(shot, 30);
  const exitsFirst = exit !== null && (!contact || exit < contact.time);
  const impact = exitsFirst ? null : contact;
  const duration = exitsFirst ? exit : impact?.time ?? 30;
  return {
    impact,
    duration,
    exit: exitsFirst ? exit : null,
    points: scenery.sampleTrajectory(shot, {
      duration,
      step: 0.04,
      stopAtCollision: false,
    }),
  };
});
const sky = buildSky();
const avatar = buildAvatar();
const audio = buildAudio();
let soundMuted = preferences.soundMuted;
audio.setMuted(soundMuted);
audio.setVolume(preferences.soundVolume);
renderer.autoClear = false;
const overviewPosition = new THREE.Vector3(620, 320, 330);
const overviewUp = new THREE.Vector3(-0.26, 0.805, 0.53).normalize();
const overviewTarget = new THREE.Vector3(0, 100, 0);
camera.position.copy(overviewPosition);
camera.up.copy(overviewUp);
const controls = new OrbitControls(camera, canvas);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
controls.minDistance = 270;
controls.maxDistance = 1100;
controls.enablePan = false;
controls.autoRotate = false;
controls.enableDamping = false;
controls.target.copy(overviewTarget);
controls.update();

type View = "explore" | "orbit";
let view: View = "explore";
let hasStartedExploration = false;
let landscapeBlocked = false;
let orientationLockedByGame = false;
const portraitViewport = matchMedia("(orientation: portrait)");
let flight = false;
let grounded = true;
let sceneryGrounded = false;
let tramSupport: TramSupport | null = null;
let lastTramPush = -Infinity;
const OPENING_YAW = Math.PI;
const OPENING_PITCH = 1.1;
let pitch = OPENING_PITCH;
let player: MotionState = {
  position: { x: FLOOR_RADIUS, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
};
const keys = new Set<string>();
function openingDirection() {
  return { x: -Math.sin(OPENING_PITCH), y: Math.sin(OPENING_YAW) * Math.cos(OPENING_PITCH), z: Math.cos(OPENING_YAW) * Math.cos(OPENING_PITCH) };
}
const flightAssist = createFlightAssist(player.position, openingDirection(), { x: -1, y: 0, z: 0 });
const jumpAssist = createJumpAssist();
let navigationElapsed = 0;
let resetHeldAt: number | null = null;
let touchPrecision = false;
let lastBoundaryNotice = -Infinity;
function clearNavigationInputs() {
  keys.clear();
  jumpAssist.reset();
  resetHeldAt = null;
}
const up = new THREE.Vector3();
const heading = new THREE.Vector3();
const right = new THREE.Vector3();
const direction = new THREE.Vector3();
const position = new THREE.Vector3();
const velocity = new THREE.Vector3();
let dragLooking = false;
let pointerUnavailable = false;
let fallbackResumed = false;
let touchResumed = false;
let lastShot = -Infinity;
let elapsed = 0;
let simulationRate = 1;
const TIME_RATES = [1, 5, 10];
const MAX_PROBES = 5;
let motionRamp = 0;
let chargeSource: "mouse" | "button" | "keyboard" | "touch" | null = null;
let chargePointerId: number | null = null;
let chargeStartedAt = 0;
let recoil = 0;
let fixedAccumulator = 0;
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
    depthWrite: false,
  }),
);
ghost.frustumCulled = false;
ghost.renderOrder = 1;
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
    transparent: true,
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
    transparent: true,
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
    depthTest: false,
    depthWrite: false,
  }),
);
impactMarker.renderOrder = 4;
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
  trailTimes: number[];
  age: number;
  stopped: boolean;
}
const probes: Probe[] = [];
const orbitMap = buildOrbitMap(element("orbit-map-panel"), skipToOrbitPhase);
const touch = buildTouchControls({
  look(dx, dy) {
    if (!explorationActive()) return;
    flightAssist.look(dx * 0.004 * preferences.touchSensitivity, -dy * 0.004 * preferences.touchSensitivity);
  },
  jump: jumpPlayer,
  beginCharge: () => beginCharge("touch"),
  releaseCharge() {
    if (chargeSource === "touch") releaseCharge();
  },
  cancelCharge() {
    if (chargeSource === "touch") cancelCharge();
  },
  toggleFlight() {
    if (view === "explore") setFlight(!flight);
  },
  togglePrecision() {
    touchPrecision = !touchPrecision;
    touch.setPrecision(touchPrecision);
    notice(touchPrecision ? "Precision flight enabled" : "Cruising flight enabled");
  },
  toggleOrbit: toggleOrbitView,
  pause() {
    if (explorationActive()) pauseExploration();
    else void captureMouse();
  },
  enabledChanged() {
    pauseExploration();
    applyRenderBudget();
    element("mode-description").textContent = movementDescription();
    updateLandscapeState();
  },
});

function applyRenderBudget() {
  const quality = element<HTMLSelectElement>("graphics-quality")
    .value as GraphicsQuality;
  renderBudget = getRenderBudget(quality, touch.enabled, devicePixelRatio);
  renderer.setPixelRatio(renderBudget.pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
}

function updateLandscapeState() {
  if (!touch.enabled) releaseLandscapeLock();
  const blocked = touch.enabled && portraitViewport.matches;
  if (blocked === landscapeBlocked) return;
  landscapeBlocked = blocked;
  document.documentElement.classList.toggle("landscape-blocked", blocked);
  const prompt = element("landscape-prompt");
  prompt.hidden = !blocked;
  for (const node of document.body.children) {
    if (node instanceof HTMLElement && node !== prompt && node.id !== "fatal-error")
      node.inert = blocked;
  }
  if (blocked) {
    touch.reset();
    clearNavigationInputs();
    motionRamp = 0;
    cancelCharge();
    if (help.open) help.close();
    element("landscape-button").focus({ preventScroll: true });
  }
  showPause();
}

async function useLandscape() {
  const button = element<HTMLButtonElement>("landscape-button");
  button.disabled = true;
  const result = await requestLandscape(
    document,
    screen.orientation as ScreenOrientation & LandscapeOrientation,
  );
  orientationLockedByGame = result.locked;
  if (!touch.enabled) releaseLandscapeLock();
  button.disabled = false;
  if (portraitViewport.matches) {
    element("landscape-message").textContent = result.locked
      ? "Switching to landscape. You can also turn your device sideways."
      : "Turn your device sideways to continue. If it stays upright, turn off your phone’s rotation lock.";
  }
  updateLandscapeState();
}

function releaseLandscapeLock() {
  if (!orientationLockedByGame) return;
  try {
    screen.orientation?.unlock?.();
  } catch {
    // A hidden document or a browser without unlock support needs no action.
  }
  orientationLockedByGame = false;
}

function notice(message: string) {
  const box = element("notice");
  box.textContent = message;
  box.classList.add("visible");
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => box.classList.remove("visible"), 3500);
}
let noticeTimer = 0;

function basis(simTime = elapsed) {
  const axes = flightAssist.basis(simTime);
  up.copy(axes.up);
  direction.copy(axes.direction);
  right.copy(axes.right);
  heading.copy(direction).addScaledVector(up, -direction.dot(up)).normalize();
  pitch = Math.asin(THREE.MathUtils.clamp(direction.dot(up), -1, 1));
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
    !landscapeBlocked &&
    !help.open &&
    (touch.enabled
      ? touchResumed
      : document.pointerLockElement === canvas ||
        (pointerUnavailable && fallbackResumed))
  );
}

function updateAudio(deltaSeconds = 0) {
  const surface = tramSupport && grounded
    ? tramSurfaceVelocity(player.position, tramSupport, elapsed)
    : { x: 0, y: 0, z: 0 };
  audio.update({
    position: camera.position,
    forward: direction,
    up,
    relativeSpeed: Math.hypot(
      player.velocity.x - surface.x,
      player.velocity.y - surface.y,
      player.velocity.z - surface.z,
    ),
    grounded,
    flying: flight,
    active: explorationActive() && !document.hidden && document.hasFocus(),
    simSeconds: elapsed,
    deltaSeconds,
    simulationRate,
  });
}

function toggleSound() {
  soundMuted = !soundMuted;
  preferences.soundMuted = soundMuted;
  persistPreferences();
  updateSoundUI();
}

function updateSoundUI() {
  audio.setMuted(soundMuted);
  const button = element("sound-toggle");
  button.textContent = soundMuted ? "Sound off" : "Sound on";
  button.setAttribute("aria-pressed", String(!soundMuted));
  button.setAttribute("aria-label", soundMuted ? "Unmute sound (M)" : "Mute sound (M)");
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
  element("touch-shot-speed").textContent = `${speed} m/s`;
  element<HTMLProgressElement>("touch-charge-meter").value =
    chargeFraction(heldSeconds);
  element("touch-fire").classList.toggle("charging", chargeSource === "touch");
}

function cancelCharge() {
  chargeSource = null;
  chargePointerId = null;
  chargeStartedAt = 0;
  updateLauncherUI();
}

function beginCharge(
  source: "mouse" | "button" | "keyboard" | "touch",
  pointerId: number | null = null,
) {
  if (!explorationActive() || chargeSource) return;
  chargeSource = source;
  chargePointerId = pointerId;
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
  document.documentElement.classList.toggle("accelerated-time", rate !== 1);
  notice(`Simulation speed ${rate}×`);
}

function stepTimeRate(delta: number) {
  const index = TIME_RATES.indexOf(simulationRate);
  setTimeRate(
    TIME_RATES[THREE.MathUtils.clamp(index + delta, 0, TIME_RATES.length - 1)],
  );
}

function resetPlayer() {
  audio.reset();
  touch.reset();
  player = {
    position: { x: FLOOR_RADIUS, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
  };
  grounded = true;
  sceneryGrounded = false;
  tramSupport = null;
  motionRamp = 0;
  jumpAssist.reset();
  pitch = OPENING_PITCH;
  flightAssist.reset(player.position, openingDirection(), { x: -1, y: 0, z: 0 }, elapsed);
  updateCamera();
  cancelCharge();
  clearProbes(false);
}

function movementDescription() {
  if (flight)
    return flightAssist.frame === "space"
      ? "Space flight · inertial stabilization."
      : "Habitat flight · follows the rotating ring.";
  return touch.enabled
    ? "Follow the promenade. Tap Jump to leave the ground."
    : "Follow the promenade. Space to jump.";
}

function setFlight(enabled: boolean) {
  flight = enabled;
  jumpAssist.reset();
  touch.setFlight(enabled);
  if (enabled) {
    tramSupport = null;
    sceneryGrounded = false;
  }
  element("walk-button").classList.toggle("selected", !flight);
  element("fly-button").classList.toggle("selected", flight);
  element("mode-description").textContent = movementDescription();
  if (view === "explore")
    notice(
      flight
        ? touch.enabled
          ? "Flight enabled · Hold Rise or Down to change height"
          : "Flight enabled · Space to rise, Q to descend"
        : touch.enabled
          ? "Walking enabled · Tap Jump to leave the ground"
          : "Walking enabled · Space to jump",
    );
}

function showPause() {
  const resumed = !landscapeBlocked && (
    touch.enabled
      ? touchResumed
      : document.pointerLockElement === canvas ||
        (pointerUnavailable && fallbackResumed));
  if (resumed) hasStartedExploration = true;
  const startupHint = !hasStartedExploration && !touch.enabled;
  element("resume-hint").classList.toggle("startup-hint", startupHint);
  element("resume-hint").querySelector("strong")!.textContent = startupHint
    ? "Click to explore"
    : "Ready when you are.";
  element("resume-hint").hidden = view !== "explore" || resumed || landscapeBlocked;
  element("crosshair").hidden = view !== "explore" || !resumed;
  if (!resumed) {
    motionRamp = 0;
    resetHeldAt = null;
    jumpAssist.reset();
  }
  touch.setActive(explorationActive());
  element("touch-pause").textContent = resumed ? "Pause" : "Resume";
  element("touch-pause").setAttribute(
    "aria-label",
    resumed ? "Pause exploration" : "Resume exploration",
  );
  element("orbit-camera-hint").textContent = touch.enabled
    ? "Drag to inspect · Pinch to zoom"
    : "Drag / arrows to inspect · Scroll / + − to zoom · N map";
  if (touch.enabled) {
    element("resume-button").textContent = "Resume exploration ↗";
    element("resume-instructions").textContent =
      "Use the left stick to move and drag the world to look.";
    element("drag-hint").hidden = true;
  } else {
    element("resume-instructions").textContent = startupHint
      ? "Click or press Enter to explore. WASD moves; H opens controls."
      : "Enter resumes. Esc pauses; H opens controls; Tab selects settings.";
    element("resume-button").textContent = pointerUnavailable
      ? "Continue with drag to look ↗"
      : startupHint
        ? "Explore ↗"
        : "Resume exploration ↗";
    element("drag-hint").hidden = !pointerUnavailable;
  }
  updateLauncherUI();
  updateAudio();
}

function pauseExploration() {
  touchResumed = false;
  fallbackResumed = false;
  dragLooking = false;
  clearNavigationInputs();
  motionRamp = 0;
  touch.reset();
  cancelCharge();
  document.exitPointerLock?.();
  showPause();
}

function jumpPlayer() {
  if (!explorationActive() || flight) return;
  jumpAssist.press(navigationElapsed);
}

function openControls() {
  pauseExploration();
  help.showModal();
  updateAudio();
}

// Use the same camera limits as mouse/touch orbiting, in the camera's own up frame.
const orbitOffset = new THREE.Vector3();
const orbitUpRotation = new THREE.Quaternion();
const orbitSpherical = new THREE.Spherical();
const worldUp = new THREE.Vector3(0, 1, 0);
function updateKeyboardCamera(dt: number) {
  const horizontal = Number(keys.has("KeyL")) - Number(keys.has("KeyJ"));
  const vertical = Number(keys.has("KeyI")) - Number(keys.has("KeyK"));
  if (view === "explore") {
    if (explorationActive()) flightAssist.look(horizontal * dt * 1.4, vertical * dt * 1.4);
    return;
  }
  const yaw = Number(keys.has("ArrowRight") || keys.has("KeyD")) - Number(keys.has("ArrowLeft") || keys.has("KeyA"));
  const pitch = Number(keys.has("ArrowDown") || keys.has("KeyS")) - Number(keys.has("ArrowUp") || keys.has("KeyW"));
  const zoom = Number(keys.has("Minus") || keys.has("NumpadSubtract")) - Number(keys.has("Equal") || keys.has("NumpadAdd"));
  if (!(yaw || pitch || zoom)) return;
  orbitUpRotation.setFromUnitVectors(camera.up, worldUp);
  orbitOffset.copy(camera.position).sub(controls.target).applyQuaternion(orbitUpRotation);
  orbitSpherical.setFromVector3(orbitOffset);
  orbitSpherical.theta -= yaw * dt;
  orbitSpherical.phi = THREE.MathUtils.clamp(orbitSpherical.phi + pitch * dt, 0.05, Math.PI - 0.05);
  orbitSpherical.radius = THREE.MathUtils.clamp(orbitSpherical.radius * Math.exp(zoom * dt), controls.minDistance, controls.maxDistance);
  orbitOffset.setFromSpherical(orbitSpherical).applyQuaternion(orbitUpRotation.invert());
  camera.position.copy(controls.target).add(orbitOffset);
}

function performJump() {
  player.velocity = velocity
    .copy(player.velocity)
    .addScaledVector(up, 8)
    .clone();
  grounded = false;
  sceneryGrounded = false;
  tramSupport = null;
}

async function captureMouse() {
  if (view !== "explore") return;
  element("resume-button").blur();
  canvas.focus({ preventScroll: true });
  if (touch.enabled) {
    touchResumed = true;
    showPause();
    return;
  }
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
    fallbackResumed = true;
    element("drag-hint").hidden = false;
    element("resume-button").textContent = "Continue with drag to look ↗";
    notice("Use WASD to move, and drag the world to look.");
    showPause();
  }
}

function enterHabitat(capture = true) {
  touch.reset();
  document.documentElement.classList.remove("systems-open");
  element("touch-systems-toggle").setAttribute("aria-expanded", "false");
  if (view !== "explore") {
    overviewPosition.copy(camera.position);
    overviewUp.copy(camera.up);
    overviewTarget.copy(controls.target);
  }
  view = "explore";
  controls.enabled = false;
  scene.rotation.y = 0;
  document.body.className = "playing";
  element("flight-panel").hidden = false;
  element("key-guide").hidden = false;
  element("orbit-map-panel").hidden = true;
  element("orbit-view-hint").hidden = true;
  camera.fov = 72;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  updateCamera();
  if (capture) void captureMouse();
  else touchResumed = touch.enabled;
  showPause();
}

function orbitView() {
  audio.reset();
  touch.setActive(false);
  touchResumed = false;
  document.documentElement.classList.remove("systems-open", "map-collapsed");
  element("touch-systems-toggle").setAttribute("aria-expanded", "false");
  element("touch-map-toggle").setAttribute("aria-expanded", "true");
  cancelCharge();
  document.exitPointerLock?.();
  clearNavigationInputs();
  view = "orbit";
  updateAudio();
  fallbackResumed = false;
  dragLooking = false;
  document.body.className = "orbiting";
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
  notice(
    touch.enabled
      ? "Inertial orbit view · Use Return to habitat to go back"
      : "Inertial orbit view · O returns to the habitat",
  );
}

function toggleOrbitView() {
  if (view === "orbit") enterHabitat();
  else orbitView();
}

function skipToOrbitPhase(targetPhase: number) {
  if (view !== "orbit") return;
  audio.reset();
  const previousTime = elapsed;
  elapsed = nextOrbitOccurrence(
    elapsed,
    targetPhase,
    ORBIT_PERIOD_SECONDS,
    ORBIT_START_PHASE,
  );
  flightAssist.rebaseTime(previousTime, elapsed);
  jumpAssist.reset();
  cancelCharge();
  touch.reset();
  clearNavigationInputs();
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
  const spin = rotationVelocity(player.position);
  player.velocity = flightAssist.frame === "space"
    ? { x: -spin.x, y: 0, z: -spin.z }
    : { x: 0, y: 0, z: 0 };
  tramSupport = null;
  const roofHeight = scenery.supportHeight(player.position, player.position, 0.02);
  sceneryGrounded = roofHeight !== null && Math.abs(
    FLOOR_RADIUS - Math.hypot(player.position.x, player.position.z) - roofHeight,
  ) < 0.025;
  grounded =
    sceneryGrounded || (isOverDeck(player) && Math.abs(Math.hypot(player.position.x, player.position.z) - FLOOR_RADIUS) < 0.001);
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
  // A protruding launcher must not spawn its probe through a nearby thin wall.
  const muzzleContact = scenery.firstImpact({
    position: camera.position,
    velocity: origin.clone().sub(camera.position),
  }, 1, { angularSpeed: 0 });
  if (muzzleContact) {
    const towardEye = camera.position.clone().sub(origin);
    const side = towardEye.dot(muzzleContact.normal) >= 0 ? 1 : -1;
    origin.copy(muzzleContact.position).addScaledVector(muzzleContact.normal, side * 0.01);
  }
  const initialVelocity = direction
    .clone()
    .multiplyScalar(speed)
    .add(new THREE.Vector3().copy(player.velocity));
  // A space-stabilized launcher does not inherit the ring's rotation at its muzzle offset.
  initialVelocity.addScaledVector(
    new THREE.Vector3().copy(rotationVelocity(origin.clone().sub(player.position))),
    -(1 - flightAssist.habitatWeight),
  );
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
  const prediction = trajectoryCache.get(shot);
  const { impact, exit, duration } = prediction;
  const points = prediction.points.map((point, index) => predictionPoint(
    point,
    index === prediction.points.length - 1 ? duration : index * 0.04,
    flightAssist.habitatWeight,
  ));
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
  element("flight-time").textContent = impact
    ? `${impact.time.toFixed(1)} s to ${flightAssist.frame === "space" ? "future contact" : "contact"}`
    : exit !== null ? `${exit.toFixed(1)} s to limit` : "> 30 s";
  // In space, contact belongs to a future pose of the rotating surface.
  if (impact && flightAssist.habitatWeight >= 0.999) {
    const contactNormal = new THREE.Vector3().copy(impact.normal);
    if (contactNormal.dot(stepFreeFlight(shot, impact.time).velocity) > 0)
      contactNormal.negate();
    impactMarker.position
      .copy(impact.position)
      .addScaledVector(contactNormal, 0.07);
    impactMarker.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      contactNormal,
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
  updateAudio();
  audio.shot((speed - TAP_LAUNCH_SPEED) / (FULL_LAUNCH_SPEED - TAP_LAUNCH_SPEED));
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
    trailTimes: [elapsed],
    age: 0,
    stopped: false,
  });
  updateLauncherUI();
}

function simulatePlayer(dt: number, simTime: number) {
  const previousState = player;
  const endTime = simTime + dt;
  if (tramSupport && grounded && !flight)
    player = carryTramRider(player, tramSupport, simTime, endTime);
  const realStep = dt / simulationRate;
  navigationElapsed += realStep;
  basis(simTime);
  jumpAssist.updateGrounded(grounded, navigationElapsed);
  if (!flight && jumpAssist.consume(navigationElapsed)) performJump();
  const moveForward = THREE.MathUtils.clamp(
    Number(keys.has("KeyW") || keys.has("ArrowUp")) -
      Number(keys.has("KeyS") || keys.has("ArrowDown")) +
      touch.state.forward,
    -1,
    1,
  );
  const moveRight = THREE.MathUtils.clamp(
    Number(keys.has("KeyD") || keys.has("ArrowRight")) -
      Number(keys.has("KeyA") || keys.has("ArrowLeft")) +
      touch.state.right,
    -1,
    1,
  );
  const precision = (touch.enabled && touchPrecision) || keys.has("ShiftLeft") || keys.has("ShiftRight");
  const desired = new THREE.Vector3()
    .addScaledVector(flight ? direction : heading, moveForward)
    .addScaledVector(right, moveRight);
  if (flight)
    desired.addScaledVector(
      up,
      THREE.MathUtils.clamp(
        Number(keys.has("Space")) - Number(keys.has("KeyQ")) + touch.state.vertical,
        -1,
        1,
      ),
    );
  if (desired.lengthSq() > 1) desired.normalize();
  motionRamp = updateMotionRamp(motionRamp, desired.lengthSq() > 0, realStep);
  desired.multiplyScalar(
    flight ? flightSpeed(motionRamp, precision) : walkSpeed(motionRamp),
  );
  velocity.copy(player.velocity);
  if (flight) {
    const assisted = advanceAssistedFlight(player, desired, dt, flightAssist.habitatWeight, precision);
    const collision = resolvePlayerDeck(assisted, previousState);
    player = collision.state;
    grounded = collision.hitFloor;
  } else if (grounded) {
    const surfaceVelocity = tramSupport
      ? tramSurfaceVelocity(player.position, tramSupport, endTime)
      : { x: 0, y: 0, z: 0 };
    velocity.sub(surfaceVelocity);
    const vertical = velocity.dot(up);
    velocity
      .addScaledVector(up, -vertical)
      .lerp(desired, 1 - Math.exp(-12 * dt));
    position.copy(player.position).addScaledVector(velocity, dt);
    const rho = Math.hypot(position.x, position.z);
    const sceneryHeight = sceneryGrounded
      ? scenery.supportHeight(position, previousState.position)
      : null;
    if (sceneryGrounded && sceneryHeight === null) {
      // Leave a roof at its current height; gravity takes over on the next step.
      grounded = false;
    } else {
      const supportRadius = FLOOR_RADIUS - (tramSupport
        ? TRAM_DECK_HEIGHT
        : sceneryHeight ?? walkingSupportHeight(position, previousState.position, endTime));
      position.x *= supportRadius / rho;
      position.z *= supportRadius / rho;
    }
    if (tramSupport)
      velocity.add(tramSurfaceVelocity(position, tramSupport, endTime));
    player = resolvePlayerDeck({ position, velocity }, previousState).state;
  } else {
    // Modest air steering; jumping otherwise shares the probes' free-flight physics.
    const lateralVelocity = velocity
      .clone()
      .addScaledVector(up, -velocity.dot(up));
    if (desired.lengthSq() > 0)
      velocity.addScaledVector(
        desired.sub(lateralVelocity),
        Math.min(0.8 * dt, 1),
      );
    player = stepFreeFlight({ position: player.position, velocity }, dt);
    const collision = resolvePlayerDeck(player, previousState);
    player = collision.state;
    grounded = collision.hitFloor;
  }
  const contact = isOverDeck(player) ? resolveTramCollision(
    previousState,
    player,
    simTime,
    endTime,
    tramSupport,
  ) : { state: player, support: null, grounded: false, pushed: false };
  player = contact.state;
  tramSupport = flight ? null : contact.support;
  const solidContact = scenery.resolvePlayer(previousState, player, { flying: flight });
  player = solidContact.state;
  sceneryGrounded = solidContact.grounded;
  if (sceneryGrounded) tramSupport = null;
  grounded = contact.grounded || sceneryGrounded;
  const boundary = constrainToExplorationSphere(player);
  player = boundary.state;
  if (boundary.hit && navigationElapsed - lastBoundaryNotice > 3) {
    lastBoundaryNotice = navigationElapsed;
    notice("Exploration limit reached · turn back toward the habitat");
  }
  flightAssist.update(player.position, endTime, dt, realStep);
  if (contact.pushed && endTime - lastTramPush > 1.5) {
    lastTramPush = endTime;
    notice("Tram pushed you clear of the track");
  }
}

element("walk-button").addEventListener("click", () => {
  setFlight(false);
  element("walk-button").blur();
});
element("fly-button").addEventListener("click", () => {
  setFlight(true);
  element("fly-button").blur();
});
element("resume-button").addEventListener("click", () => void captureMouse());
element("touch-return").addEventListener("click", () => {
  enterHabitat();
  element("touch-return").blur();
});
element("touch-map-toggle").addEventListener("click", () => {
  const collapsed = document.documentElement.classList.toggle("map-collapsed");
  element("touch-map-toggle").setAttribute("aria-expanded", String(!collapsed));
  element("touch-map-toggle").blur();
});
element("touch-systems-toggle").addEventListener("click", () => {
  const opened = document.documentElement.classList.toggle("systems-open");
  element("touch-systems-toggle").setAttribute("aria-expanded", String(opened));
  touch.reset();
  cancelCharge();
  element("touch-systems-toggle").blur();
});
element("graphics-quality").addEventListener("change", () => {
  preferences.graphicsQuality = element<HTMLSelectElement>("graphics-quality").value as GraphicsQuality;
  persistPreferences();
  applyRenderBudget();
});
element("input-mode").addEventListener("change", () => {
  preferences.inputMode = element<HTMLSelectElement>("input-mode").value as typeof preferences.inputMode;
  persistPreferences();
});
for (const [id, key] of [["mouse-sensitivity", "mouseSensitivity"], ["touch-sensitivity", "touchSensitivity"]] as const) {
  const update = () => {
    preferences[key] = Number(element<HTMLInputElement>(id).value);
    element(`${id}-value`).textContent = `${preferences[key].toFixed(1)}×`;
  };
  update();
  element(id).addEventListener("input", () => { update(); persistPreferences(); });
}
updateSoundUI();
element("sound-volume-value").textContent = `${Math.round(preferences.soundVolume * 100)}%`;

element("sound-toggle").addEventListener("click", () => {
  toggleSound();
  element("sound-toggle").blur();
});
element<HTMLInputElement>("sound-volume").addEventListener("input", (event) => {
  const value = Number((event.target as HTMLInputElement).value);
  audio.setVolume(value / 100);
  preferences.soundVolume = value / 100;
  persistPreferences();
  element("sound-volume-value").textContent = `${value}%`;
});

// WebAudio may only start after a real gesture, including the first touch move.
document.addEventListener("pointerdown", () => void audio.unlock(), { capture: true });
document.addEventListener("keydown", (event) => {
  if (!event.repeat) void audio.unlock();
}, { capture: true });
element("landscape-button").addEventListener("click", () => void useLandscape());
element("touch-fullscreen").addEventListener("click", () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void useLandscape();
  element("touch-fullscreen").blur();
});
document.addEventListener("fullscreenchange", () => {
  const fullscreen = !!document.fullscreenElement;
  element("touch-fullscreen").textContent = fullscreen ? "Exit fullscreen" : "Fullscreen";
  if (!fullscreen && orientationLockedByGame) {
    releaseLandscapeLock();
  }
  updateLandscapeState();
});
portraitViewport.addEventListener("change", updateLandscapeState);
element("reset-button").addEventListener("click", () => {
  resetPlayer();
  notice("Returned to the Commons");
  element("reset-button").blur();
});
element("launch-button").addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  beginCharge("button", event.pointerId);
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
});
ghostToggle.addEventListener("change", refreshGhost);
element("help-button").addEventListener("click", openControls);
element("close-help").addEventListener("click", () => help.close());
help.addEventListener("close", () => {
  showPause();
  // Do not leave keyboard focus on an inert modal control after closing it.
  if (view === "explore") element("resume-button").focus({ preventScroll: true });
  else canvas.focus({ preventScroll: true });
});
document.addEventListener("pointerlockchange", () => {
  cancelCharge();
  clearNavigationInputs();
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
  if (touch.enabled) return;
  if (document.pointerLockElement !== canvas && !pointerUnavailable)
    void captureMouse();
});
canvas.addEventListener("pointerdown", (event) => {
  if (touch.enabled && event.pointerType !== "mouse") return;
  canvas.focus({ preventScroll: true });
  if (event.button === 2 && view === "explore") {
    cancelCharge();
    return;
  }
  if (event.button === 0 && document.pointerLockElement === canvas)
    beginCharge("mouse", event.pointerId);
  if (view === "explore" && (pointerUnavailable || touch.enabled)) {
    dragLooking = true;
    canvas.setPointerCapture(event.pointerId);
    showPause();
  }
});
canvas.addEventListener("contextmenu", (event) => {
  if (view === "explore") event.preventDefault();
});
canvas.addEventListener("pointerup", (event) => {
  if (
    (!touch.enabled || event.pointerType === "mouse") &&
    (pointerUnavailable || touch.enabled)
  ) {
    dragLooking = false;
    showPause();
  }
});
document.addEventListener("pointerup", (event) => {
  if (
    event.button === 0 &&
    event.pointerId === chargePointerId &&
    (chargeSource === "mouse" || chargeSource === "button")
  )
    releaseCharge();
});
document.addEventListener("pointercancel", (event) => {
  if (event.pointerId === chargePointerId) cancelCharge();
  if (!touch.enabled || event.pointerType === "mouse") {
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
  flightAssist.look(event.movementX * 0.0022 * preferences.mouseSensitivity, -event.movementY * 0.0022 * preferences.mouseSensitivity);
});
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey || landscapeBlocked) return;
  const target = event.target as HTMLElement | null;
  const editing = !!target?.closest("input, select, textarea, [contenteditable='true']");
  if (event.code === "KeyH" && !editing) {
    event.preventDefault();
    if (!event.repeat) {
      if (help.open) help.close();
      else openControls();
    }
    return;
  }
  if (help.open) return;
  if (event.code === "Escape" && target?.closest("input, select, textarea, button, a, [contenteditable='true']")) {
    event.preventDefault();
    clearNavigationInputs();
    canvas.focus({ preventScroll: true });
    return;
  }
  if (editing) return;
  if (event.code === "Tab" && explorationActive()) {
    event.preventDefault();
    pauseExploration();
    element("help-button").focus({ preventScroll: true });
    return;
  }
  // Preserve native keyboard activation and navigation of links and buttons.
  if (target?.closest("button, a")) return;
  if (event.code === "Enter" && view === "explore" && !explorationActive()) {
    event.preventDefault();
    if (!event.repeat) void captureMouse();
    return;
  }
  if (event.code === "KeyO") {
    event.preventDefault();
    if (!event.repeat) toggleOrbitView();
    return;
  }
  if (event.code === "KeyM") {
    if (!event.repeat) toggleSound();
    return;
  }
  if (event.code === "KeyT") {
    if (!event.repeat) setTimeRate(1);
    return;
  }
  if (["Comma", "Period"].includes(event.code)) {
    event.preventDefault();
    if (!event.repeat) stepTimeRate(event.code === "Period" ? 1 : -1);
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
  if (event.code === "KeyG") {
    if (!event.repeat) {
      ghostToggle.checked = !ghostToggle.checked;
      refreshGhost();
    }
    return;
  }
  if (view === "orbit") {
    if (event.code === "KeyN") {
      event.preventDefault();
      clearNavigationInputs();
      element("orbit-destination").focus({ preventScroll: true });
    } else if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Equal", "Minus", "NumpadAdd", "NumpadSubtract"].includes(event.code)) {
      event.preventDefault();
      keys.add(event.code);
    }
    return;
  }
  if (view !== "explore") return;
  if (event.code === "Escape" && (pointerUnavailable || touch.enabled)) {
    pauseExploration();
    return;
  }
  if (!explorationActive()) return;
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
    resetHeldAt = performance.now();
    notice("Hold R to return to the Commons");
  }
  if (event.code === "KeyV") setFlight(!flight);
  if (event.code === "Space") jumpPlayer();
});
document.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  if (event.code === "KeyR") resetHeldAt = null;
  if (event.code === "KeyF" && chargeSource === "keyboard") releaseCharge();
});
window.addEventListener("blur", () => {
  clearNavigationInputs();
  cancelCharge();
  motionRamp = 0;
  if (touch.enabled) pauseExploration();
  updateAudio();
});
document.addEventListener("visibilitychange", () => {
  clearNavigationInputs();
  cancelCharge();
  fixedAccumulator = 0;
  previous = performance.now();
  if (touch.enabled && document.hidden) pauseExploration();
  updateAudio();
});
window.addEventListener("pagehide", () => audio.reset());
if (import.meta.hot) import.meta.hot.dispose(() => {
  audio.dispose();
  benchmark?.dispose();
});
window.addEventListener("resize", () => {
  applyRenderBudget();
  touch.reset();
  camera.aspect = innerWidth / innerHeight;
  camera.fov = view === "explore" ? 72 : overviewFov(camera.aspect);
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  updateLandscapeState();
});

function updateTelemetry() {
  const tramStatus = element("tram-status");
  tramStatus.hidden = tramSupport === null;
  if (tramSupport) {
    const tram = getTramState(
      elapsed,
      tramSupport.direction,
      tramSupport.carIndex,
    );
    const stop =
      HABITAT_DISTRICTS[
        tram.stopped ? tram.stationIndex : tram.nextStationIndex
      ];
    tramStatus.textContent = `${tramSupport.direction === "spinward" ? "Spinward" : "Antispinward"} tram · ${tram.stopped ? "At" : "Next:"} ${stop.name}`;
  }
  const rho = Math.hypot(player.position.x, player.position.z);
  const outside = !isInsideHabitat(view === "explore" ? camera.position : player.position);
  const clearance = Math.max(0, getBoundaryClearance(player.position));
  const inertialVelocity = new THREE.Vector3().copy(player.velocity).add(rotationVelocity(player.position));
  element("gravity-label").textContent = outside ? "HUB DISTANCE" : "LOCAL GRAVITY";
  element("altitude-label").textContent = outside ? "LIMIT DISTANCE" : "ALTITUDE";
  element("speed-label").textContent = outside ? "INERTIAL SPEED" : "RELATIVE SPEED";
  element("gravity-value").innerHTML =
    outside ? `${Math.hypot(player.position.x, player.position.y, player.position.z).toFixed(1)} <small>m</small>` : `${((ANGULAR_SPEED ** 2 * rho) / GRAVITY).toFixed(2)} <small>g</small>`;
  element("altitude-value").innerHTML =
    `${(outside ? clearance : Math.max(0, FLOOR_RADIUS - rho + 1e-8)).toFixed(1)} <small>m</small>`;
  element("speed-value").innerHTML =
    `${(outside ? inertialVelocity.length() : Math.hypot(player.velocity.x, player.velocity.y, player.velocity.z)).toFixed(1)} <small>m/s</small>`;
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
    view === "orbit" ? "STANFORD TORUS / 01" : outside ? "EXTERIOR FLIGHT" : nearest.name.toUpperCase();
  element("location-detail").textContent = view === "orbit"
    ? "INERTIAL REFERENCE FRAME"
    : isInsideHabitat(camera.position)
      ? "HABITAT 01 / ROTATING REFERENCE FRAME"
      : clearance < 75 ? "APPROACHING EXPLORATION LIMIT" : "SPACE / INERTIAL STABILIZATION";
  element("mode-description").textContent = movementDescription();
  const marker = document.getElementById("map-position")!;
  marker.setAttribute("cx", String(40 + 29 * Math.cos(angle)));
  marker.setAttribute("cy", String(40 + 29 * Math.sin(angle)));
}

const benchmark = buildBenchmark({
  renderer,
  canvas,
  getQuality: () => ({ preset: preferences.graphicsQuality, shadows: renderBudget.shadows, pixelRatio: renderer.getPixelRatio(), view, simulationRate }),
  onStart: () => { void captureMouse(); },
});
let previous = performance.now();
let telemetryClock = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  // A queued first frame can predate initialization or a visibility reset.
  const dt = Math.max(0, Math.min((now - previous) / 1000, 0.1));
  previous = now;
  if (document.hidden || landscapeBlocked) {
    updateAudio();
    return;
  }
  benchmark?.beginFrame(now);
  const active = explorationActive();
  if (resetHeldAt !== null && active && keys.has("KeyR") && now - resetHeldAt >= 600) {
    resetHeldAt = null;
    resetPlayer();
    notice("Returned to the Commons");
  }
  const simulationRunning = !help.open && (active || view === "orbit");
  const simulationDelta = simulationRunning ? dt * simulationRate : 0;
  elapsed += simulationDelta;
  if (active && chargeSource) {
    updateLauncherUI();
  }
  if (!active && chargeSource) cancelCharge();
  recoil *= Math.exp(-13 * dt);
  if (active || (view === "orbit" && simulationRunning)) {
    fixedAccumulator += simulationDelta;
    while (fixedAccumulator >= STEP) {
      simulatePlayer(STEP, elapsed - fixedAccumulator);
      fixedAccumulator -= STEP;
    }
  } else {
    fixedAccumulator = 0;
  }
  if (!help.open) updateKeyboardCamera(dt);
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
        const exit = firstExplorationExit(probe.state, simulationDelta);
        const result = scenery.advanceBallistic(probe.state, simulationDelta);
        if (exit !== null && (!result.impact || exit < result.impact.time)) {
          removeProbe(probe);
          probes.splice(i, 1);
          updateLauncherUI();
          continue;
        }
        probe.state = result.state;
        probe.stopped = !!result.impact;
        probe.mesh.position.copy(probe.state.position);
        probe.trailPoints.push(probe.mesh.position.clone());
        probe.trailTimes.push(elapsed - simulationDelta + (result.impact?.time ?? simulationDelta));
        if (probe.trailPoints.length > 450) {
          probe.trailPoints.shift();
          probe.trailTimes.shift();
        }
      }
      if (!probe.stopped && probe.age > 32) {
        removeProbe(probe);
        probes.splice(i, 1);
        updateLauncherUI();
      }
    }
  }
  for (const probe of probes) {
    const attribute = probe.trail.geometry.getAttribute("position") as THREE.BufferAttribute;
    probe.trailPoints.forEach((point, index) => {
      const shown = trailPoint(point, probe.trailTimes[index], elapsed, view === "orbit" ? 0 : flightAssist.habitatWeight);
      attribute.setXYZ(index, shown.x, shown.y, shown.z);
    });
    attribute.needsUpdate = true;
    probe.trail.geometry.setDrawRange(0, probe.trailPoints.length);
  }
  // The preview must use the same pose as this frame's camera, even on touch.
  if (view === "explore") refreshGhost();
  const inertialView = view !== "explore";
  scene.rotation.y = inertialView
    ? (elapsed * ANGULAR_SPEED) % (Math.PI * 2)
    : 0;
  const orbit = sky.update(
    elapsed,
    camera,
    inertialView ? "inertial" : "habitat",
  );
  habitat.update(elapsed, {
    ...(inertialView ? getOrbitState(elapsed) : orbit),
    viewerPosition: player.position,
    shadows: renderBudget.shadows,
  });
  explorationShell.update(player.position, view === "explore");
  updateAudio(dt);
  const avatarSurfaceVelocity =
    tramSupport && grounded
      ? tramSurfaceVelocity(player.position, tramSupport, elapsed)
      : { x: 0, y: 0, z: 0 };
  avatar.update({
    deltaSeconds: dt,
    movementSpeed: Math.hypot(
      player.velocity.x - avatarSurfaceVelocity.x,
      player.velocity.y - avatarSurfaceVelocity.y,
      player.velocity.z - avatarSurfaceVelocity.z,
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
    element("axis-state").hidden = view !== "orbit";
    element("axis-state").textContent = orbit.sunlight <= AXIS_SUNLIGHT_THRESHOLD
      ? "AXIS HOLD"
      : "SOLAR TRACKING";
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
  benchmark?.endFrame(performance.now());
}
applyRenderBudget();
element("mode-description").textContent = movementDescription();
resetPlayer();
enterHabitat(false);
updateLandscapeState();
requestAnimationFrame(frame);
