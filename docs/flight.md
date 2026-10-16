# Flight and movement

**V** switches walking and flight. Keep moving to accelerate; there is no sprint
button. Walking reaches 10 m/s and flight 36 m/s after two real seconds. Hold
**Shift** for precision flight at 1.5–3 m/s. On touch screens, toggle precision
flight under **Systems**. Space/Rise and Q/Down move along your personal up axis.
Drag Fire to aim while charging, leaving the other thumb free to move.

## Reference frames

Inside the pressure enclosure, thrusters match the rotating habitat and the
horizon follows the deck. Outside, orientation stabilizes against non-spinning
space: the habitat rotates around you, while your personal up remains stable.
The horizon does not continually turn toward the axis during a hub inspection.

Crossing the enclosure blends the two modes over one real second. Separate
entry and exit thresholds prevent repeated switching near the glass. Re-entry
automatically restores the deck horizon. Position and aim never snap; physical
velocity is continuous, then thrusters gradually brake toward the selected
frame. Releasing movement brakes automatically in either mode.

Trajectory previews and recorded trails use the same frame blend. In space,
unforced probes follow straight paths. Predicted contact refers to the future
position of a rotating surface, so its surface marker is hidden in space.

Positions and velocities remain stored in rotating habitat coordinates. The
controller converts velocity using the habitat's spin and blends its target
reference frame. This is a comfort-oriented flight assist, with limited thrust
and approximate blended dynamics. “Inertial” means non-spinning axes centered on
the habitat; independent orbital translation around Earth is not simulated.

## Timing and limits

The 1×, 5× and 10× settings accelerate all moving physics, including navigation,
probes and trams, as well as habitat spin and the celestial clock. Press **T** to
return to 1×. Movement's two-second acceleration ramp and the one-second frame
blend still use real time. Jump buffering and grace after leaving an edge each
last 0.12 real seconds.

A virtual sphere of radius 750 m surrounds the habitat center. It becomes faintly
visible near the limit. Players slide along its inside, with room reserved for
their body; probes disappear on their first outward crossing. The sphere is a
navigation boundary, not a physical pressure enclosure. Players can fly through
the habitat glazing, while probes collide with it.
