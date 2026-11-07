// The names of the bond, arrow and shape kinds, as the palette, the Actions panel, the command palette and the canvas
// for screen readers (access.ts) give them. tools.tsx draws the palette from these.
import type { BondSpec } from "./edit.ts";
import { HBOND, QUADRUPLE, type ArrowKind, type ShapeKind } from "./render.ts";

export const BONDS = {
  single: { name: "Single", spec: { type: 1 } },
  double: { name: "Double", spec: { type: 2 } },
  triple: { name: "Triple", spec: { type: 3 } },
  quadruple: { name: "Quadruple", spec: { type: QUADRUPLE } },
  bolddouble: { name: "Bold double", spec: { type: 2, display: "bold" } },
  dasheddouble: { name: "Dashed double", spec: { type: 2, display: "dashed" } },
  aromaticdouble: { name: "Aromatic double", spec: { type: 2, display: "aromatic" } },
  eitherdouble: { name: "Double either", spec: { type: 2, display: "either" } },
  wedge: { name: "Wedge", spec: { type: 1, stereo: 1 } },
  hashwedge: { name: "Hashed wedge", spec: { type: 1, stereo: 6 } },
  hollow: { name: "Hollow wedge", spec: { type: 1, display: "hollow" } },
  bold: { name: "Bold", spec: { type: 1, display: "bold" } },
  hashed: { name: "Hashed", spec: { type: 1, display: "hashed" } },
  dashed: { name: "Dashed", spec: { type: 1, display: "dashed" } },
  wavy: { name: "Wavy", spec: { type: 1, display: "wavy" } },
  dative: { name: "Dative", spec: { type: 1, display: "dative" } },
  hydrogen: { name: "Hydrogen bond", spec: { type: HBOND } },
} satisfies Record<string, { name: string; spec: BondSpec }>;
export type BondKind = keyof typeof BONDS;

export const ARROWS: Record<ArrowKind, string> = {
  reaction: "Reaction", equilibrium: "Equilibrium", resonance: "Resonance", retro: "Retrosynthetic",
  nogo: "No reaction", hash: "No reaction, hashed", dipole: "Dipole", block: "Block", curved: "Curved", fishhook: "Fishhook", double: "Double-headed", line: "Line", arc: "Arc", orbital: "Orbital", cut: "Fragmentation line", curve: "Curve",
};

export const SHAPES: Record<ShapeKind, string> = {
  box: "Box", rounded: "Rounded box", oval: "Oval", highlight: "Highlight", brackets: "Brackets", parens: "Parentheses", braces: "Braces", tlc: "TLC plate", table: "Table", picture: "Picture",
};
