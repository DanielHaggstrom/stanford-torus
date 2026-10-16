import { Matrix4, Quaternion, Vector3 } from "three";
import { ENCLOSURE_HALF_WIDTH, ENCLOSURE_HEIGHT } from "./habitat-volume.ts";
import {
  ANGULAR_SPEED,
  FLOOR_RADIUS,
  floorNormal,
  rotateY,
  rotationVelocity,
  type MotionState,
  type Vec3,
} from "./physics.ts";

export type FlightFrame = "habitat" | "space";

export interface FlightBasis {
  direction: Vec3;
  up: Vec3;
  right: Vec3;
}

export interface FlightAssist {
  readonly frame: FlightFrame;
  readonly habitatWeight: number;
  basis(simTime: number): FlightBasis;
  look(deltaYaw: number, deltaPitch: number): void;
  update(position: Vec3, endSimTime: number, dtSim: number, dtReal: number): void;
  reset(position: Vec3, direction: Vec3, up: Vec3, simTime: number): void;
  rebaseTime(from: number, to: number): void;
}

const AXIS = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, -1);
const MAX_PITCH = 1.48;
const TRANSITION_SECONDS = 1;
const EYE_HEIGHT = 1.7;
const FRAME_MARGIN = 2;

function plain(vector: Vec3): Vec3 {
  return { x: vector.x, y: vector.y, z: vector.z };
}

function normalized(value: Vec3, fallback: Vec3): Vector3 {
  const vector = new Vector3(value.x, value.y, value.z);
  return Number.isFinite(vector.lengthSq()) && vector.lengthSq() > 1e-16
    ? vector.normalize()
    : new Vector3(fallback.x, fallback.y, fallback.z).normalize();
}

function weight(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}

/** Positive inside the same elliptical pressure enclosure used for sound. */
function pressureMargin(position: Vec3): { margin: number; aboveDeck: boolean } {
  const height = FLOOR_RADIUS - Math.hypot(position.x, position.z) + EYE_HEIGHT;
  const ellipseRadius = Math.hypot(height / ENCLOSURE_HEIGHT, position.y / ENCLOSURE_HALF_WIDTH);
  return { margin: (1 - ellipseRadius) * ENCLOSURE_HALF_WIDTH, aboveDeck: height >= 0 };
}

/**
 * Orientation lives in inertial space. Only the portion matched to the habitat
 * receives its spin, so crossing the glass never resets aim or camera roll.
 * All positions supplied here are the player's foot point in habitat space.
 */
