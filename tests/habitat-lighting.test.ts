import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { buildHabitatLighting, ENCLOSURE_LIGHT_BAYS, lightingLevels, localLampSamples } from "../src/habitat-lighting.ts";

test("eclipse removes direct sunlight while practical lighting keeps operating", () => {
  const day = lightingLevels(1), night = lightingLevels(0);
  assert.equal(night.sun, 0);
  assert.ok(day.sun > day.ambient + day.hemisphere);
  assert.ok(night.lamps > day.lamps && night.ambient > 0);
  assert.deepEqual(lightingLevels(-3), night);
  assert.deepEqual(lightingLevels(10), day);
});

test("local practical lights hand over continuously at fixture bays and wraparound", () => {
  const contribution = (angle: number) => {
    const samples = localLampSamples({ x: 210 * Math.cos(angle), y: 0, z: 210 * Math.sin(angle) });
    assert.equal(samples.length, 4);
    assert.ok(Math.abs(samples.reduce((sum, sample) => sum + sample.weight, 0) - 2) < 1e-12);
    return samples.reduce((sum, sample) => sum.addScaledVector(new THREE.Vector3().copy(sample.position), sample.weight), new THREE.Vector3());
  };
  for (let bay = 0; bay <= ENCLOSURE_LIGHT_BAYS; bay++) {
    const angle = bay / ENCLOSURE_LIGHT_BAYS * Math.PI * 2;
    assert.ok(contribution(angle - 1e-7).distanceTo(contribution(angle + 1e-7)) < 1e-5);
  }
});

test("the lighting rig uses a bounded light pool and only sunlight casts shadows", () => {
  const root = new THREE.Group(), rig = buildHabitatLighting(root);
  rig.update({ x: 1, y: 0, z: 0 }, 1, { x: 210, y: 0, z: 0 }, true);
  const lights = root.children.filter((child) => child instanceof THREE.Light);
  assert.equal(lights.filter((light) => light instanceof THREE.PointLight).length, 4);
  assert.equal(lights.filter((light) => light.castShadow).length, 1);
  rig.update({ x: 1, y: 0, z: 0 }, 0, { x: 210, y: 0, z: 0 }, true);
  assert.equal(lights.filter((light) => light.castShadow).length, 0);
  assert.equal((root.getObjectByName("Enclosure streetlight diffusers") as THREE.InstancedMesh).count, 72);
  rig.dispose();
});
