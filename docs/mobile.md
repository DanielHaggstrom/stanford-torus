# Touch controls

Phones and tablets use the same game and physics as desktop. A primary coarse
pointer enables the touch layout automatically. A fine primary pointer keeps
the keyboard and mouse layout, including on touchscreen laptops. The Controls
dialog lets players choose either layout explicitly.

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

Automatic graphics caps the drawing pixel ratio at 1 with touch controls and
updates the trajectory preview at 15 Hz. Desktop retains its previous cap of
1.75 and 24 Hz preview. Full restores that budget on touch; Balanced selects the
lighter budget on either layout. Neither preset changes physics, simulation
time, geography, or scenery. No new dependency or server runtime is required.

## Validation

Input tests cover analog dead zones, diagonal speed, independent fingers,
shot ownership, cancellation, flight controls, and clearing held state. Rendering
budget tests check desktop defaults and explicit overrides.

Browser checks cover 844×390 phone landscape, 390×844 portrait, and 1024×768 tablet
layouts, touch entry, joystick movement, charged firing, flight, reset, pause,
the orbit map, and switching back to keyboard and mouse. The test browser uses
the manual Touch setting and pointer input; these checks do not reproduce a
physical phone's GPU, browser chrome, operating-system gestures, or multitouch
hardware. Physical iOS and Android checks remain to be done.
