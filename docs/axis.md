# Central axis and solar wings

The habitat ring and spokes spin around a separate service axis. Bearings connect
the rotating spoke collars to the axis. Its orientation is independent of the
ring's roughly 29-second spin.

Twenty wings extend along one end, between 70 and 412 m from the centre. Each
wing spans 76 × 28 m, with clearance throughout its tilt range. The opposite
end carries a sealed orbital facility: seven modules, four airlocks, two docking
ports, antennae, and service equipment. These are exterior scenery with no
interior gameplay.

Three enclosed elevators travel along spokes spaced 120° apart. Each endpoint
stop lasts six seconds and each journey takes 24 seconds, using the shared
simulation clock. Travel indicators show their state. The cars are inaccessible;
a transfer bearing separates the rotating spokes from the orbital facility.

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

Tracking is geometric. It does not account for electrical output, thermal
balance, actuator inertia, or occlusion by other structures.
Each panel side has a single opaque skin. Solar-cell seams and radiator channels
use antialiased procedural shading that fades when details become smaller than a
pixel, avoiding overlapping surfaces and distant shimmer. No textures are needed.

## Habitat lighting

Direct sunlight gives the structure stronger light and shade. Seventy-two warm
enclosure fixtures and 27 spoke fixtures provide practical lighting. Four nearby
point lights approximate their illumination; the individual fixtures do not all
cast physical light. There is no global illumination simulation.

Desktop Automatic and Full graphics enable a 1024 × 1024 PCF Sun shadow map.
Balanced and touch Automatic disable Sun shadows to reduce rendering cost.
The deck uses one partitioned surface, and glazing and water have depth offsets
to avoid overlapping-surface flicker.
