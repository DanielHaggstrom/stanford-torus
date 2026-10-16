import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { isLand } from "../src/continents.ts";

function checksum(points: Iterable<readonly [number, number]>) {
  let hash = 2166136261; let land = 0;
  for (const [longitude, latitude] of points) {
    const value = isLand(longitude, latitude);
    hash = Math.imul(hash ^ Number(value), 16777619) >>> 0;
    land += Number(value);
  }
  return { hash: hash.toString(16), land };
}

// These classification checksums were captured from the unoptimized coastlines
// at 3b2935e. Spatial rejection must not change the rendered geography.
test("all 74,305 rendered Earth vertices retain their coastline classification", () => {
  const geometry = new THREE.SphereGeometry(1, 384, 192);
  try {
    const positions = geometry.getAttribute("position");
    function* points(): Generator<readonly [number, number]> {
      for (let vertex = 0; vertex < positions.count; vertex++) yield [
        Math.atan2(-positions.getZ(vertex), positions.getX(vertex)) * 180 / Math.PI,
        Math.asin(Math.max(-1, Math.min(1, positions.getY(vertex)))) * 180 / Math.PI,
      ];
    }
    assert.equal(positions.count, 74305);
    assert.deepEqual(checksum(points()), { hash: "6d636f89", land: 27486 });
  } finally { geometry.dispose(); }
});

test("half-degree globe sampling preserves coastlines, islands and polygon boundaries", () => {
  function* points(): Generator<readonly [number, number]> {
    for (let latitude = -90; latitude <= 90; latitude += 0.5) {
      for (let longitude = -180; longitude <= 180; longitude += 0.5) yield [longitude, latitude];
    }
  }
  assert.deepEqual(checksum(points()), { hash: "cc515b0f", land: 96144 });
});
