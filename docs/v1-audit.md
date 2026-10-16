# v1.0.0 readiness audit

This pass prepares **v1.0.0-rc.1**. The comparison baseline is v0.10.0
(`3b2935e`). Performance measurements are in [performance.md](performance.md).

## Geometry

Checked the habitat deck/enclosure, housing, civic buildings, residents, benches,
tram stations, trusses, lights, elevators, axis facility, antennae, and array.
Corrected the following attachment defects:

- Housing foundations, standing residents, bench feet, and station posts sat
  above their supporting surfaces.
- The laboratory's angled canopies lacked supports; some roof fittings floated.
- Crown/spoke lamps and small marker lights missed their mounts.
- Main enclosure ribs used a different arc from the pressure glazing.
- Spoke roots and array longerons ended short of their hub/shoulder connections.
- Facility equipment, dish/mast roots, airlock flanges, and reinforcement hoops
  missed the actual faceted hull surfaces.
- The elevator transfer drum obscured the closed hub doors.

Regression checks use actual rendered transforms, ray intersections and support
footprints, including the opposite deck and moving array poses. They check
physical contact, closed shells, and access/collision behaviour rather than
screenshots or mesh counts alone.

Pressure connections deliberately overlap to form closed joints. Buildings,
elevators and the orbital facility remain exterior scenery with closed doors.
Decorative exterior trusses have no collision; the player can still fly through
the pressure canopy, as designed.

Enclosure collision uses a smooth ellipse while the visual shell is faceted.
Sampled separation along collision normals is under 13 cm; a 282-ray regression
enforces a 20 cm limit. The solver remains continuous, including fast probes
crossing the whole enclosure within one update.

## Code and tests

Removed the unused flat-cylinder projectile solver and its integration/sampling
wrappers. Charged-shot tests now exercise the same curved-enclosure/scenery
solver used by live probes. Removed an unused trajectory-cache method, unified
shared habitat dimensions, and enabled TypeScript's unused-local/parameter checks
for source, tests and benchmark scripts.

Retained tests that cover different failure modes: analytic physics, rendered
transforms, real collisions, input cancellation, and audio gating. The audit did
not justify replacing the existing collision broad phase, analytic orbit model,
or flight-assist logic with a new framework.

The project still has one runtime dependency (Three.js), a static build, and no
backend, credentials, third-party telemetry, or downloaded visual/audio assets.
Benchmarking is opt-in with `?benchmark=1`; normal play has no benchmark panel or
frame recording.

## Keyboard access

- H opens/closes Controls; Esc closes it and Enter resumes exploration.
- Tab releases mouse capture and focuses Controls. Native Tab/Shift Tab, arrows,
  Enter and Space operate the settings; Esc returns focus to the world.
- I/J/K/L aim, G toggles the preview, and existing movement/launcher/time keys remain.
- Orbit view supports WASD/arrows and +/− zoom. N focuses its destination slider;
  arrows choose a destination, then Tab and Enter activate Skip forward.
- Form controls keep their native keys; held shortcuts cannot repeat destructive
  actions or change views while editing a setting.

## Validation and remaining scope

Automated checks cover physics, motion, trajectories, geometry attachments,
shared-clock time skips, array tracking, touch input ownership, preferences and
sound gates. The production build and browser smoke tests check desktop and a
landscape touch layout, including pause/resume, keyboard settings, orbit skips,
lighting, and console errors.

Phone-size browser tests run on a laptop GPU. Physical Android/iOS hardware,
thermal behaviour, battery life, and a wider accessibility review remain useful
before declaring the final v1.0.0 release. Key remapping, gamepads, saved progress,
multiplayer and accessible interiors remain outside this release's scope.
