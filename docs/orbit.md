# Orbital sky

TORUS uses a small analytic model to keep the view of Earth, the Moon, and the Sun consistent with a spinning habitat. It evaluates positions directly from simulation time; there is no orbital physics engine, ephemeris download, or network request.

The source of truth is [`src/orbit.ts`](../src/orbit.ts). [`src/sky.ts`](../src/sky.ts) renders that state, and [`tests/orbit.test.ts`](../tests/orbit.test.ts) checks orbital distance, period, angular size, habitat spin, lunar parallax, eclipses, and continent placement.

## Scenario and reference values

The habitat follows a circular orbit **2,000 km above a spherical Earth**, inclined **28.5° to Earth's equator**. These are scenario choices. Its fixed spin axis is tilted **18° from the orbit normal**, so Earth starts to one side of the ring plane and traces an oblique path across the sky. Its spin rate is the same rate used for the playable deck's artificial gravity.

| Quantity                          | Value used               |
| --------------------------------- | ------------------------ |
| Earth mean radius                 | 6,371 km                 |
| Earth gravitational parameter, μ  | 3.986004418 × 10¹⁴ m³/s² |
| Earth sidereal rotation           | 23.9345 hours            |
| Earth obliquity                   | 23.44°                   |
| Mean Earth–Moon distance          | 384,400 km               |
| Moon mean radius                  | 1,737.4 km               |
| Moon sidereal orbital period      | 27.3217 days             |
| Lunar inclination to the ecliptic | 5.145°                   |
| Mean Earth–Sun distance           | 149,598,000 km           |
| Sun mean radius                   | 695,700 km               |
| Annual solar direction period     | 365.256 days             |

Earth's mean radius, sidereal rotation, obliquity, orbital distance, year, and rounded gravitational parameter follow the [NASA Earth Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html). Lunar values follow the [NASA Moon Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html); the solar radius follows the [NASA Sun Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html).

Simulation **T+00:00:00** is an invented equinox alignment: the habitat is at its ascending node, Greenwich and the Sun face inertial +X, and the Moon begins 125° along its circular orbit. This is a repeatable demonstration scenario, not the sky on the player's current date.

## Positions, orientation, and apparent size

Using metres and seconds, the habitat's orbital radius and period are:

```text
r = Earth radius + altitude = 8,371,000 m
T = 2π √(r³ / μ) ≈ 7,622.14 s ≈ 127.04 minutes
```

Habitat and Moon positions come from inclined circles. The annual solar direction includes Earth's obliquity. Subtracting the habitat's inertial position gives the direction and distance to each body. Those relative vectors rotate into the orbital plane, through the fixed 18° tilt about orbital +Z, and through the inverse of the habitat's spin. This same frame change applies to all bodies, surface orientations, stars, and sunlight; Earth's lateral placement is consistent with the lighting and eclipses. The habitat axis remains fixed in inertial space: the model does not add an extra turn per orbit to keep the same deck facing Earth.

Earth's map rotates once per sidereal day. The Moon's map keeps its near side facing Earth. The star field has fixed inertial directions and therefore appears to turn with the habitat. Player movement over the 420 m habitat does not introduce visible astronomical parallax; orbital motion does change the Moon's apparent position and size.

Each body's angular radius is calculated geometrically:

```text
angular radius = asin(body radius / distance from habitat)
```

At the starting alignment, the calculated angular diameters are approximately **99.12° for Earth**, **0.51° for the Moon**, and **0.53° for the Sun**. Earth is deliberately enormous because the observer is only 2,000 km above it. The Moon can sit outside the view, behind Earth, or behind habitat structures.

The sky uses a separate render pass with scaled distances that preserve these angular sizes and allow Earth to occlude the Moon and Sun. Code-drawn continent outlines, vertex colors, mathematical clouds, and a thin stylized atmospheric rim create Earth's surface; no satellite imagery or image textures are downloaded. The Sun has a bright warm-white physical disc and a procedural amber glare halo with restrained rays. That artistic camera glare extends to 3.2° around the centre; it does not change the Sun's physical angular size or eclipse calculations. Ordinary depth testing masks the glare behind Earth and the Moon, and Earth's eclipse visibility extinguishes it when the solar disc is hidden.

## Sunlight and night

Earth and Moon surface shading uses the Sun direction, producing a moving Earth terminator and lunar phases. Habitat directional lighting follows the same Sun direction. Habitat spin changes the local view and the direction of illumination on a roughly 29-second cycle; entering Earth's shadow produces the longer orbital night.

An Earth sphere and Sun ray determine whether the habitat is in shadow. The Sun's finite angular size supplies a smooth transition near Earth's limb. That transition approximates visible solar area rather than solving exact disk overlap. The same calculation can dim the Moon in Earth's shadow. Interior ambient and emergency lighting stay on during eclipse so the habitat remains navigable.

## Time and limits

The **1×, 5×, and 10×** controls scale the shared simulation clock for movement, ballistics, spin, orbital positions, and scenery animation. A 127-minute orbit takes approximately 12.7 real minutes at 10×. Launcher charging remains one real second at every rate.

Esc pauses exploration while the mouse is released; the Controls dialog and a hidden browser tab also pause simulation. Orbit view advances time while visible. Resuming does not catch up time spent paused or hidden.

The model assumes spherical bodies, circular orbits, fixed orbit planes, and a fixed habitat spin axis. It omits orbital eccentricity, precession, perturbations, real ephemerides, atmospheric refraction and realistic scattering, lunar libration, and detailed surface geography. Stars are a seeded illustrative field, not a catalog. Lighting is chosen for readable gameplay rather than photometric accuracy or complete structural shadowing. These limits keep the scene small while preserving the main geometry of a low-orbit viewpoint.
