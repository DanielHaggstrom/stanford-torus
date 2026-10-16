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
Jump becomes a held Rise button in flight, alongside Down. Fire keeps the same
real-time tap and charge timing. Systems contains probe controls and Reset.
Orbit has a Return button and a collapsible map; its camera supports dragging
and pinching through Three.js OrbitControls.

Each gesture owns its pointer independently. Releasing or cancelling a movement
or look finger does not release a charged shot. Lost capture ends the affected
gesture. Pause, help, view changes, reset, focus loss, hiding the page, and resizing
clear all held input; cancelled shots do not fire. Touch exploration resumes
explicitly after losing focus or opening help.

Automatic graphics caps the drawing pixel ratio at 1 with touch controls.
Desktop retains its cap of 1.75. Full restores that budget on touch; Balanced
selects the lighter budget on either layout. The trajectory preview follows
the current camera and launch state every rendered frame, with unchanged shots
cached. Neither preset changes physics, simulation
time, geography, or scenery. No new dependency or server runtime is required.

## Validation

Input tests cover analog dead zones, diagonal speed, independent fingers,
shot ownership, cancellation, flight controls, and clearing held state. Rendering
budget tests check desktop defaults and explicit overrides.

Browser checks cover 844×390 phone landscape, 390×844 portrait, and 1024×768 tablet
layouts, touch entry, joystick movement, charged firing, flight, reset, pause,
the orbit map, and switching back to keyboard and mouse. Landscape API tests
cover fullscreen ordering, missing features, and rejected requests. The test browser uses
the manual Touch setting and pointer input; these checks do not reproduce a
physical phone's GPU, browser chrome, operating-system gestures, or multitouch
hardware. Physical iOS and Android checks remain to be done.
