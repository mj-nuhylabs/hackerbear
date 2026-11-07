// What's new: each release's notes, newest first, in ASD-STE100 Simplified Technical English (brand/CLAUDE.md). The
// app shows the notes for its own version once after an update (Editor.tsx, seenNotes) and from About Octet Draw.
// docs/release-notes/<version>.md is the same text for GitHub; releases.check.ts keeps the two the same.

export type Release = { version: string; date: string; intro: string; summary?: string[]; sections: { title: string; items: string[] }[]; thanks: string };

export const RELEASES: Release[] = [
  {
    version: "1.1.1",
    date: "November 2026",
    intro: "This update fixes problems you reported and adds features you asked for.",
    summary: ["The Sequence tool draws peptides, RNA and DNA.", "Octet draws ferrocene and other metallocenes, and predicts their NMR shifts.", "Name to Structure reads 88,000 more names and starts faster.", "On a chair, new bonds are axial or equatorial.", "ChemDraw files open with their Greek letters, pictures and labels.", "On Windows and Linux, Ctrl-click and Ctrl-drag do the same as in ChemDraw."],
    sections: [
      {
        title: "New",
        items: ["Sequence tool: click on the page, then type the one-letter codes.", "Choose the ends below the codes, or type them, as in Ac-ACD-NH2 or pACGU.", "Choose Residue labels to show each residue as a label, as in H–Ala–Cys–OH.", "Structure > Expand Label and Contract Label change a residue between atoms and a label.", "Type \\delta to write δ, as in LaTeX. Text > Character Map has more symbols. The idea is from Prof. Stefan Schramm.", "Superscript (⌘= or Ctrl+=) and Subscript (⌘- or Ctrl+-) work in atom labels, for example Fe(III).", "Draw a bond from a metal to the centre of a ring, as in ferrocene.", "On a chair, the first new bond on an atom is axial. The second is equatorial.", "New templates: a stereocentre with wedge and hash bonds, and a Fischer projection.", "Convert Structure to Name reads the stereochemistry of a chair.", "Clean Up moves labels off bonds and other labels.", "Align and Distribute line up the atoms you select.", "No-go, dipole and equilibrium arrows have more head styles.", "Right-click an arrow, a catalytic cycle or an atom label to change it.", "Scroll bars, middle-button drag and Shift-scroll move the view.", "Centre in Window (⌥⌘/ or Alt+Ctrl+/) is in the View menu and the Actions panel.", "Experiment pages have Reaction scheme and Procedure boxes, roman numerals and one reagent on each row.", "On Home, select many drawings to discard them or move them to a folder."],
      },
      {
        title: "NMR",
        items: ["Octet predicts ¹H and ¹³C shifts for ferrocene, (benzene)Cr(CO)₃ and similar complexes.", "Octet predicts a shift for every atom. It marks less accurate shifts as Rough.", "Spectra on the page have the same splitting as the Spectrum panel.", "Choose Labels > Auto, Horizontal or Vertical. Label lines do not cross.", "You can edit all the text of a spectrum. Drag a handle to change its size.", "Shift numbers beside atoms do not touch bonds or labels.", "Shift numbers in ChemDraw files open."],
      },
      {
        title: "Name to Structure",
        items: ["It reads 88,000 more names and CAS numbers from the FDA UNII list. Try 129-64-6.", "It starts faster and uses less memory.", "It reads endo, exo, syn and anti.", "It draws crowded natural products, such as aconitine, with no warnings."],
      },
      {
        title: "ChemDraw and Word",
        items: ["Greek letters in ChemDraw files, such as hν, open correctly.", "Pictures in ChemDraw files from Windows open.", "Accented letters and ° are correct in other programs.", "Copy and Export send ChemDraw only what you select.", "Octet saves subscripts in conditions, such as Pd(PPh₃)₄.", "Labels in MOL files, such as OMe, open as labels.", "On Windows, labels in pictures you paste into Word are text.", "Copied pictures have less empty space around the drawing.", "Octet shows a message when it cannot read the clipboard.", "Octet shows a message when ChemDraw removed Octet data from a file."],
      },
      {
        title: "Windows and Linux",
        items: ["Ctrl-click adds to the selection. Ctrl-drag copies it, as in ChemDraw.", "Home opens again when you close a drawing.", "On Windows, the menu bar stays when you close another window.", "On Linux, structures paste into Inkscape at the correct size.", "On Linux, tips use less graphics power."],
      },
      {
        title: "Fixes",
        items: ["The 1.0 selection colour is back. Change it in Settings > General > Selection.", "The Properties panel marks predicted values, such as boiling point and logP. So do Copy and Add to drawing.", "File > New always opens a new drawing.", "On the Mac, Octet opens again after an update.", "Labels such as N(CH3)2, CH2N3, SO2Me and CONHMe give the correct structure.", "ODMT changes to DMTO when its bond is on the right.", "Azide, diazo, isocyanate and sulfone templates have the correct bonds.", "Bold and wedge bonds on chair and Haworth rings do not cause stereo warnings.", "Catalytic cycle names do not overlap. Long names wrap.", "In conditions, Pd(0)L₂ shows its subscript.", "The reagent table does not include N₂, Ar and air.", "In a wide reaction, the starting materials stay beside their arrow.", "Clean Up gives the same result each time.", "All nucleobase templates face the same way.", "Add to drawing puts items in an empty area.", "Settings > Document > Page edges has All sizes, Page only and None.", "All sections of the Actions panel open and close in the same way.", "On experiment pages, the pointer is a text cursor over the details.", "The Template button shows a books icon for large templates.", "In ChemDraw files, Ac and Pr labels open as acetyl and propyl.", "Expand Label works on a contracted label after you open the .oct file again.", "A drawing with a shadowed box exports, copies and prints at the correct size."],
      },
    ],
    thanks: "Thank you to Prof. Stefan Schramm, michemistry, Raggi-X, SquiddyEye and BAWE-beep for your reports and ideas on GitHub. To report a problem, choose Help > Report a Problem.",
  },
  {
    version: "1.1.0",
    date: "4 November 2026",
    intro: "Thank you to everyone who reported a problem or sent an idea. Your feedback made this release.",
    sections: [
      {
        title: "New",
        items: [
          "Experiment page. Go to File > New For > Experiment. It has the experiment details, a reagent table and a procedure.",
          "The reagent table calculates the mass, moles, equivalents and yield from your reaction.",
          "In a procedure, type *italic* or **bold**. LaTeX such as \\textit{}, $^2$ and $_2$ also works.",
          "Home has an Experiments list. You can search it, sort it and export it as CSV.",
          "Catalytic cycles: choose Side arrow in the cycle tool and click a step. Then choose Reagent or Product.",
          "Catalytic cycles: one side arrow can bring a reagent in and take a product out. A step can be reversible.",
          "Catalytic cycles: drag the end of an arc to set the space before or after an intermediate.",
          "Drag a charge, radical or lone pair to move it round its atom.",
          "A lone pair on a carbon with two bonds makes a carbene. Click a radical again to make a triplet.",
          "To hide a chemical warning, right-click its red circle and choose Hide this warning.",
          "Settings > General: choose the colour of the cursor and of the selection.",
          "Settings > Document > Page edges: show the page with its guides (such as journal columns), the page only, or none.",
          "Export: type a resolution up to 2400 dpi, or a size in pixels. You can also set the page colour as the background and the JPEG quality.",
          "Pictures from Octet (PDF, PNG and EMF) keep the drawing. Paste or drop one back into Octet to edit it.",
          "You can set a key for the hollow wedge and the dative bond in Settings > Keyboard shortcuts.",
        ],
      },
      {
        title: "Drawing windows",
        items: [
          "Your first drawing opens in the first window. Each drawing after that opens in a new window.",
          "A menu command now changes only the window in front. Before, it also changed the other open windows.",
        ],
      },
      {
        title: "Fixes",
        items: [
          "Copy into Word copies only the selection (#13). Export also exports only the selection (#8).",
          "Atom labels show when you paste into Word on Windows (#16).",
          "Press W over a wedge, or H over a hashed wedge, to turn it round, as in ChemDraw (#10).",
          "Clean Up keeps cycloalkynes as regular rings (#11).",
          "Name to Structure draws large molecules such as Taxol and strychnine with no warnings (#9).",
          "Delete removes only what you select. Text that belongs to an arrow or a structure stays (#12).",
          "The cursor shows on all backgrounds (#14).",
          "Chairs have the same angles as in ChemDraw. Two joined chairs keep all their atoms (#3).",
          "On Linux, the menu bar shows in each new window (#4).",
          "The cyclopentadienyl ligand (J key) shows its front and back edges correctly, also after you move it (#6).",
          "Hashed wedges have the same spacing as in ChemDraw. They have no extra line where they meet another bond (#7).",
          "Colour by element now colours B and Si. Br and I have colours of their own.",
          "The bead of a polymer bracket shows in front of its bond.",
          "A stacked NH label has the same space between N and H as in ChemDraw.",
          "Save, recent drawings, recovery and undo are more reliable. Octet asks before it saves over a file that another app changed (#2).",
        ],
      },
    ],
    thanks:
      "Special thanks to Prof-Dr-Stefan-Schramm, thewizardblizzard, mthaynes, Ciolkon, TomsLabYT, michemistry, jogisv23-cloud, Ameyanagi, FlamingLasrSwrd and kevinweil, and to all who wrote to us by email and on Reddit. To tell us more, use Help > Report a Problem.",
  },
];

export const notesFor = (version: string) => RELEASES.find((r) => r.version === version);
