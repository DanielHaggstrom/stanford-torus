# Torus

Explore a rotating space habitat in your browser. Walk, jump, ride a tram, fly
into space, and launch probes to see trajectories in different reference frames.

**[Play Torus](https://torus.classroom-fox.com)** ·
[Build checks](https://github.com/DanielHaggstrom/stanford-torus/actions) ·
[MIT license](LICENSE)

**v1.0.0-rc.1** · Keyboard, mouse, or touch · WebGL 2

## Play

The game starts inside the habitat. Click or press **Enter** to explore;
**H** opens controls and settings. Mouse capture is optional: drag to look if
your browser cannot capture it.

| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse / IJKL | Look |
| Space / Q | Jump or rise / descend in flight |
| V / hold Shift | Toggle flight / precision flight |
| F / left click | Tap to fire; hold to charge, release to launch |
| Right click | Cancel charge |
| C / G | Clear probes / toggle trajectory preview |
| Hold R | Reset position and clear probes |
| , / . / T | Slower / faster time / return to 1× |
| O | Toggle exterior orbit view |
| H / M | Controls / mute |
| Esc / Enter | Pause or return focus to the world / resume |
| Tab / Shift Tab | Select controls; Enter or Space activates them |

Keep moving to gain speed; there is no sprint button. A tap fires at 28 m/s.
Charging begins after 0.2 seconds and reaches 90 m/s one second later. The dotted
path predicts the next shot; gold trails show fired probes. The newest five remain.

In orbit view, use drag or WASD/arrows to inspect, and scroll or +/− to zoom.
**N** focuses the destination slider. Choose a point with arrows, Tab to
**Skip forward**, and press Enter. The shared clock advances for the whole sky;
airborne probes clear and landed probes stay. Esc returns focus to the world.

On a phone or tablet, play in landscape. Use the left stick to move and drag the
world to look. Hold and drag **Fire** to charge and aim. **Fly** enables Rise and
Down; **Systems** contains the remaining options. Touchscreen laptops retain
desktop controls when their primary pointer is a mouse.

Settings persist in your browser. Opening Controls, pausing exploration, or hiding
the tab pauses the simulation. Sound begins after your first input.

## The habitat

Six districts contain procedural buildings, trees, farms, water, and residents.
Open monorail carts stop at six stations. Three sealed elevators connect to a
central orbital facility; its independent solar/radiator array tracks the Sun
and holds position during eclipse. Earth, Moon, Sun, lighting, and time skips
share an approximate orbital model.

This is a stylized playground: the deck is cylindrical, scenery collisions are
simplified, and buildings and elevators have no accessible interiors. Players can
fly through the enclosure; probes stop on it. Flight follows the ring inside and
smoothly becomes inertial outside. A 750 m boundary limits exploration.

## Develop

Install **Node.js 22.18 or newer** and npm. No keys or server are needed.

```sh
npm ci
npm run dev        # Local development server
npm test           # Physics, geometry, and behaviour regressions
npm run check      # Strict TypeScript checks
npm run build      # Static site in dist/
npm run preview    # Serve that build locally
npm run benchmark  # CPU timings and scene inventory
```

[Three.js](https://threejs.org/) is the only runtime dependency. TypeScript and
Vite handle development and builds. Geometry and sounds are generated in code;
there are no texture packs, downloaded models, external fonts, or backend.

Details: [movement](docs/flight.md), [orbits](docs/orbit.md),
[touch](docs/mobile.md), [sound and collisions](docs/sound-and-collision.md),
[axis](docs/axis.md), [performance](docs/performance.md),
[v1 audit](docs/v1-audit.md), and [hosting](docs/deployment.md).

## Roadmap

- Test more physical phones and tablets; improve accessibility and add remapping.
- Add terrain variation and a full toroidal deck.
- Add scale/spin presets and more trajectory experiments.
- Explore accessible interiors, gamepads, and shared exploration.

These are possible next steps, with no fixed schedule.
