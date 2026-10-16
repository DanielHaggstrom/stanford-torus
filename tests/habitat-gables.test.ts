import assert from "node:assert/strict";
import { after, test } from "node:test";
import * as THREE from "three";
import { buildHabitat } from "../src/habitat.ts";
import { buildSceneryCollision } from "../src/scenery-collision.ts";

const habitat = buildHabitat(new THREE.Scene());
after(() => habitat.dispose());
const roofPanels = habitat.colliders.filter((collider) => collider.kind === "pitched roof");
const [first, second] = roofPanels;
const center = new THREE.Vector3().copy(first.center).add(second.center).multiplyScalar(0.5);
const ridge = new THREE.Vector3().copy(first.axes[0]);
const halfWidth = first.halfSize.x;

test("probes strike both rendered gable ends instead of crossing through the attic", () => {
  const world = buildSceneryCollision(habitat.colliders);
  for (const side of [-1, 1]) {
    const initial = {
      position: center.clone().addScaledVector(ridge, side * (halfWidth + 0.5)),
      velocity: ridge.clone().multiplyScalar(-side * 10),
    };
    const impact = world.firstImpact(initial, (2 * halfWidth + 1) / 10, { angularSpeed: 0 });
    assert.equal(impact?.kind, "scenery");
    assert.equal(impact?.collider?.kind, "pitched roof gable");
    assert.ok(Math.abs(impact!.time - 0.05) < 1e-7);
    const preview = world.sampleTrajectory(initial, { duration: 2, step: 0.04, angularSpeed: 0 });
    assert.ok(new THREE.Vector3().copy(preview.at(-1)!).distanceTo(impact!.position) < 1e-7);
  }
});

test("gable proxies stay inside the rendered triangular roof ends", () => {
  const up = new THREE.Vector3().copy(first.axes[1]).add(second.axes[1]).normalize();
  const across = new THREE.Vector3().copy(second.center).sub(first.center).normalize();
  const halfDepth = new THREE.Vector3().copy(second.center).distanceTo(first.center);
  const slopeCosine = up.dot(first.axes[1]);
  const roofHeight = halfDepth * Math.sqrt(1 - slopeCosine ** 2) / slopeCosine;
  const base = center.clone().addScaledVector(up, -roofHeight / 2);
  const caps = habitat.colliders.filter((collider) => collider.kind === "pitched roof gable").slice(0, 12);
  assert.ok(caps.length > 0);
  for (const cap of caps) {
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      const corner = new THREE.Vector3().copy(cap.center)
        .addScaledVector(cap.axes[0], cap.halfSize.x * x)
        .addScaledVector(cap.axes[1], cap.halfSize.y * y)
        .addScaledVector(cap.axes[2], cap.halfSize.z * z)
        .sub(base);
      const height = corner.dot(up);
      assert.ok(height >= -1e-7 && height <= roofHeight + 1e-7);
      assert.ok(Math.abs(corner.dot(ridge)) <= halfWidth + 1e-7);
      assert.ok(Math.abs(corner.dot(across)) <= halfDepth * (1 - height / roofHeight) + 1e-7);
    }
  }
});
