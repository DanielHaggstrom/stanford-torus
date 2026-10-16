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

The enclosure cross-section is an ellipse above the cylindrical deck, 35 m high
and 24 m across from its centre to either side. The listener's head position
determines whether it is inside. Leaving that volume hard-mutes the final audio
output, including shots and sound tails. Orbit view, help, hidden tabs, portrait
touch blocking, and paused exploration also mute everything. The canopy remains
permeable to powered flight, allowing players to leave and re-enter.

Static scenery colliders come from the same transforms and geometry bounds as
the visible pieces. Individual building components preserve courtyards and open
pavilions. These are simplified oriented boxes, including coarse tree canopies;
small decorative details are omitted. The player's capsule slides along solid
surfaces and can land on and walk off roofs. Existing floor, station, and moving
cart support remains separate.

Probes and their preview share the same first-contact solver for scenery, floor,
and side walls. Short intervals bound the curve of the exact rotating-frame
trajectory; contact times are refined against the actual trajectory. A spatial
grid limits checks to nearby scenery. Probe collision uses its centre point.

Tests cover enclosure boundaries, audio gating and event timing, wall sliding,
roof support, fast contacts, and agreement between previews and fired probes.
WebAudio graph tests use a fake audio device. Listening quality and mobile audio
behavior still need checks on physical hardware.
