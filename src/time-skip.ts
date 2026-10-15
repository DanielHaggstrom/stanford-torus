/** Return the next future clock time at a normalized orbital phase (one turn = 1). */
export function nextOrbitOccurrence(
  simSeconds: number,
  targetPhase: number,
  periodSeconds: number,
  startPhase = 0,
): number {
  if (
    !Number.isFinite(simSeconds) ||
    !Number.isFinite(targetPhase) ||
    !Number.isFinite(startPhase) ||
    !Number.isFinite(periodSeconds) ||
    periodSeconds <= 0
  ) {
    throw new RangeError(
      "Orbital clock inputs must be finite and the period positive.",
    );
  }

  const wrap = (phase: number) => ((phase % 1) + 1) % 1;
  const currentPhase = wrap(simSeconds / periodSeconds + startPhase);
  let turnsAhead = wrap(wrap(targetPhase) - currentPhase);

  // Matching the current marker means the next lap, including round-off at
  // an exact phase boundary. Never rewind the shared clock or skip zero time.
  if (turnsAhead < 1e-10) turnsAhead = 1;
  return simSeconds + turnsAhead * periodSeconds;
}