export function createFlightAssist(
  initialPosition: Vec3,
  initialDirection: Vec3,
  initialUp: Vec3,
  simTime = 0,
): FlightAssist {
  const orientation = new Quaternion();
  const personalUp = new Vector3();
  let frame: FlightFrame = "habitat";
  let habitatWeight = 1;

  function rotateOrientation(rotation: Quaternion): void {
    orientation.premultiply(rotation).normalize();
    personalUp.applyQuaternion(rotation).normalize();
  }

  function reset(position: Vec3, direction: Vec3, up: Vec3, time: number): void {
    const forward = normalized(direction, FORWARD);
    personalUp.copy(normalized(up, AXIS));
    // A malformed or exactly vertical initial pose still needs a stable horizon.
    if (Math.abs(forward.dot(personalUp)) > 0.9999) {
      personalUp.set(Math.abs(forward.y) < 0.9 ? 0 : 1, Math.abs(forward.y) < 0.9 ? 1 : 0, 0);
    }
    const right = forward.clone().cross(personalUp).normalize();
    const cameraUp = right.clone().cross(forward).normalize();
    orientation.setFromRotationMatrix(new Matrix4().makeBasis(right, cameraUp, forward.clone().negate()));
    rotateOrientation(new Quaternion().setFromAxisAngle(AXIS, ANGULAR_SPEED * time));
    const zone = pressureMargin(position);
    frame = zone.aboveDeck && zone.margin >= 0 ? "habitat" : "space";
    habitatWeight = frame === "habitat" ? 1 : 0;
  }

  reset(initialPosition, initialDirection, initialUp, simTime);

  return {
    get frame() { return frame; },
    get habitatWeight() { return habitatWeight; },
    basis(time) {
      const inverseSpin = new Quaternion().setFromAxisAngle(AXIS, -ANGULAR_SPEED * time);
      const direction = FORWARD.clone().applyQuaternion(orientation).applyQuaternion(inverseSpin).normalize();
      const up = personalUp.clone().applyQuaternion(inverseSpin).normalize();
      const right = direction.clone().cross(up).normalize();
      return { direction: plain(direction), up: plain(up), right: plain(right) };
    },
    look(deltaYaw, deltaPitch) {
      if (Number.isFinite(deltaYaw) && deltaYaw !== 0) {
        orientation.premultiply(new Quaternion().setFromAxisAngle(personalUp, -deltaYaw));
      }
      if (Number.isFinite(deltaPitch) && deltaPitch !== 0) {
        const forward = FORWARD.clone().applyQuaternion(orientation).normalize();
        const pitch = Math.asin(Math.max(-1, Math.min(1, forward.dot(personalUp))));
        const targetPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch + deltaPitch));
        const right = forward.cross(personalUp).normalize();
        orientation.premultiply(new Quaternion().setFromAxisAngle(right, targetPitch - pitch));
      }
      orientation.normalize();
    },
    update(position, endSimTime, dtSim, dtReal) {
      const zone = pressureMargin(position);
      if (frame === "habitat" && (!zone.aboveDeck || zone.margin < -FRAME_MARGIN)) frame = "space";
      else if (frame === "space" && zone.aboveDeck && zone.margin > FRAME_MARGIN) frame = "habitat";
      const realStep = Number.isFinite(dtReal) ? Math.max(0, dtReal) : 0;
      const simulationStep = Number.isFinite(dtSim) ? Math.max(0, dtSim) : 0;
      const targetWeight = frame === "habitat" ? 1 : 0;
      const previousWeight = habitatWeight;
      const change = realStep / TRANSITION_SECONDS;
      habitatWeight += Math.max(-change, Math.min(change, targetWeight - habitatWeight));
      const averageWeight = (previousWeight + habitatWeight) / 2;
      rotateOrientation(new Quaternion().setFromAxisAngle(AXIS, ANGULAR_SPEED * simulationStep * averageWeight));

      // The floor normal is useful only near the ring. In space it never pulls
      // the horizon toward the axis, including during a close hub inspection.
      if (habitatWeight > 0 && Math.hypot(position.x, position.z) > 1e-6) {
        const targetUp = new Vector3().copy(floorNormal(position))
          .applyAxisAngle(AXIS, ANGULAR_SPEED * endSimTime);
        const alignment = new Quaternion().setFromUnitVectors(personalUp, targetUp);
        alignment.slerp(new Quaternion(), Math.exp(-6 * realStep * habitatWeight));
        rotateOrientation(alignment);
      }
    },
    reset,
    rebaseTime(from, to) {
      const difference = to - from;
      if (!Number.isFinite(difference)) return;
      rotateOrientation(new Quaternion().setFromAxisAngle(AXIS, ANGULAR_SPEED * difference * habitatWeight));
    },
  };
}

/**
 * Thrusters damp velocity in the selected reference frame. Interpolating the
 * target frame's surface velocity preserves physical velocity during a switch;
 * no correction teleports the player or imparts a sudden impulse.
 */
export function advanceAssistedFlight(
  state: MotionState,
  desiredRot: Vec3,
  dtSim: number,
  habitatWeight: number,
  precision = false,
): MotionState {
  if (!Number.isFinite(dtSim) || dtSim <= 0) {
    return { position: plain(state.position), velocity: plain(state.velocity) };
  }
  const matched = weight(habitatWeight);
  const surfaceVelocity = rotationVelocity(state.position);
  const inertialVelocity = new Vector3().copy(state.velocity).add(surfaceVelocity);
  const target = new Vector3().copy(desiredRot).addScaledVector(surfaceVelocity, matched);
  const correction = target.sub(inertialVelocity).multiplyScalar(1 - Math.exp(-5 * dtSim));
  const maximumChange = (precision ? 8 : 30) * dtSim;
  if (correction.lengthSq() > maximumChange ** 2) correction.setLength(maximumChange);
  inertialVelocity.add(correction);

  const residual = inertialVelocity.addScaledVector(surfaceVelocity, -matched);
  const angle = -ANGULAR_SPEED * (1 - matched) * dtSim;
  const position = rotateY({
    x: state.position.x + residual.x * dtSim,
    y: state.position.y + residual.y * dtSim,
    z: state.position.z + residual.z * dtSim,
  }, angle);
  const endResidual = rotateY(residual, angle);
  const endSurface = rotationVelocity(position);
  return {
    position,
    velocity: {
      x: endResidual.x - (1 - matched) * endSurface.x,
      y: endResidual.y,
      z: endResidual.z - (1 - matched) * endSurface.z,
    },
  };
}
