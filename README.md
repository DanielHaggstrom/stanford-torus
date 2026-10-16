# Torus

A browser game for exploring a rotating space habitat. Walk, jump, fly, and launch
probes to see how trajectories curve in a rotating reference frame.

**[Play Torus](https://torus.classroom-fox.com)** ·
[Build checks](https://github.com/DanielHaggstrom/stanford-torus/actions) ·
[MIT license](LICENSE)

**Version 0.7.0** · Keyboard, mouse, or touch · WebGL 2

## Playing

The game opens inside the habitat. On desktop, click the world to look around;
touch controls are ready immediately. Open **Controls** for the in-game reference.

On phones and tablets, use the left stick to move and drag the world to look.
Tap Jump or Fire; hold Fire to charge. Fly enables Rise and Down. Systems contains
probe controls and Reset; Orbit opens the exterior view and its collapsible map.
Touch play uses landscape; portrait pauses the game with a rotate-device prompt.
**Use landscape** or **Fullscreen** also tries to lock orientation where supported.

Touch controls appear automatically for a primary touch pointer. Touchscreen
laptops keep keyboard and mouse controls by default when the primary pointer is
a mouse. You can select either layout under **Controls**. Automatic graphics uses
a lighter rendering budget with touch; choose Full or Balanced there to override it.

| Controls                                | Action                                              |
| --------------------------------------- | --------------------------------------------------- |
| WASD / arrow keys                       | Move                                                |
| Mouse                                   | Look around                                         |
| Space                                   | Jump, or rise in flight                             |
| Q                                       | Descend in flight                                   |
| Shift                                   | Move faster                                         |
| V                                       | Toggle walking / flight                             |
| Hold F, left click, or **Launch probe** | Charge; release to fire                             |
| C                                       | Clear probes                                        |
| R                                       | Reset position and clear probes                     |
| , / . or **Time** selector              | Set simulation speed to 1×, 5×, or 10×              |
| O                                       | Switch between first person and exterior orbit view |
| M / **Sound** button                    | Mute or unmute; volume is under **Controls**         |
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

Footsteps, shots, tram motors, brakes, arrival chimes, and a quiet ventilation hum
are synthesized in the browser. Sound starts after your first input and stops
outside the pressure enclosure, while paused, or in orbit view.

## What's included

- Six districts with procedural buildings, trees, farms, water, and static residents.
- Two monorail lines, six raised stations, and open carts you can walk into.
- Walking, jumping, stabilized flight, and a visible first-person body and launcher.
- Solid buildings, trees, and props; rooftop landings and wall sliding.
- Rotating-frame ballistics and matching trajectory previews against scenery.
- Procedural sound, a framed glass enclosure, pressure hull, trusses, and docking hub.
- An independent central axis with tilting solar/radiator wings and antennae.
- Earth, Moon, Sun, eclipses, adjustable time, and an inertial exterior view with an orbit map.

This is a stylized prototype. The deck is a cylindrical ring rather than a full
toroidal surface. Scenery uses simplified collision bounds. Probes hit the curved
enclosure, including its sides; players can fly through it into space. The sky
uses approximate circular orbits and a fixed opening alignment, not the current
date. There is no multiplayer, saved progress, or gamepad support yet.

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
The [touch controls guide](docs/mobile.md) covers mobile input and testing.
See [sound and collision](docs/sound-and-collision.md) for how those systems work.
The [axis and panels](docs/axis.md) guide explains Sun tracking and eclipse behavior.

## Roadmap

- Add terrain variation, accessible interiors, and a full toroidal deck.
- Add scale and spin presets and more trajectory experiments.
- Improve accessibility, configurable controls, and performance settings.
- Expand mobile device testing, explore gamepads, and eventually shared exploration.

These are directions for future work, with no fixed release schedule.
