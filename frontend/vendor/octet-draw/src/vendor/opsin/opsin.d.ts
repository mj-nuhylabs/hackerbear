// OPSIN compiled to JavaScript (tools/opsin). Resources come from globalThis.opsinResource.
export function init(): void;
export function parseToSmiles(name: string): string | null;
// The structure with each atom's locants, as JSON (tools/opsin/js OctetAtoms): {"smiles": the SMILES parseToSmiles
// gives, "atoms": [[element, charge, mass number or 0, locants joined by spaces], ...], "bonds": [[atom, atom, order],
// ...]}, hydrogens as atoms.
export function parseToAtoms(name: string): string | null;
