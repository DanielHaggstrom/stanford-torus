# Touch controls

Phones and tablets use the same game and physics as desktop. A primary coarse
pointer enables the touch layout automatically. A fine primary pointer keeps
the keyboard and mouse layout, including on touchscreen laptops. The Controls
dialog lets players choose either layout explicitly.
The game opens directly inside the habitat, with touch controls active immediately.
Touch play uses landscape. Portrait shows a rotate-device prompt and pauses
simulation and input; turning the device sideways removes the prompt. The
**Use landscape** and **Fullscreen** buttons request fullscreen and then attempt
an orientation lock. This API has limited browser support, so manual rotation
remains the fallback. See [MDN's orientation lock documentation](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock).

The left stick provides analog movement; dragging the world changes the view.
Continuing to move builds speed without a Sprint button: walking ramps from
4 to 10 m/s and flight from 14 to 36 m/s. Jump becomes a held Rise button in
flight, above Down. Fire keeps the same real-time tap and charge timing,
and dragging the Fire button aims while charging. Two thumbs can move, aim,
and fire together. Systems contains probe controls, Fullscreen, Reset, and a
flight-only Precision toggle for close inspection at 1.5–3 m/s.
Firing uses the existing charge meter, sound, recoil, and probe count for feedback;
there is no launch notification over the view.
Orbit has a Return button and a collapsible map; its camera supports dragging
and pinching through Three.js OrbitControls.

Each gesture owns its pointer independently. Releasing or cancelling a movement
or look finger does not release a charged shot. The Fire finger can also aim;
another finger cannot release its shot. Lost capture ends the affected
gesture. Pause, help, view changes, reset, focus loss, hiding the page, and resizing
clear all held input; cancelled shots do not fire. Touch exploration resumes
explicitly after losing focus or opening help.

Controls includes separate mouse and touch sensitivity sliders. Input layout,
graphics, sensitivity, volume, and mute preferences persist in the browser's
local storage. Storage restrictions fall back to defaults for the current visit.

Flight follows the deck inside the enclosure and smoothly adopts an inertial
reference outside, including near the hub. The transition takes about one real
second and preserves position, aim, and momentum. A 750 m exploration sphere
keeps the player near the habitat; probes disappear when crossing out. These
rules and jump grace/buffering are shared with desktop. Simulation speeds of
5× and 10× also accelerate movement; the Time selector returns to 1×.

Automatic graphics caps the drawing pixel ratio at 1 with touch controls.
Desktop retains its cap of 1.75. Full restores that budget on touch and enables
Sun shadows. Desktop Automatic also enables Sun shadows; Balanced and touch
Automatic leave them off. These presets keep the same scenery and physics.
The trajectory preview follows
the current camera and launch state every rendered frame, with unchanged shots
cached. No new dependency or server runtime is required.

## Validation

Input tests cover analog dead zones, diagonal speed, independent fingers,
two-thumb movement and charged aiming, shot ownership, cancellation, flight
controls, and clearing held state. Rendering
budget tests check desktop defaults and explicit overrides.

Browser checks cover 844×390 phone landscape, 390×844 portrait, and 1024×768 tablet
layouts, touch entry, joystick movement, charged firing, flight, reset, pause,
the orbit map, and switching back to keyboard and mouse. Landscape API tests
cover fullscreen ordering, missing features, and rejected requests. The test browser uses
the manual Touch setting and pointer input; these checks do not reproduce a
physical phone's GPU, browser chrome, operating-system gestures, or multitouch
hardware. Physical iOS and Android checks remain to be done.
