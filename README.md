# Torus

A browser game for exploring a rotating space habitat. Walk, jump, fly, and launch
probes to see how trajectories curve in a rotating reference frame.

**[Play Torus](https://torus.classroom-fox.com)** ·
[Build checks](https://github.com/DanielHaggstrom/stanford-torus/actions) ·
[MIT license](LICENSE)

**Version 0.9.0** · Keyboard, mouse, or touch · WebGL 2

## Playing

The game opens inside the habitat. Click the world to capture your mouse, or drag
to look if capture is unavailable. Open **Controls** for settings and help.

On phones and tablets, use the left stick to move and drag the world to look.
Hold and drag Fire to charge and aim with the same thumb. Fly enables Rise and
Down. Systems contains probe controls, precision flight, fullscreen, and Reset.
Touch play uses landscape; portrait pauses with a rotate-device prompt.

Touch controls appear automatically for a primary touch pointer. Touchscreen
laptops with a primary mouse keep desktop controls. Input layout, graphics,
sensitivity, and sound preferences are available under **Controls** and saved
in your browser.

| Controls                                | Action                                              |
| --------------------------------------- | --------------------------------------------------- |
| WASD / arrow keys                       | Move                                                |
| Mouse                                   | Look around                                         |
| Space                                   | Jump, or rise in flight                             |
| Q                                       | Descend in flight                                   |
| Shift                                   | Hold for precision flight                           |
| V                                       | Toggle walking / flight                             |
| Hold F, left click, or **Launch probe** | Charge; release to fire                             |
| Right click                             | Cancel a charged shot                               |
| C                                       | Clear probes                                        |
| Hold R for 0.6 seconds                   | Reset position and clear probes                     |
| , / . or **Time** selector; T            | Choose 1×, 5×, or 10×; T returns to 1×                |
| O                                       | Switch between first person and exterior orbit view |
| M / **Sound** button                    | Mute or unmute; volume is under **Controls**         |
| Drag / scroll in orbit view             | Rotate the camera / zoom                            |
| Esc                                     | Release the mouse and pause exploration             |

Keep moving to build speed: walking ramps from 4 to 10 m/s and flight from
14 to 36 m/s. There is no sprint button. Precision flight runs at 1.5–3 m/s.
Jumps allow a little grace after leaving an edge and remember a press just before
landing. Flight stays deck-aligned inside and inertial outside. The transition
blends over one real second, preserving position, aim, and momentum. Automatic
braking remains active.

Tap to fire at 28 m/s. Charging starts after holding for 0.2 seconds and reaches
90 m/s one second later, using real time. Left click requires mouse capture.
The dotted path previews the next shot; gold trails show fired probes. Only the
newest five remain.

In orbit view, select a point on the map and choose **Skip forward**. This advances
the shared clock for the habitat, Earth, Moon, and Sun. Moving probes disappear;
landed probes remain in place. Your position is preserved and velocity cleared.

Opening **Controls** or hiding the tab pauses time.

Open monorail carts run spinward on the mint line and antispinward on the amber
line, with six stations and automatic stops. Walk up a ramp onto a cart, move
around, or jump off. Carts reach 69 km/h; collisions push you to the side.

Footsteps, shots, tram motors, brakes, arrival chimes, and a quiet ventilation hum
are synthesized in the browser. Sound starts after your first input and stops
outside the enclosure, while paused, or in orbit view.

## What's included

- Six districts with procedural buildings, trees, farms, water, and static residents.
- A research laboratory, civic hall, and medical centre with distinct facades and signs.
- Two monorail lines, six raised stations, and open carts you can walk into.
- Walking, jumping, stabilized flight, and a visible first-person body and launcher.
- Solid buildings, trees, and props; rooftop landings and wall sliding.
- Rotating-frame ballistics and matching trajectory previews against scenery.
- Procedural sound, a framed glass enclosure, pressure hull, trusses, and docking hub.
- An independent central axis with 20 large tilting solar/radiator wings and antennae.
- Earth, Moon, Sun, eclipses, adjustable time, and an inertial exterior view with an orbit map.

This stylized prototype uses a cylindrical deck and simplified scenery collisions.
Probes hit the enclosure; players can fly through it. The sky uses approximate
circular orbits and a fixed opening alignment. Multiplayer, saved progress, and
gamepad support are not implemented.

Exploration is limited to a sphere with a 750 m radius around the hub. A faint
boundary appears as you approach it: players stay inside, and probes disappear
when they cross out.

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

Further details: [flight and movement](docs/flight.md), [orbits](docs/orbit.md), [hosting](docs/deployment.md),
[touch controls](docs/mobile.md), [sound and collisions](docs/sound-and-collision.md),
and [axis and panels](docs/axis.md).

## Roadmap

- Add terrain variation, accessible interiors, and a full toroidal deck.
- Add scale and spin presets and more trajectory experiments.
- Improve accessibility, configurable controls, and performance settings.
- Expand mobile device testing, explore gamepads, and eventually shared exploration.

These are directions for future work, with no fixed release schedule.
