# TORUS

A small, browser-based playground inside a rotating space habitat. Walk around the ring, jump into an unfamiliar horizon, switch on your thrusters, and launch probes along a visible ghost trajectory.

The world is built from procedural geometry: varied buildings, trees, farmland, water, structural ribs, 56 static residents, and your own suited body and launcher. Earth has code-drawn continents; Earth, the Moon, and the Sun follow an analytic orbital sky. There are no texture packs, downloaded models, external fonts, accounts, or backend services.

**Version 0.3.1 · Desktop first · MIT licensed**

**[Play in your browser →](https://torus.classroom-fox.com)** · [Source](https://github.com/DanielHaggstrom/stanford-torus) · [Build checks](https://github.com/DanielHaggstrom/stanford-torus/actions)

## Explore

Choose **Step inside** to explore on foot. Press **O** to switch between the habitat and its exterior orbit view; your position and probes are preserved. The opening screen also offers an **Orbit view** button. The ring contains six districts: Aurora Commons, Sunward Farms, The Reservoir, Zenith Gardens, Orchard Quarter, and Starlight Village.

| Control                                          | Action                                      |
| ------------------------------------------------ | ------------------------------------------- |
| W A S D / arrow keys                             | Move                                        |
| Mouse                                            | Look around while captured                  |
| Space                                            | Jump while walking; rise in flight          |
| Q                                                | Descend in flight                           |
| Shift                                            | Move faster                                 |
| 1 / 2                                            | Walking / powered flight                    |
| Hold click while captured / F / **Launch probe** | Charge for one real second; release to fire |
| C / **Clear**                                    | Clear all probes                            |
| , / . or **Time** selector                       | 1×, 5×, or 10× simulation speed             |
| O                                                | Toggle exterior orbit view                  |
| R                                                | Return to the Commons and clear probes      |
| Esc                                              | Release the mouse and pause exploration     |
| Drag / scroll in orbit view                      | Rotate / zoom                               |

Use the side panel to toggle the ghost path or change movement mode. Charging raises launch speed from 28 to 90 m/s over one real second. The ghost updates while charging, predicts up to 30 simulated seconds ahead, and marks the first floor or side-wall contact. A probe inherits your movement, so firing while running or flying changes its path. Only the newest **five probes** are retained. Moving probes expire after **32 simulated seconds**; landed probes remain fixed to the habitat until cleared, reset, or displaced by a newer probe.

Walking and powered flight build from a gentle start to cruising speed over two simulated seconds of continuous movement. Releasing movement resets that ramp. Look down to see your torso, legs, and boots; the launcher and both hands stay visible in first person.

**Time** advances movement, ballistics, habitat spin, and the orbital sky together. The opening screen holds the clock at **T+00:00:00**, keeping Europe and the Moon in their opening alignment while you read. Time starts with active exploration or exterior orbit view. Charging always takes one real second. Exploration pauses when you release the mouse with Esc, open Controls, or hide the browser tab. Orbit view continues advancing time while visible; Controls and a hidden tab pause it too.

The exterior camera keeps an **inertial orientation**: the habitat spins beneath it while Earth, the Moon, and the Sun move according to the shared clock. Drag and scroll to choose your own viewpoint. In orbit view, select a destination on the **Earth-centred orbit map**, or use its destination slider, then choose **Skip forward**. The clock advances to the next occurrence of that orbital position, updating every celestial body and the habitat's spin together. Selecting the current position advances one full orbit. Moving probes disappear; landed probes keep their place. Your habitat position, including altitude, and walking or flight mode stay unchanged; velocity is cleared and normal motion resumes after the skip. The local map omits the Moon because its orbit is about 46 times farther from Earth than the habitat's.

If your browser cannot capture the mouse, select **Continue with drag to look**. Movement still uses the keyboard; hold and drag on the world to look, and use F or the launch button to charge and fire. Resume exploration before charging; paused inputs never queue a shot. Open **Controls** for an in-game reference.

## Run locally

Install **Node.js 22.18 or newer** with npm. Use a recent desktop browser with **WebGL 2**, hardware acceleration, a keyboard, and a mouse.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. No API keys or environment variables are required.

```sh
npm test          # Physics, movement, and orbital tests; Node's built-in runner
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

Walking uses deck adhesion and acceleration for comfortable controls. Jumps add a small amount of air steering. Flight is deliberately powered and stabilized: thrusters counter apparent gravity and damp motion toward your requested velocity.

## The orbital sky

The habitat follows a circular Earth orbit **2,000 km above the surface**, inclined by **51.6°**, with a period of approximately **127 minutes**. Earth spans about **99°** of the sky; the habitat's **18° spin-axis tilt** gives it an offset sky track. The view combines orbital motion, habitat spin, Earth's rotation, and the Moon's motion. The Sun has a bright disc with a procedural warm halo and rays. Sunlight lights the planets and the habitat; passing through Earth's shadow produces orbital night, while interior lighting keeps the paths visible.

The opening alignment presents Europe prominently and places the Moon near Earth in the opening sky while keeping both bodies on their defined orbits. This is a coherent demonstration scenario with an invented starting alignment; it does not reproduce the current date's sky. The Moon and Sun have their approximate physical apparent sizes, so the Moon is small and can later be obscured by the habitat or Earth. See [the orbital model and sources](docs/orbit.md) for equations, reference values, and limitations.

## Scope and limitations

This is a compact, stylized Stanford torus inspired habitat. The playable deck is a **cylindrical ring** at radius 210 m, extending across Y = −22 to +22 m. It does not yet model the full curved toroidal pressure envelope. Players keep a small clearance from the side walls, and flight also stays within those bounds.

Buildings, trees, bridges, and the static residents are scenery; collision currently covers the floor and side walls. Six building styles, varied roofs, service structures, gardens, and seeded placement give the districts different silhouettes. There is no realistic atmosphere, aerodynamic drag, life support, resource economy, or persistent world state. Touch and gamepad play are future work.

## Roadmap

| Phase                                  | Focus                                                                                                                                                                                   |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v0.1 — Complete**                    | Six districts; orbit view; walking, jumping, stabilized flight; ghost trajectories and rotating-frame ballistics                                                                        |
| **v0.2 — Complete: comfort and orbit** | Charge-only launcher and clear shortcut, five-probe cap, visible body, movement ramp, varied scenery and static residents, Earth/Moon/Sun sky, eclipses, and adjustable simulation time |
| **v0.3 — Current: orbital explorer**   | Europe and Moon opening alignment, inertial exterior view with O shortcut, an Earth-centred orbit map, and coherent forward time skips                                                  |
| **v0.4 — A physical place**            | Building collision, uneven terrain, a full toroidal deck, and clearer boundaries for exploration                                                                                        |
| **v0.5 — A physics lab**               | Scale and spin presets; compare rotating and inertial reference frames; richer trajectory experiments                                                                                   |
| **v0.6 — More ways to explore**        | Accessibility options, configurable controls, touch and gamepad support, and performance settings                                                                                       |
| **Later experiments**                  | Shared exploration or multiplayer, subject to a separate networking and hosting design                                                                                                  |

Phases are an evolving direction, not scheduled releases. Keep each addition small enough to play and evaluate before expanding the simulation.

## Project structure

| File                           | Responsibility                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| `src/main.ts`                  | Rendering setup, player controls, cameras, probes, UI, and simulation loop                    |
| `src/habitat.ts`               | Seeded procedural scenery, instanced geometry, districts, and lighting                        |
| `src/physics.ts`               | Renderer-independent rotating-frame physics, collision, and trajectory sampling               |
| `src/movement.ts`              | Renderer-independent movement pace ramp                                                       |
| `src/avatar.ts`                | Procedural first-person body, launcher, charge indicators, and recoil                         |
| `src/orbit.ts` / `src/sky.ts`  | Analytic orbital state and procedural Earth, Moon, Sun, and stars                             |
| `src/orbit-map.ts`             | Earth-centred orbit display and destination controls                                          |
| `src/time-skip.ts`             | Forward-only orbital phase selection on the shared clock                                      |
| `src/style.css` / `index.html` | Interface and layout                                                                          |
| `tests/*.test.ts`              | Physics conservation, ghost/live agreement, movement pacing, orbital geometry, and time skips |
| `docs/orbit.md`                | Orbital assumptions, equations, constants, and primary references                             |
| `docs/deployment.md`           | Public static deployment guide                                                                |

Keep the runtime small, generate assets in code, reuse geometry where possible, and keep physics independent of rendering. Prefer a clear, testable experiment over an opaque physics dependency. Browser input, rendering, and procedural generation can grow independently as the playground develops.

## License

[MIT](LICENSE).
