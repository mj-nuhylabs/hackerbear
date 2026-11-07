# NMR shift table

`shifts.bin.gz` is Octet's table of ¹H and ¹³C chemical shifts by atom environment. It is built by
`scripts/nmr-table.ts` from the measured spectra in nmrshiftdb2's `nmrshiftdb2withsignals.sd`
(downloaded 16 October 2026 from https://sourceforge.net/projects/nmrshiftdb2/files/data/). Spectra the file marks
as predicted are left out.

Contains information from nmrshiftdb2 (www.nmrshiftdb.org), which is made available here under the
[nmrshiftdb2 Database License](https://nmrshiftdb.nmr.uni-koeln.de/nmrshiftdbhtml/nmrshiftdb2datalicense.txt).
A copy of the licence is in `LICENCE.txt`. This table is a derivative database under that licence, so it is shared
under the same licence. Octet's code is Apache-2.0 (an OSI-approved licence, as section 4.5 requires).

Format: "ONMR", version 2 and the four table sizes, then for ¹³C and then ¹H the code hashes (u32), median shifts
(i16, ppm × 100), standard deviations (u16, ppm × 100) and counts (u16), little-endian, sorted by hash. Then the same
for the solvent tables, ¹³C and ¹H: codes as measured in one of the Spectrum panel's solvents (from the file's Solvent
field), kept where their shifts there differ from those in every solvent. The ¹H solvent table is empty: on the
held-out tenth it made ¹H shifts worse. Version 1 files have no solvent tables.

Rebuild: `node scripts/nmr-table.ts <path to nmrshiftdb2withsignals.sd>`. Add `--test` to measure accuracy on one
molecule in ten held out (16 October 2026: ¹³C mean absolute error 2.27 ppm, median 0.90; ¹H 0.25 ppm, median 0.09.
18 October 2026: for ¹³C shifts measured in a known solvent, 2.12 ppm from every solvent and 2.08 with the solvent
table).

5 November 2026: codes start at level 0 (the atom alone, with ^ when it is η-bonded to a metal), so every atom gets
a shift. Atoms η-bonded to a metal (Cp and arene rings) are written one way however the molfile draws them (no
charge, the hydrogens of a ring carbon beside the metal, ~ and ^ bonds), so ferrocene's ten carbons are alike. A
¹H spectrum that gives one atom more different shifts than it has hydrogens leaves that atom out. Held-out tenth:
¹³C 2.29 ppm (36,581 shifts, 22 of them only at level 0), ¹H 0.25 ppm (13,189 shifts, 9 at level 0); the shifts
covered before give the same errors as before, within 0.001 ppm.
