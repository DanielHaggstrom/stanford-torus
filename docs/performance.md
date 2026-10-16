# Performance

Torus has one runtime dependency, Three.js. Geometry and sound are generated in
code. The static site downloads about **203 kB gzipped**, with no models, image
textures, external fonts, or backend requests.

The scene contains roughly **373,000 triangles**, **202 renderable objects**, and
**8.84 MiB of geometry/instance buffers** before camera culling. These are scene
budgets, not total browser or GPU memory: render targets, shadow maps, shaders,
driver allocations, and JavaScript objects use additional memory.

A desktop reference run on 16 October 2026 used Chromium 155, AMD Radeon
Graphics, and a Ryzen 9 5900HX. At 1280×720 with shadows, it sustained about
131 FPS and 8.2 ms p95 frame intervals. The refresh-limited result does not
establish a device minimum. A phone-sized viewport on that GPU also ran smoothly;
physical phone performance, heat, and battery use remain unmeasured.

## Measure locally

With Node.js 22.18 or newer:

```sh
npm ci
npm run benchmark -- --output artifacts/cpu-benchmark.json
```

The CPU benchmark reports median/p95 scene construction, collision, trajectory,
and orbital update times, plus scene counts and buffer estimates. It does not
create a WebGL renderer, so it excludes GPU upload, shader compilation, and
rendering. Avoid running builds or other benchmarks at the same time.

For browser measurements, open `?benchmark=1`. The optional panel warms up for
two seconds, records ten seconds, and offers a JSON download. It measures frame
intervals, CPU work through render submission, draw calls, and triangles. CPU
submission time is **not GPU time**; frame intervals include browser scheduling.
Hiding the tab cancels the run.

Compare the same hardware, view, resolution, graphics preset, and simulation
speed. Useful cases are standing inside, walking, exterior orbit view, and the
touch layout. Save local results in the ignored `artifacts/` directory.

## Rendering choices

Repeated buildings and props use instancing. The reservoir patches share one
mesh; merging all scenery would lose useful camera culling and expand repeated
geometry. Coastline polygon bounds reduce Earth construction work without
lowering its resolution.

Full graphics enables Sun shadows and a pixel ratio up to 1.75. Balanced caps it
at 1 and disables shadows; Automatic selects Balanced for touch input. Both
presets use the same scenery and physics.
