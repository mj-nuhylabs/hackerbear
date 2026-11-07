# Name to Structure's dictionary

`dictionary.tsv.gz` holds common, trivial, German and trade names, CAS registry numbers and InChIKeys of chemical
compounds, each with its structure. Name to Structure reads it after OPSIN and Octet's own tables (decision 0015).
`scripts/build-dictionary.ts` builds it from Wikidata and the FDA's UNII list (Global Substance Registration System),
both read on 5 November 2026.

Wikidata's data is under CC0 1.0 (no rights reserved). The UNII list is a work of the US government and is not
copyrighted. `NOTICE.txt` names both sources.

## What goes in

- Compounds with a SMILES (P233 or P2017) and an article in one of ten Wikipedias (English, German, French,
  Japanese, Spanish, Italian, Russian, Chinese, Polish and Dutch): the compounds chemists name.
- For each: its English and German labels and aliases, the English name of each brand with it as its one active
  ingredient (P3781), its CAS numbers (P231, check digit checked) and the InChIKey of its structure. The structure is
  the isomeric SMILES where there is one, chosen to match Wikidata's InChIKey (P235).
- Names spelt with Greek letters or umlauts also go in spelt out (alpha-pinene, Essigsaeure).
- From the UNII list, after Wikidata: for each of Wikidata's compounds with the same InChIKey, UNII's CAS numbers and
  names. Then UNII's other chemicals with a CAS number and a SMILES of up to 80 characters whose InChIKey Indigo
  agrees with. UNII writes names in capitals; they go in lower case, with R, S, E, Z, D, L and N kept as capitals.
  UNII's tags ("[MI]"), CAS index names and codes are left out, and UNII names OPSIN reads are not asked of PubChem.
- A name with endo, exo, syn or anti goes in only where the structure has its stereo.

## What is left out, and how PubChem decides

- Molecular formulas (C6H6 has more than one structure), formulas with charges or subscripts, atomic numbers,
  SMILES, InChI, InChIKeys, CAS, EC and UNII numbers, and names over 80 characters.
- Names in `src/common.ts` and `src/drugs.ts` (asked first).
- Names OPSIN reads as the same compound. The compound's label stays for spelling suggestions only.
- Names OPSIN reads as a compound with other bonds: where PubChem's compound for the name has Wikidata's bonds and
  not OPSIN's, the name stays, marked to be read before OPSIN. Otherwise OPSIN keeps it, and always for a compound
  with a metal or a bare bracket atom ([B]), which OPSIN draws as Octet draws them (sec-butyllithium bonded).
- SMILES with a CXSMILES part: Name to Structure joins structures with "." for salts and lists.
- Names easily meant as something else (a code of up to eight capitals and digits, any name of up to five
  characters, an English word or its plural: "TEN", "salt", "beans"): kept only where PubChem gives the same
  compound for the name (or its salt or parent).
- A name or CAS number that two compounds share stays with the one PubChem gives for it, or with neither.

## Size and agreement (5 November 2026)

- 116,973 compounds, 214,257 names (5,032 of them read before OPSIN), 115,294 CAS numbers, an InChIKey for each, and
  names OPSIN reads kept for suggestions. 16.6 MB of text, 6.79 MB gzipped. The app loads it in slices in the
  background, about 1 s on a laptop.
- Of Wikidata's compounds, 106 had no SMILES Indigo reads and 207 had SMILES that disagree with their own InChIKey;
  those are left out. 19,572 UNII substances join Wikidata's compounds and 88,079 come in as compounds of their own
  (110 more with a SMILES Indigo reads as another InChIKey are left out).
- 9,177 names OPSIN reads as another compound; 5,045 are read from the dictionary first, where PubChem has
  Wikidata's compound. 13,936 names easily meant as something else went to PubChem; 11,044 stay. 2,655 names and 770
  CAS numbers two compounds share went to PubChem; 2,307 names and 668 CAS numbers stay with one compound.
- Check (`--check 200`): of 200 random names PubChem knows (30 more it does not know were skipped), 186 give
  PubChem's structure exactly, 4 the same compound with other stereo, 3 the same compound as a salt where the other
  has the parent (or the reverse), and 7 another structure. Of the 7, 5 are the same compound drawn as another
  tautomer or with other bonds to a metal. 2 are names with more than one meaning: "N-acetylornithine" (UNII has
  the N5 compound, PubChem the N2) and the trade name "Exxal 16".
- 250 common reagents, each by catalogue name and by CAS number: 216 names and 224 CAS numbers give PubChem's
  structure exactly (209 and 199 before UNII). Most of the rest are the same compound drawn another way
  (organolithiums, Grignards and metal complexes bonded or as ions).

## Format

UTF-8 text, gzipped. One compound a line, tab-separated: SMILES; names, `|` between, a name OPSIN misreads marked
`!`; CAS numbers, `|` between; InChIKey; names OPSIN reads, for suggestions only, `|` between.

## Rebuild

    node scripts/build-dictionary.ts <cache directory> --check 200

The cache directory (outside the repository) keeps every answer from Wikidata and PubChem, so a second run asks
neither again. A first run takes about an hour, most of it PubChem's limit of five requests a second. `--check`
compares random names with PubChem's structure for each.
