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
  color?: string;
  collisionKind?: string;
}

export function civicSiteAt(lot: number, side: number): CivicSite | undefined {
  return CIVIC_SITES.find((site) => site.lot === lot && site.side === side);
}

/** Five-by-seven lettering is solid instanced geometry, with no font or texture. */
const LETTERS: Record<string, readonly string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
};

export function civicSiteAngle(site: CivicSite): number {
  return (site.lot / 72) * Math.PI * 2;
}

export const CIVIC_FRONT_ACROSS = 13.3;

/** Shared box batches handle walls, trim, glazing and signs for all landmarks. */
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
      color,
      collisionKind: solid ? `civic ${site.kind} ${purpose}` : undefined,
    });
    // The plaza is flush with the deck; no raised sill blocks the open entry.
    box("trim", 0, depth / 2, -0.08, width + 0.7, 0.18, depth + 0.8, "#b5b9aa", false);
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
    box("trim", 0, depth / 2, height + 0.06, width + 0.4, 0.22, depth + 0.4, "#a3b7b3", true, "roof");
    // Dark fascia and tall columns give these civic buildings a shared identity.
    const canopyHeight = site.kind === "civic hall" ? 3.9 : 3.25;
    box("trim", 0, -0.35, canopyHeight, width + 0.35, 0.2, 1.25, "#d2d6c4", true, "portico");
    const columnXs = site.kind === "civic hall" ? [-6.4, -4.3, -2.2, 2.2, 4.3, 6.4] : [-width * 0.4, width * 0.4];
    for (const x of columnXs) {
      box("trim", x, -0.12, canopyHeight / 2, 0.28, canopyHeight, 0.28, "#d8dacb", true, "column");
      box("trim", x, -0.12, 0.18, 0.48, 0.3, 0.48, "#a9b7ab", true, "column base");
    }
    const signHeight = site.kind === "civic hall" ? 3.26 : height - 0.43;
    const pixel = 0.064;
    const textWidth = (site.name.length * 6 - 1) * pixel;
    box("trim", 0, -0.11, signHeight, textWidth + 0.65, 0.67, 0.1, "#263e44", false);
    [...site.name].forEach((letter, index) => {
      LETTERS[letter]?.forEach((row, y) => {
        [...row].forEach((value, x) => {
          if (value === "1") box(
            "marking",
            (index * 6 + x) * pixel - textWidth / 2 + pixel / 2,
            -0.175,
            signHeight + (3 - y) * pixel,
            pixel * 0.88,
            pixel * 0.88,
            0.035,
            "#f3f0d4",
            false,
          );
        });
      });
    });

    if (site.kind === "laboratory") {
      // Broad strip skylights, extraction housings and a small sensor mast.
      for (const x of [-4.3, 0, 4.3]) {
        box("trim", x, 3.5, 4.85, 2.5, 0.35, 2.1, "#768e8b", true, "skylight frame");
        box("glass", x, 3.5, 5.06, 2.2, 0.08, 1.85);
        box("trim", x, 6, 5.12, 0.9, 0.8, 0.9, "#a9b6ad", true, "vent");
        for (let slat = 0; slat < 3; slat++) {
          box("glass", x, 5.52, 4.9 + slat * 0.16, 0.68, 0.065, 0.035);
        }
      }
      box("trim", 5.7, 5.8, 5.65, 0.1, 1.9, 0.1, "#c5d0c4", true, "instrument mast");
      box("trim", 5.7, 5.8, 6.35, 1.2, 0.065, 0.065, "#c5d0c4", false);
      for (const x of [-1, 1]) box("marking", x * 0.3, -0.185, 2.65, 0.1, 0.55, 0.04, "#a9e1d2", false);
    } else if (site.kind === "civic hall") {
      for (let bay = -2; bay <= 2; bay++) {
        box("glass", bay * 2.35, -0.085, 4.85, 1.65, 1.0, 0.06);
        box("trim", bay * 2.35, -0.15, 5.38, 1.9, 0.12, 0.2, site.accent);
      }
      // A geometric civic seal, clearly distinct from the laboratory's branding.
      box("trim", 0, -0.15, 4.67, 1.35, 1.35, 0.12, site.accent, false);
      for (const x of [-0.34, 0, 0.34]) {
        box("marking", x, -0.23, 4.69, 0.13, x === 0 ? 0.8 : 0.56, 0.04, "#f3f0d4", false);
      }
      for (const x of [-5.5, 5.5]) {
        box("trim", x, 2.3, 6.85, 0.08, 2.0, 0.08, "#c4d0c5", true, "flagpole");
        box("body", x + 0.4, 2.3, 7.3, 0.85, 0.5, 0.035, site.accent, false);
      }
    } else {
      // A rear treatment/service wing and a large non-textual medical marker.
      box("body", 0, 5.75, 5.15, 7.3, 1.75, 2.3, "#d5e2da", true, "service wing");
      box("trim", 0, 5.75, 6.1, 7.65, 0.18, 2.65, "#98b6ab", true, "service roof");
      box("trim", -4.65, -0.14, 2.45, 1.1, 1.1, 0.12, "#467e73", false);
      box("marking", -4.65, -0.225, 2.45, 0.22, 0.77, 0.04, "#eff3da", false);
      box("marking", -4.65, -0.225, 2.45, 0.77, 0.22, 0.04, "#eff3da", false);
      for (const x of [-2.4, 0, 2.4]) box("glass", x, 4.57, 5.2, 1.55, 0.85, 0.06);
    }
  }
  return parts;
}
