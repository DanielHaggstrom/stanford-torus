export type GraphicsQuality = "auto" | "full" | "balanced";

export interface RenderBudget {
  pixelRatio: number;
  ghostHz: number;
}

/** Keep the desktop budget unless touch controls or a lighter preset are used. */
export function getRenderBudget(
  quality: GraphicsQuality,
  touchEnabled: boolean,
  devicePixelRatio: number,
): RenderBudget {
  const balanced = quality === "balanced" || (quality === "auto" && touchEnabled);
  const ratio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;
  return {
    pixelRatio: Math.min(ratio, balanced ? 1 : 1.75),
    ghostHz: balanced ? 15 : 24,
  };
}
