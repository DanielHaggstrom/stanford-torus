# Touch controls

Phones and tablets use the same game and physics as desktop. A coarse primary
pointer selects touch controls; touchscreen laptops with a mouse retain desktop
controls. Controls lets players override the layout and adjust sensitivity.

Play in landscape. Portrait pauses the game and shows a rotation prompt.
Fullscreen attempts an orientation lock, but browser support varies; rotating
the device manually remains the fallback.

- Use the left stick to move and drag the world to look.
- Hold and drag Fire to charge and aim while moving with the other thumb.
- Fly switches movement mode. Rise appears above Down during flight.
- Systems contains the remaining probe controls, Reset, Fullscreen, and a
  flight-only Precision toggle for inspecting details.
- Orbit view supports dragging and pinch zoom, with a collapsible map.

Continuing to move builds speed automatically. Tap and charge timing matches
desktop and stays constant at all simulation speeds. Cancelling a Fire gesture
does not launch a shot; other fingers do not release its charge. Pause, help,
view changes, focus loss, and resizing clear held input. Resume explicitly after
losing focus or opening Controls.

Automatic graphics caps pixel ratio at 1 and disables Sun shadows on touch input.
Full enables shadows and a higher drawing resolution. Settings persist locally
in the browser.

The layout has been checked at phone and tablet sizes in a desktop browser.
Physical iOS/Android testing, including multitouch, browser gestures, and
performance, remains useful.
