# Central axis and solar wings

The habitat ring and spokes spin around a separate service axis. Bearings connect
the rotating spoke collars to the axis, which extends beyond both sides of the
ring and carries paired panel wings, docking equipment, antennae, and service
booms. Its orientation is independent of the ring's roughly 29-second spin.

Each wing has a blue solar-cell face and an opaque radiator back. The axis can
turn about its length, and the wings can tilt on their hinges. In sunlight these
two motions point the solar faces directly toward the same Sun used by the sky
and lighting model. The reverse faces point away, keeping the radiators out of
direct sunlight.

When sunlight falls below 1% during an Earth eclipse, the drives hold the last
sunlit axis orientation and panel tilt. Tracking resumes on leaving the shadow.
The held orientation is inertial: the axis will still appear to turn when viewed
from the rotating habitat. Orbit view shows the ring rotating around it.

The pose is calculated from simulation time. Skipping into an eclipse gives the
same held pose as reaching it normally, without replaying mechanical movement
through the skipped interval. Pause and time-speed controls use the shared clock.

This is a geometric tracking model. It does not simulate electrical output,
thermal balance, actuator inertia, or detailed shadowing by other structures.
Each panel side has a single opaque skin. Solar-cell seams and radiator channels
use antialiased procedural shading that fades when details become smaller than a
pixel, avoiding overlapping surfaces and distant shimmer. No textures are needed.
