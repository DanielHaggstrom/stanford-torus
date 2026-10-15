# Torus

A browser game for exploring a rotating space habitat. Walk, jump, fly, and launch
probes to see how trajectories curve in a rotating reference frame.

**[Play Torus](https://torus.classroom-fox.com)** ·
[Build checks](https://github.com/DanielHaggstrom/stanford-torus/actions) ·
[MIT license](LICENSE)

**Version 0.4.2** · Keyboard and mouse · WebGL 2

## Playing

Choose **Step inside** to start. Open **Controls** for the in-game reference.

| Controls                                | Action                                              |
| --------------------------------------- | --------------------------------------------------- |
| WASD / arrow keys                       | Move                                                |
| Mouse                                   | Look around                                         |
| Space                                   | Jump, or rise in flight                             |
| Q                                       | Descend in flight                                   |
| Shift                                   | Move faster                                         |
| 1 / 2                                   | Switch to walking / flight                          |
| Hold F, left click, or **Launch probe** | Charge; release to fire                             |
| C                                       | Clear probes                                        |
| R                                       | Reset position and clear probes                     |
| , / . or **Time** selector              | Set simulation speed to 1×, 5×, or 10×              |
| O                                       | Switch between first person and exterior orbit view |
| Drag / scroll in orbit view             | Rotate the camera / zoom                            |
| Esc                                     | Release the mouse and pause exploration             |

Tap to fire at 28 m/s. Charging starts after holding for 0.2 seconds and reaches
90 m/s one second later, using real time at every simulation speed. Left click
requires mouse capture.
The dotted preview shows the next shot at your current charge, aim, and movement;
the gold trail shows a fired probe. The game keeps the newest five probes. Landed
probes stay until cleared, reset, or replaced by a newer one.

In orbit view, select a point on the map and choose **Skip forward**. This advances
the shared clock for the habitat, Earth, Moon, and Sun. Moving probes disappear;
landed probes remain in place. Your position is preserved and velocity cleared.

If mouse capture is unavailable, choose **Continue with drag to look** and use F
or the launch button to fire. Opening **Controls** or hiding the tab pauses time.

Open monorail carts run spinward on the mint line and antispinward on the amber
line, with six stations and automatic stops. Walk up a station ramp and straight
onto a cart, then move around or jump off. Carts reach 69 km/h and follow simulation
speed and time skips. A cart hitting you on the track pushes you to the side.

## What's included

- Six districts with procedural buildings, trees, farms, water, and static residents.
- Two monorail lines, six raised stations, and open carts you can walk into.
- Walking, jumping, stabilized flight, and a visible first-person body and launcher.
- Rotating-frame ballistics, trajectory previews, and floor and side-wall collision.
- Earth, Moon, Sun, eclipses, adjustable time, and an inertial exterior view with an orbit map.

This is a stylized prototype. The deck is a cylindrical ring rather than a full
toroidal surface. Buildings and residents are scenery without collision. The sky
uses approximate circular orbits and a fixed opening alignment, not the current
date. There is no multiplayer, saved progress, touch, or gamepad support yet.

## Development

Requires **Node.js 22.18 or newer** and npm.

```sh
npm ci
npm run dev      # Open the local address printed by Vite
npm test        # Physics, movement, orbit, and time-skip tests
npm run check   # TypeScript checks
npm run build   # Production build in dist/
npm run preview # Serve the production build locally
```

[Three.js](https://threejs.org/) is the only runtime dependency; development uses
TypeScript and Vite. Assets are generated in code. No API keys, downloaded models,
texture packs, external fonts, or backend are required. The build is a static site.

See the [orbital model](docs/orbit.md) for assumptions and equations, and the
[deployment guide](docs/deployment.md) for hosting and rollback.

## Roadmap

- Add building collision, terrain variation, and a full toroidal deck.
- Add scale and spin presets and more trajectory experiments.
- Improve accessibility, configurable controls, and performance settings.
- Explore touch, gamepad support, and eventually shared exploration.

These are directions for future work, with no fixed release schedule.
