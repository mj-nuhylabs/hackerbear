// Home's starter drawings, for a Home with no recent drawings yet: a structure, a reaction and a catalytic cycle,
// each an Octet drawing made in Octet, with its picture. A click opens a copy as a new, untitled drawing.
import structure from "./starters/structure.json?raw";
import reaction from "./starters/reaction.json?raw";
import cycle from "./starters/cycle.json?raw";
import structurePicture from "./starters/structure.svg";
import reactionPicture from "./starters/reaction.svg";
import cyclePicture from "./starters/cycle.svg";

export type Starter = { name: string; kind: string; text: string; picture: string };
export const STARTERS: Starter[] = [
  { name: "Oseltamivir", kind: "Structure", text: structure, picture: structurePicture },
  { name: "Suzuki coupling", kind: "Reaction", text: reaction, picture: reactionPicture },
  { name: "Suzuki cycle", kind: "Catalytic cycle", text: cycle, picture: cyclePicture },
];
