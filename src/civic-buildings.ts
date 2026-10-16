/** Public buildings occupy reserved lots, rather than overlapping housing. */
export type CivicKind = "laboratory" | "civic hall" | "medical centre";
export type CivicFinish = "body" | "trim" | "glass" | "marking";

export interface CivicSite {
  kind: CivicKind;
  name: string;
  lot: number;
  side: -1 | 1;
  width: number;
  depth: number;
  height: number;
  accent: string;
}

export const CIVIC_SITES: readonly CivicSite[] = [
  { kind: "laboratory", name: "RESEARCH LAB", lot: 71, side: 1, width: 14, depth: 7.2, height: 4.6, accent: "#5caaa7" },
  { kind: "civic hall", name: "CIVIC HALL", lot: 24, side: -1, width: 15, depth: 7, height: 5.8, accent: "#bdad78" },
  { kind: "medical centre", name: "MEDICAL CENTRE", lot: 38, side: 1, width: 12, depth: 7, height: 4.2, accent: "#8ab4a0" },
];

export interface CivicPart {
  site: CivicKind;
  finish: CivicFinish;
  angle: number;
  across: number;
  height: number;
  width: number;
  tall: number;
  depth: number;
  tangentOffset: number;
  /** Local Z rotation, used for sloping canopies and their matching bounds. */
  tilt?: number;
  color?: string;
  collisionKind?: string;
}

export function civicSiteAt(lot: number, side: number): CivicSite | undefined {
  return CIVIC_SITES.find((site) => site.lot === lot && site.side === side);
}

export function civicSiteAngle(site: CivicSite): number {
  return (site.lot / 72) * Math.PI * 2;
}

export const CIVIC_FRONT_ACROSS = 13.3;

