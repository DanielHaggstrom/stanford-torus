# TORUS

A small, browser-based playground inside a rotating space habitat. Walk around the ring, jump into an unfamiliar horizon, switch on your thrusters, and launch probes along a visible ghost trajectory.

The world is built from procedural geometry: buildings, trees, farmland, water, structural ribs, and stars. There are no texture packs, downloaded models, external fonts, accounts, or backend services.

**Version 0.1.0 · Desktop first · MIT licensed**

**[Play in your browser →](https://torus.classroom-fox.com)** · [Source](https://github.com/DanielHaggstrom/stanford-torus) · [Build checks](https://github.com/DanielHaggstrom/stanford-torus/actions)

## Explore

Choose **Step inside** to explore on foot, or **Explore from orbit** to inspect the whole habitat. The ring contains six districts: Aurora Commons, Sunward Farms, The Reservoir, Zenith Gardens, Orchard Quarter, and Starlight Village.

| Control | Action |
| --- | --- |
| W A S D / arrow keys | Move |
| Mouse | Look around while captured |
| Space | Jump while walking; rise in flight |
| Q | Descend in flight |
| Shift | Move faster |
| 1 / 2 | Walking / powered flight |
| Click while captured / **Launch probe** | Fire a probe |
| R | Return to the Commons and clear probes |
| Esc | Release the mouse and pause exploration |
| Drag / scroll in orbit view | Rotate / zoom |

Use the side panel to set probe speed, toggle the ghost path, or change movement mode. The ghost predicts up to 30 seconds ahead and marks the first floor or side-wall contact. A probe inherits your movement, so firing while running or flying changes its path.

If your browser cannot capture the mouse, select **Continue with drag to look**. Movement still uses the keyboard; hold and drag on the world to look, and use the launch button to fire. Open **Controls** for an in-game reference.

## Run locally

Install **Node.js 22.18 or newer** with npm. Use a recent desktop browser with **WebGL 2**, hardware acceleration, a keyboard, and a mouse.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. No API keys or environment variables are required.

```sh
npm test          # Physics tests, using Node's built-in test runner
npm run check    # TypeScript checks
npm run build    # TypeScript checks and a production build in dist/
npm run preview  # Preview the production build locally
```

**Dependencies:** [Three.js](https://threejs.org/) is the only runtime dependency. Development uses [Vite](https://vite.dev/), [TypeScript](https://www.typescriptlang.org/), and the Three.js and Node type definitions. `npm ci` installs everything from the committed lockfile. The production output is static HTML, CSS, and JavaScript; Node is only needed to develop and build it.

See [deployment instructions](docs/deployment.md) for static hosting, releases, verification, and rollback. Host credentials and private operations details do not belong in this repository.

## Why the trajectories bend

The deck radius is **210 m**. Its angular speed is chosen so that a stationary observer at the floor experiences **9.81 m/s²** of apparent gravity:

```text
ω = √(g / R) = 0.216135 rad/s ≈ 2.064 rpm
rotation period ≈ 29.07 s
```

The simulation uses the habitat's rotating frame, with rotation about the Y axis. Local up points toward that axis; apparent gravity decreases as you fly inward. Free motion has centrifugal and Coriolis acceleration:

```text
a = −2 Ω × v − Ω × (Ω × r)
```

Rather than approximating those forces with Euler integration, free flight follows a straight line in an inertial frame and transforms the result back into the rotating habitat. Both the ghost and the live probe use this exact solution. Floor and side-wall impacts are solved continuously, so fast probes cannot skip through them between frames.

Walking uses deck adhesion and acceleration for comfortable controls. Jumps add a small amount of air steering. Flight is deliberately powered and stabilized: thrusters counter apparent gravity and damp motion toward your requested velocity. It is an exploration tool rather than an unpowered spacecraft simulation.

## Scope and limitations

This is a compact, stylized Stanford torus inspired habitat. The playable deck is a **cylindrical ring** at radius 210 m, extending across Y = −22 to +22 m. It does not yet model the full curved toroidal pressure envelope. Players keep a small clearance from the side walls, and flight also stays within those bounds.

Buildings, trees, bridges, and other structures are scenery; collision currently covers the floor and side walls. There is no realistic atmosphere, aerodynamic drag, life support, resource economy, or persistent world state. Touch and gamepad play are future work.

## Roadmap

| Phase | Focus |
| --- | --- |
| **v0.1 — Current** | Procedural habitat with six districts; orbit view; walking, jumping, and stabilized flight; adjustable probe launches; ghost paths, impact markers, and rotating-frame ballistics |
| **v0.2 — A physical place** | Building collision, uneven terrain, a full toroidal deck, and clearer boundaries for exploration |
| **v0.3 — A physics lab** | Scale and spin presets; compare rotating and inertial reference frames; richer trajectory experiments |
| **v0.4 — More ways to explore** | Accessibility options, configurable controls, touch and gamepad support, and performance settings |
| **Later experiments** | Shared exploration or multiplayer, subject to a separate networking and hosting design |

Phases are an evolving direction, not scheduled releases. Keep each addition small enough to play and evaluate before expanding the simulation.

## Project structure

| File | Responsibility |
| --- | --- |
| `src/main.ts` | Rendering setup, player controls, cameras, probes, UI, and simulation loop |
| `src/habitat.ts` | Seeded procedural scenery, instanced geometry, districts, and lighting |
| `src/physics.ts` | Renderer-independent rotating-frame physics, collision, and trajectory sampling |
| `src/style.css` / `index.html` | Interface and layout |
| `tests/physics.test.ts` | Conservation, reversibility, Coriolis direction, collisions, and ghost/live agreement |
| `docs/deployment.md` | Public static deployment guide |

Keep the runtime small, generate assets in code, reuse geometry where possible, and keep physics independent of rendering. Prefer a clear, testable experiment over an opaque physics dependency. Browser input, rendering, and procedural generation can grow independently as the playground develops.

## License

[MIT](LICENSE).
