// Owner: Ebin
// Slope binning for the Dispersion Histogram (pure, so the component file only exports a component).
export function binSlopes(slopesDeg: ArrayLike<number>, binWidthDeg: number): { counts: number[]; withinTolerance: (tol: number) => number } {
  let max = 0;
  for (let i = 0; i < slopesDeg.length; i++) if (slopesDeg[i] > max) max = slopesDeg[i];
  const counts = new Array<number>(Math.max(1, Math.floor(max / binWidthDeg) + 1)).fill(0);
  for (let i = 0; i < slopesDeg.length; i++) counts[Math.floor(slopesDeg[i] / binWidthDeg)]++;
  return {
    counts,
    withinTolerance: (tol) => {
      let n = 0;
      for (let i = 0; i < slopesDeg.length; i++) if (slopesDeg[i] <= tol) n++;
      return slopesDeg.length ? (100 * n) / slopesDeg.length : 0;
    },
  };
}