/** Shared box batches handle walls, trim, glazing and small civic emblems. */
export function createCivicParts(): CivicPart[] {
  const parts: CivicPart[] = [];
  for (const site of CIVIC_SITES) {
    const { width, depth, height, side } = site;
    const box = (
      finish: CivicFinish,
      x: number,
      back: number,
      y: number,
      w: number,
      h: number,
      d: number,
      color?: string,
      solid = finish === "body" || finish === "trim",
      purpose = "wall",
      tilt = 0,
    ) => parts.push({
      site: site.kind,
      finish,
      angle: civicSiteAngle(site),
      across: side * (CIVIC_FRONT_ACROSS + back),
      height: y,
      width: w,
      tall: h,
      depth: d,
      tangentOffset: side * x,
      tilt: side * tilt,
      color,
      collisionKind: solid ? `civic ${site.kind} ${purpose}` : undefined,
    });
    // Flush paving leaves the public path and exterior approach unobstructed.
    box("trim", 0, depth / 2, -0.08, width + 0.7, 0.18, depth + 0.8, "#b5b9aa", false);

    if (site.kind === "laboratory") {
      // Unequal lower wings support a broad cantilevered research pod. These
      // enclosed volumes deliberately read as a single advanced institution.
      box("body", -4.7, 3.75, 1.45, 4.3, 2.9, 6.6, "#c8d5d1");
      box("trim", -4.7, 3.75, 2.98, 4.55, 0.2, 6.85, "#8ca6a3", true, "roof");
      box("body", 4.9, 4.2, 1.85, 3.7, 3.7, 5.4, "#dce3d9");
      box("trim", 4.9, 4.2, 3.8, 3.95, 0.2, 5.65, "#8ca6a3", true, "roof");
      box("body", 0, 4.3, 2.45, 5.6, 4.9, 5.2, "#aebfbc");
      box("body", 0, 1.0, 1.55, 5.3, 3.1, 2.0, "#e3e9df");
      box("body", 0.8, 3.0, 6.0, 8.7, 2.2, 4.3, "#e6ece3", true, "research pod");
      box("trim", 0.8, 3.0, 7.2, 9.05, 0.22, 4.6, "#b1c4bf", true, "roof");
      box("glass", 0.8, 0.835, 6.0, 8.1, 1.35, 0.04);
      box("glass", -4.7, 0.425, 1.75, 3.7, 1.3, 0.08);
      box("glass", 4.9, 1.475, 2.15, 3.1, 1.5, 0.08);
      box("trim", 0.8, 0.78, 5.14, 8.8, 0.18, 0.22, "#496c73", true, "pod frame");
      box("marking", 0.8, 0.655, 5.14, 8.1, 0.045, 0.035, "#ace3dc", false);
      for (const x of [-3.05, -1.45, 0.15, 1.75, 3.35, 4.95]) {
        box("trim", x, 0.73, 6.0, 0.09, 1.8, 0.3, "#d3dfd7", true, "facade fin");
      }
      // Swept canopy blades make the entrance distinct without extra meshes.
      box("trim", -3.5, 0.1, 3.55, 4.0, 0.15, 1.3, "#c1d3cb", true, "canopy", 0.18);
      box("trim", 3.65, 0.45, 4.1, 4.1, 0.15, 1.55, "#c1d3cb", true, "canopy", -0.14);
      // Slim supports meet both the canopy blades and the wing/core below.
      box("trim", -4.8, 0.6, 3.16, 0.12, 0.32, 0.22, "#718e8a", true, "canopy bracket");
      box("trim", -2.2, 0.6, 3.41, 0.12, 0.74, 0.22, "#718e8a", true, "canopy bracket");
      box("trim", 2.0, 1.0, 3.685, 0.12, 1.29, 0.22, "#718e8a", true, "canopy bracket");
      box("trim", 5.0, 1.4, 3.85, 0.16, 0.2, 0.9, "#718e8a", true, "canopy bracket");
      box("trim", 0, -0.25, 3.18, 5.5, 0.18, 1.25, "#87aaa5", true, "portico");
      // A shut glazed vestibule, with a frame and a fine central door seam.
      box("glass", 0, -0.12, 1.4, 2.8, 2.8, 0.12, undefined, true, "closed door");
      for (const x of [-1.5, 1.5]) box("trim", x, -0.16, 1.5, 0.12, 3.0, 0.14, "#718f8a", true, "door frame");
      box("trim", 0, -0.2, 1.4, 0.045, 2.8, 0.05, "#a9c1b8", false);
      box("marking", 1.85, -0.04, 2.4, 0.36, 0.065, 0.04, "#a9e1d2", false);
      box("marking", 1.85, -0.04, 2.25, 0.2, 0.065, 0.04, "#a9e1d2", false);
      // Small roof instruments and recessed skylights complete the silhouette.
      for (const x of [-1.25, 2.8]) {
        box("trim", x, 3.0, 7.46, 2.4, 0.3, 1.9, "#76928e", true, "skylight frame");
        box("glass", x, 3.0, 7.65, 2.1, 0.08, 1.65);
      }
      for (const x of [-5.1, 5.3]) {
        const roofHeight = x < 0 ? 3.08 : 3.9;
        box("trim", x, 6.0, roofHeight + 0.4, 0.85, 0.8, 0.85, "#a7bcb2", true, "vent");
        for (let slat = 0; slat < 3; slat++) {
          box("glass", x, 5.56, roofHeight + 0.18 + slat * 0.16, 0.63, 0.065, 0.035);
        }
      }
      box("trim", 3.8, 4.55, 8.15, 0.1, 1.8, 0.1, "#c5d0c4", true, "instrument mast");
      box("trim", 3.8, 4.55, 8.85, 1.25, 0.065, 0.065, "#c5d0c4", false);
      continue;
    }

    for (const end of [-1, 1]) {
      box("body", end * (width / 2 - 0.16), depth / 2, height / 2, 0.32, height, depth, "#e4e4d8");
    }
    box("body", 0, depth - 0.16, height / 2, width, height, 0.32, "#d6ded8");
    const doorWidth = 3.1;
    const flank = (width - doorWidth) / 2;
    for (const end of [-1, 1]) {
      const x = end * (doorWidth / 2 + flank / 2);
      box("body", x, 0.08, height / 2, flank, height, 0.3, "#e9e8da");
      box("glass", x, -0.083, 2.0, flank - 0.6, 1.45, 0.05);
      box("trim", x, -0.13, 1.22, flank - 0.35, 0.1, 0.2, site.accent);
    }
    box("body", 0, 0.08, height - 0.55, doorWidth, 1.1, 0.3, "#e9e8da");
    const doorHeight = height - 1.1;
    box("glass", 0, 0.0, doorHeight / 2, doorWidth, doorHeight, 0.2, undefined, true, "closed door");
    box("trim", 0, -0.14, doorHeight / 2, 0.055, doorHeight, 0.07, "#a3b5ad", false);
    box("trim", 0, depth / 2, height + 0.06, width + 0.4, 0.22, depth + 0.4, "#a3b7b3", true, "roof");
    // Dark fascia and tall columns give these civic buildings a shared identity.
    const canopyHeight = site.kind === "civic hall" ? 3.9 : 3.25;
    box("trim", 0, -0.35, canopyHeight, width + 0.35, 0.2, 1.25, "#d2d6c4", true, "portico");
    const columnXs = site.kind === "civic hall" ? [-6.4, -4.3, -2.2, 2.2, 4.3, 6.4] : [-width * 0.4, width * 0.4];
    for (const x of columnXs) {
      box("trim", x, -0.12, canopyHeight / 2, 0.28, canopyHeight, 0.28, "#d8dacb", true, "column");
      box("trim", x, -0.12, 0.18, 0.48, 0.3, 0.48, "#a9b7ab", true, "column base");
    }
    if (site.kind === "civic hall") {
      for (let bay = -2; bay <= 2; bay++) {
        box("glass", bay * 2.35, -0.085, 4.85, 1.65, 1.0, 0.06);
        box("trim", bay * 2.35, -0.15, 5.38, 1.9, 0.12, 0.2, site.accent);
      }
      // A small abstract civic seal replaces billboard-like building names.
      box("trim", 0, -0.15, 4.67, 0.85, 0.85, 0.12, site.accent, false);
      for (const x of [-0.22, 0, 0.22]) {
        box("marking", x, -0.23, 4.69, 0.08, x === 0 ? 0.5 : 0.35, 0.04, "#f3f0d4", false);
      }
      for (const x of [-5.5, 5.5]) {
        box("trim", x, 2.3, 6.85, 0.08, 2.0, 0.08, "#c4d0c5", true, "flagpole");
        box("body", x + 0.4, 2.3, 7.3, 0.85, 0.5, 0.035, site.accent, false);
      }
    } else {
      // A rear treatment/service wing and a restrained medical emblem.
      box("body", 0, 5.75, 5.15, 7.3, 1.75, 2.3, "#d5e2da", true, "service wing");
      box("trim", 0, 5.75, 6.1, 7.65, 0.18, 2.65, "#98b6ab", true, "service roof");
      box("trim", -4.65, -0.14, 2.45, 0.75, 0.75, 0.12, "#467e73", false);
      box("marking", -4.65, -0.225, 2.45, 0.15, 0.53, 0.04, "#eff3da", false);
      box("marking", -4.65, -0.225, 2.45, 0.53, 0.15, 0.04, "#eff3da", false);
      for (const x of [-2.4, 0, 2.4]) box("glass", x, 4.57, 5.2, 1.55, 0.85, 0.06);
    }
  }
  return parts;
}
