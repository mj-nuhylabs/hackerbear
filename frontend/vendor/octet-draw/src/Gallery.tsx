// Dev preview: test molecules at 200% (?gallery), or one molecule (?smiles=…). Used to check the renderer.
import { useEffect, useState } from "react";
import { parseStructure, ready, STYLE, measure } from "./chem";
import { labelTurn, render, type Mol } from "./render";

const GALLERY: [string, string][] = [
  ["Caffeine", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"],
  ["Imidazole", "c1cnc[nH]1"],
  ["L-Phenylalanine", "N[C@@H](Cc1ccccc1)C(=O)O"],
  ["Aspirin", "CC(=O)Oc1ccccc1C(=O)O"],
  ["Indole", "c1ccc2c(c1)cc[nH]2"],
  ["4-Nitrobenzonitrile", "N#Cc1ccc(cc1)[N+](=O)[O-]"],
  ["Glycine (zwitterion)", "[NH3+]CC(=O)[O-]"],
  ["Cumyl cation", "C[C+](C)c1ccccc1"],
  ["2-Bromo-4-chloro-1-(trifluoromethyl)benzene", "FC(F)(F)c1ccc(Cl)cc1Br"],
];
const ZOOM = 2;

// ?labels: written labels on benzene, on both sides (reads left to right, and reversed).
const LABELS = ["OMe", "CO2Et", "NHBoc", "CF3", "Ph", "N(Boc)2"];
function labelled(text: string): Mol {
  const ring = parseStructure("c1ccccc1C.Cc1ccccc1");
  // The two methyl carbons become the label: one on each side of its ring.
  // Move the second copy right so the two labels have room.
  return { ...ring, atoms: ring.atoms.map((a, i) => ({ ...a, ...(i === 6 || i === 7 ? { label: "C", text } : {}), location: [a.location[0] + (i >= 7 ? 3 : 0), a.location[1], 0] as [number, number, number] })) };
}

function Structure({ smiles, text }: { smiles: string; text?: string }) {
  const [mol, setMol] = useState<Mol>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    ready.then(() => setMol(text ? labelled(text) : parseStructure(smiles))).catch((e) => setError(String(e)));
  }, [smiles, text]);

  if (error) return <p>{error}</p>;
  if (!mol) return <p>Loading Indigo…</p>;

  const d = render(mol, STYLE, measure);
  const [x0, y0, x1, y1] = d.box;
  return (
    <svg viewBox={`${x0} ${y0} ${x1 - x0} ${y1 - y0}`} width={(x1 - x0) * ZOOM} height={(y1 - y0) * ZOOM} style={{ display: "block" }}>
      <path d={d.polygons.map((poly) => "M" + poly.map(([x, y]) => `${x.toFixed(3)} ${y.toFixed(3)}`).join("L") + "Z").join("")} fill="var(--ink)" />
      {d.labels.map((l, i) => (
        <text key={i} x={l.x} y={l.y} transform={labelTurn(l)} fill="var(--ink)" style={{ font: `${l.size}px var(--atom-label-font)` }}>
          {l.text}
        </text>
      ))}
    </svg>
  );
}

export default function Gallery({ smiles, labels }: { smiles?: string; labels?: boolean }) {
  const items = labels ? LABELS.map((t) => [t, ""]) : smiles ? [["", smiles]] : GALLERY;
  return (
    // data-theme="light": the canvas stays white in dark mode, for print fidelity.
    <main data-theme="light" style={{ minHeight: "100vh", background: "var(--canvas)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 32, padding: 32, boxSizing: "border-box" }}>
      {items.map(([name, s]) => (
        <figure key={name || s} style={{ margin: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Structure smiles={s} text={labels ? name : undefined} />
          {name && <figcaption className="text-caption" style={{ color: "var(--ink-muted)", maxWidth: 240, textAlign: "center" }}>{name}</figcaption>}
        </figure>
      ))}
    </main>
  );
}
