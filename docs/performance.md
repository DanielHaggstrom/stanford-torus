# Performance

The recorded comparison below is from RC1. RC2 fixes its sky-compositing
regression (the habitat background covered the sky); the figures remain a
historical measurement of that build, rather than a new RC2 benchmark.

Torus generates its scenery, geography, sound and interface locally. Three.js is
the only runtime dependency; the production site has no downloaded models,
image textures, external fonts or application server. That keeps the download
small, but the browser still has to build and draw a detailed 3D scene.

## v1 release-candidate measurements

CPU measurements were taken on 16 October 2026 with Node.js 22.22.2, Windows x64,
an AMD Ryzen 9 5900HX and 32 GB RAM. The baseline is v0.10.0 at
`3b2935e710175edf57a22738f8bc3bac2adda3bb`; the candidate is v1.0.0-rc.1.

An alternating, same-process comparison measured warmed sky construction:

| CPU sky construction | Baseline | Candidate |
| --- | ---: | ---: |
| Median | 628.0 ms | 103.4 ms |
| p95 | 678.0 ms | 113.7 ms |

That is about **6.1× faster**, without lowering Earth resolution or changing
land classification. It measures CPU construction, not network load, shader
compilation or time to the first browser frame. The complete candidate scene
took 150.7 ms median to build; its mixed player-collision query took 0.028 ms
and uncached trajectory prediction 0.108 ms per operation.

| Scene inventory before camera culling | Baseline | Candidate |
| --- | ---: | ---: |
| Renderable objects | 217 | 202 |
| Instanced batches | 64 | 64 |
| Unique geometries | 118 | 103 |
| Triangles | 364,218 | 373,114 |
| Estimated geometry/instance buffers | 8.62 MiB | 8.84 MiB |

The candidate includes additional facility and station details. Its triangle and
buffer budgets grew by about 2.5%, while the water merge removed fifteen draws
when those patches are visible. This inventory does not predict FPS by itself.

Browser runs used Chromium 155 with AMD Radeon Graphics through ANGLE/D3D11.
Desktop cases used a 1280×720 viewport, a 1600×900 drawing buffer and shadows.
The touch-layout case used 844×390 at pixel ratio 1 without shadows, on that
same desktop GPU. Each case had two seconds of warm-up and ten seconds of
recording at 1× simulation speed.

| Browser case | FPS before → after | p95 frame ms before → after | Median CPU ms before → after | Median draws before → after |
| --- | ---: | ---: | ---: | ---: |
| Standing inside | 131.38 → 131.27 | 8.2 → 8.2 | 2.5 → 2.5 | 200 → 196 |
| Walking | 131.14 → 131.11 | 8.2 → 8.2 | 2.4 → 2.4 | 195 → 186 |
| Orbit view | 131.44 → 131.55 | 8.1 → 8.1 | 1.9 → 1.9 | 217 → 202 |
| Touch layout | 131.34 → 131.17 | 8.2 → 8.2 | 2.1 → 2.1 | 155 → 151 |

There is **no measured FPS improvement** in these refresh-limited runs. The
clear gains are faster CPU startup and fewer draws, with additional scene detail
remaining within the same observed frame budget. The baseline browser runs were
repeated after its refresh cadence changed; the table uses only the matched
repeats. These are manual smoke benchmarks, not deterministic camera replays or
physical-phone measurements.

The compressed release-candidate bundle is about 203 kB; the opt-in benchmark
code contributes about 2.1 kB. It creates no diagnostic UI or listeners in normal
play. [The compact report](benchmarks/v1.0.0-rc.1.json) records environment,
settings, counts, timings and limitations. It describes the candidate working
tree measured before final documentation and a small initial-frame clock fix.
Measurements apply to that captured working tree.

## Reproducing the measurements

Use Node.js 22.18 or newer:

```sh
npm ci
npm run benchmark -- --output artifacts/cpu-benchmark.json
```

The CPU benchmark builds the habitat, sky and avatar, then measures deterministic
collision, trajectory, orbital and scene-update workloads. It reports warm-up,
median and p95 timings, environment details, scene counts and estimated geometry
buffer storage. No WebGL renderer is created: these timings exclude GPU uploads,
shader compilation and rendering. Buffer estimates also exclude driver overhead,
framebuffers and shadow maps. Scene triangle counts are before camera culling.

To compare sky construction against an archived source tree, use
`--compare-source path/to/archive --compare-revision commit`. The harness alternates
11 before/after pairs in one process to reduce machine-load and warm-up bias.
Avoid running tests, builds or other benchmarks concurrently.

For browser measurements, open the game with `?benchmark=1`. The visible panel
records after a two-second warm-up for ten seconds and offers a JSON download.
The panel is absent in normal play. It records:

- Actual animation-frame intervals and average FPS.
- Main-thread work through render submission, in milliseconds.
- Draw calls and triangles across the sky, habitat, avatar and shadow passes.
- Viewport, drawing resolution, quality, simulation speed and renderer details.

Render submission is asynchronous; its CPU duration is **not GPU time**. Frame
intervals also include browser scheduling. Compare the same view, movement,
resolution and graphics settings on the same hardware. Hiding the tab cancels
the run. For a useful small suite, record a stationary interior view, continuous
walking, the exterior orbit view, and the Balanced touch layout at 844×390.
Desktop browser emulation does not measure a physical phone's GPU, heat limits,
touch hardware or battery usage.

## Changes guided by the measurements

Earth construction previously tested every coastline polygon at each of its
74,305 vertices. Precomputed polygon bounds now reject distant points before
walking their edges. The mesh resolution and coastline classification stay the
same: regression checks cover every Earth vertex and a further 260,281 positions
on a half-degree globe grid.

The sixteen reservoir patches now share one static mesh and material. Their
320 triangles and positions stay the same; fifteen scene objects and geometry
allocations are removed. They occupy one small district, so the slightly coarser
camera culling costs little. Buildings, trees and other repeated props retain
instancing: expanding thousands of instances into copied vertices would increase
geometry storage unnecessarily.

Freezing every mesh's local matrix was also measured as an upper-bound experiment.
It offers only a small saving and would break animated sky and avatar objects.
The game does not apply that blanket change.

## Remaining limits

Full graphics adds sunlight shadows and allows a higher drawing resolution.
Balanced caps pixel ratio at 1 and omits those shadows; Automatic selects
Balanced for touch controls. Both presets keep the same physics and scenery.
Performance depends on the actual renderer and device. Software-rendered browser
results should not be presented as hardware-GPU performance or a phone FPS claim.
