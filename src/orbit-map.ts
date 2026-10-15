import "./orbit-map.css";
import {
  EARTH_RADIUS,
  ORBIT_RADIUS,
  ORBIT_START_PHASE,
  getOrbitMapState,
  getOrbitState,
} from "./orbit.ts";
import { nextOrbitOccurrence } from "./time-skip.ts";

const TAU = Math.PI * 2;
const CENTER_X = 132;
const CENTER_Y = 112;
const MAP_RADIUS = 84;
const MAP_EARTH_RADIUS = (MAP_RADIUS * EARTH_RADIUS) / ORBIT_RADIUS;

function point(phase: number, radius = MAP_RADIUS) {
  return {
    x: CENTER_X + radius * Math.cos(phase * TAU),
    y: CENTER_Y - radius * Math.sin(phase * TAU),
  };
}

function duration(seconds: number): string {
  const rounded = Math.max(1, Math.ceil(seconds));
  const minutes = Math.floor(rounded / 60);
  return minutes > 0
    ? `${minutes} min ${String(rounded % 60).padStart(2, "0")} s`
    : `${rounded} s`;
}

/** A geocentric map of the shared analytic orbit; selecting a point never rewinds. */
export function buildOrbitMap(
  container: HTMLElement,
  onSkipToPhase: (phase: number) => void,
): { update(simSeconds: number): void; dispose(): void } {
  container.setAttribute("aria-label", "Habitat orbital map and time skip");
  container.innerHTML = `
    <div class="orbit-map-heading">
      <div><p class="eyebrow">ORBITAL NAVIGATION</p><h2>Choose the next horizon</h2></div>
      <span class="orbit-map-live" data-current-light>SUNLIT</span>
    </div>
    <svg class="orbit-map-chart" viewBox="0 0 264 234" role="img"
      aria-label="Earth-centred habitat orbit. Filled dot is the habitat; hollow dot is the destination. The dim arc is Earth's shadow.">
      <defs>
        <radialGradient id="orbit-map-ocean" cx="70%" cy="35%" r="85%">
          <stop offset="0" stop-color="#397786"/><stop offset="1" stop-color="#1b3c4b"/>
        </radialGradient>
      </defs>
      <line class="orbit-map-axis" x1="18" y1="112" x2="246" y2="112"/>
      <line class="orbit-map-axis" x1="132" y1="9" x2="132" y2="215"/>
      <circle class="orbit-map-track" cx="132" cy="112" r="84"/>
      <path class="orbit-map-shadow" data-shadow/>
      <circle cx="132" cy="112" r="${MAP_EARTH_RADIUS}" fill="url(#orbit-map-ocean)"/>
      <g data-earth-night transform="translate(132 112)">
        <path d="M 0 ${-MAP_EARTH_RADIUS} A ${MAP_EARTH_RADIUS} ${MAP_EARTH_RADIUS} 0 0 0 0 ${MAP_EARTH_RADIUS} Z" fill="#071820" fill-opacity="0.78"/>
      </g>
      <circle class="orbit-map-atmosphere" cx="132" cy="112" r="${MAP_EARTH_RADIUS}"/>
      <text class="orbit-map-earth-label" x="132" y="110">EARTH</text>
      <text class="orbit-map-earth-size" x="132" y="124">6,371 km radius</text>
      <text class="orbit-map-zero" x="226" y="127">0°</text>
      <path class="orbit-map-prograde" d="M 123 26 L 116 29 L 123 33"/>
      <g class="orbit-map-sun" data-sun>
        <circle r="4"/><path d="M -8 0 H -6 M 6 0 H 8 M 0 -8 V -6 M 0 6 V 8 M -5.7 -5.7 L -4.2 -4.2 M 4.2 4.2 L 5.7 5.7 M -5.7 5.7 L -4.2 4.2 M 4.2 -4.2 L 5.7 -5.7"/>
      </g>
      <g data-destination class="orbit-map-destination"><circle r="8"/><circle r="2"/></g>
      <g data-habitat class="orbit-map-habitat"><circle r="5"/><circle r="1.5"/></g>
      <circle class="orbit-map-hit-area" cx="132" cy="112" r="84"/>
      <text class="orbit-map-scale" x="132" y="231">2,000 KM ALTITUDE · ORBIT PLANE VIEW</text>
    </svg>
    <div class="orbit-map-legend" aria-hidden="true">
      <span><i class="orbit-map-current-key"></i>Habitat</span>
      <span><i class="orbit-map-target-key"></i>Destination</span>
      <span><i class="orbit-map-shadow-key"></i>Shadow</span>
    </div>
    <div class="orbit-map-range-label"><label for="orbit-destination">Orbit destination</label><output for="orbit-destination" data-angle>0°</output></div>
    <input id="orbit-destination" class="orbit-map-range" type="range" min="0" max="359" step="1" value="0" aria-describedby="orbit-map-instructions orbit-map-preview"/>
    <p id="orbit-map-instructions" class="orbit-map-instructions">Select a point on the ring, or use the slider.</p>
    <button class="orbit-map-skip" type="button" data-skip><span>Skip forward</span><span id="orbit-map-preview" data-preview>+0 min</span><span aria-hidden="true">↗</span></button>
    <p class="orbit-map-note">Advances the whole sky. Airborne probes disappear; landed probes stay. Moon outside this map's scale.</p>
  `;

  const find = <T extends Element>(selector: string) =>
    container.querySelector<T>(selector)!;
  const chart = find<SVGSVGElement>(".orbit-map-chart");
  const range = find<HTMLInputElement>(".orbit-map-range");
  const angleLabel = find<HTMLOutputElement>("[data-angle]");
  const skip = find<HTMLButtonElement>("[data-skip]");
  const preview = find<HTMLSpanElement>("[data-preview]");
  const habitat = find<SVGGElement>("[data-habitat]");
  const destination = find<SVGGElement>("[data-destination]");
  const sun = find<SVGGElement>("[data-sun]");
  const earthNight = find<SVGGElement>("[data-earth-night]");
  const shadow = find<SVGPathElement>("[data-shadow]");
  const currentLight = find<HTMLSpanElement>("[data-current-light]");
  const events = new AbortController();
  let currentTime = 0;
  let selectedPhase = 0;
  let initialized = false;
  let lastShadowEpoch = NaN;

  function updateDestination() {
    const target = point(selectedPhase);
    destination.setAttribute("transform", `translate(${target.x} ${target.y})`);
    const degrees = Math.round(selectedPhase * 360) % 360;
    range.value = String(degrees);
    angleLabel.value = `${degrees}°`;
    range.setAttribute("aria-valuetext", `${degrees} degrees around the orbit`);
    const state = getOrbitMapState(currentTime);
    const nextTime = nextOrbitOccurrence(
      currentTime,
      selectedPhase,
      state.orbitPeriodSeconds,
      ORBIT_START_PHASE,
    );
    const ahead = duration(nextTime - currentTime);
    preview.textContent = `+${ahead}`;
    skip.setAttribute(
      "aria-label",
      `Skip forward ${ahead} to ${degrees} degrees`,
    );
  }

  function selectPhase(phase: number) {
    selectedPhase = (((Math.round(phase * 360) % 360) + 360) % 360) / 360;
    updateDestination();
  }

  range.addEventListener(
    "input",
    () => selectPhase(Number(range.value) / 360),
    {
      signal: events.signal,
    },
  );
  chart.addEventListener(
    "click",
    (event) => {
      const matrix = chart.getScreenCTM();
      if (!matrix) return;
      const mouse = new DOMPoint(event.clientX, event.clientY).matrixTransform(
        matrix.inverse(),
      );
      const dx = mouse.x - CENTER_X;
      const dy = mouse.y - CENTER_Y;
      // The Earth is not a destination. Keep the whole ring easy to select.
      if (Math.abs(Math.hypot(dx, dy) - MAP_RADIUS) > 20) return;
      selectPhase(Math.atan2(-dy, dx) / TAU);
    },
    { signal: events.signal },
  );
  skip.addEventListener("click", () => onSkipToPhase(selectedPhase), {
    signal: events.signal,
  });

  function updateShadow(simSeconds: number, period: number) {
    const pieces: string[] = [];
    const samples = 180;
    for (let i = 0; i < samples; i++) {
      const sampleTime = nextOrbitOccurrence(
        simSeconds,
        (i + 0.5) / samples,
        period,
        ORBIT_START_PHASE,
      );
      if (getOrbitState(sampleTime).sunlight >= 0.5) continue;
      const start = point(i / samples);
      const end = point((i + 1) / samples);
      pieces.push(
        `M${start.x.toFixed(2)} ${start.y.toFixed(2)}L${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
      );
    }
    shadow.setAttribute("d", pieces.join(""));
  }

  return {
    update(simSeconds: number) {
      currentTime = simSeconds;
      const state = getOrbitMapState(simSeconds);
      if (!initialized) {
        selectPhase((state.orbitalPhase + 0.25) % 1);
        initialized = true;
      }
      const current = point(state.orbitalPhase);
      habitat.setAttribute("transform", `translate(${current.x} ${current.y})`);
      const sunPoint = point(state.sunAngle / TAU, MAP_RADIUS + 22);
      sun.setAttribute("transform", `translate(${sunPoint.x} ${sunPoint.y})`);
      earthNight.setAttribute(
        "transform",
        `translate(132 112) rotate(${(-state.sunAngle * 180) / Math.PI})`,
      );
      const eclipsed = getOrbitState(simSeconds).eclipsed;
      currentLight.textContent = eclipsed ? "IN SHADOW" : "SUNLIT";
      currentLight.classList.toggle("in-shadow", eclipsed);
      updateDestination();
      const shadowEpoch = Math.floor(simSeconds / 30);
      if (shadowEpoch !== lastShadowEpoch) {
        updateShadow(simSeconds, state.orbitPeriodSeconds);
        lastShadowEpoch = shadowEpoch;
      }
    },
    dispose() {
      events.abort();
      container.replaceChildren();
    },
  };
}
