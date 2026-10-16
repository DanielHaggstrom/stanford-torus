# Sound and collision

Sound uses WebAudio oscillators and one generated noise buffer. There are no
audio downloads or new dependencies. A real click, touch, or key starts audio,
as required by browser autoplay rules. Unsupported audio does not prevent play.
The header Sound button and M toggle mute; Controls contains a volume slider.

Footsteps follow speed relative to the supporting surface, so standing in a
moving cart does not produce steps. Tram sounds use their actual positions and
timetable: motor pitch rises with speed, braking adds a hiss, and arrival rings
once. Pausing or skipping time clears sound events; resuming does not replay them.
At faster simulation speeds, footstep cadence is capped for comfortable listening.
Tram motors, brakes, and arrival bells use a reduced mix level.

The enclosure cross-section is an ellipse above the cylindrical deck, 35 m high
and 24 m across from its centre to either side. The listener's head position
determines whether it is inside. Leaving that volume hard-mutes the final audio
output, including shots and sound tails. Orbit view, help, hidden tabs, portrait
touch blocking, and paused exploration also mute everything. The canopy remains
permeable to players, including its curved sides. The deck still supports walking;
beyond its edges there is no invisible floor or wall to pull players back inside.

Static scenery colliders come from the same transforms and geometry bounds as
the visible pieces. Individual building components preserve courtyards and open
pavilions. These are simplified oriented boxes, including coarse tree canopies;
small decorative details are omitted. The player's capsule slides along solid
surfaces and can land on and walk off roofs. Existing floor, station, and moving
cart support remains separate.

Probes and their preview share the same first-contact solver for scenery, floor,
and the entire curved enclosure. Roof, side, and outer hull contacts work from
inside or outside, so a probe fired from space also stops on the shell. The player's muzzle
stays with the player in space. Short intervals bound the curve of the exact rotating-frame
trajectory; contact times are refined against the actual trajectory. A spatial
grid limits checks to nearby scenery. Probe collision uses its centre point.

The preview uses the current launch position and velocity on every rendered
frame. Unchanged shots reuse a cached prediction; movement, aiming, and charging
update it immediately. Preview markers use a consistent transparent draw order
without writing depth, so glazing and contact surfaces do not cause flicker.
