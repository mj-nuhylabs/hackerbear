// Names chemists use that OPSIN does not read: abbreviations, formulas and trade names of common solvents,
// reagents, ligands and photocatalysts. Each maps to a systematic name that OPSIN reads (checked by
// tools/opsin/check.mjs), to SMILES ("smiles:...") where OPSIN cannot give the structure (TEMPO's radical), or to
// another entry ("=Pd(PPh3)4").
// Keys match without regard to case, spaces or hyphens. Where several keys give one structure, the first one listed
// is the one Octet cites for it (citable, at the end): Et3N before TEA, acacH before acac.
import { ELEMENTS } from "./labels.ts";

// Drugs and natural products OPSIN has no trivial name for. Stereocentres are given as in each one's IUPAC name. They
// are names, not abbreviations: Octet does not cite them after a name.
const DRUG_NAMES: Record<string, string> = {
  aspirin: "2-acetyloxybenzoic acid", acetaminophen: "N-(4-hydroxyphenyl)acetamide", naproxen: "(2S)-2-(6-methoxynaphthalen-2-yl)propanoic acid",
  diclofenac: "2-[2-(2,6-dichloroanilino)phenyl]acetic acid",
  testosterone: "(8R,9S,10R,13S,14S,17S)-17-hydroxy-10,13-dimethyl-1,2,6,7,8,9,11,12,14,15,16,17-dodecahydrocyclopenta[a]phenanthren-3-one",
  estradiol: "(8R,9S,13S,14S,17S)-13-methyl-6,7,8,9,11,12,14,15,16,17-decahydrocyclopenta[a]phenanthrene-3,17-diol",
  serotonin: "3-(2-aminoethyl)-1H-indol-5-ol", epinephrine: "4-[(1R)-1-hydroxy-2-(methylamino)ethyl]benzene-1,2-diol",
  melatonin: "N-[2-(5-methoxy-1H-indol-3-yl)ethyl]acetamide", capsaicin: "(6E)-N-[(4-hydroxy-3-methoxyphenyl)methyl]-8-methylnon-6-enamide",
  quinine: "(R)-(6-methoxyquinolin-4-yl)[(2S,4S,5R)-5-ethenyl-1-azabicyclo[2.2.2]octan-2-yl]methanol",
  cocaine: "methyl (1R,2R,3S,5S)-3-(benzoyloxy)-8-methyl-8-azabicyclo[3.2.1]octane-2-carboxylate",
  lidocaine: "2-(diethylamino)-N-(2,6-dimethylphenyl)acetamide", benzocaine: "ethyl 4-aminobenzoate", warfarin: "4-hydroxy-3-(3-oxo-1-phenylbutyl)-2H-chromen-2-one",
  metformin: "smiles:CN(C)C(=N)NC(N)=N", sildenafil: "smiles:CCCC1=NN(C)C2=C1N=C(NC2=O)C1=CC(=CC=C1OCC)S(=O)(=O)N1CCN(C)CC1",
  atorvastatin: "(3R,5R)-7-[2-(4-fluorophenyl)-3-phenyl-4-(phenylcarbamoyl)-5-(propan-2-yl)-1H-pyrrol-1-yl]-3,5-dihydroxyheptanoic acid",
  omeprazole: "6-methoxy-2-[(4-methoxy-3,5-dimethylpyridin-2-yl)methanesulfinyl]-1H-benzimidazole",
  fluoxetine: "N-methyl-3-phenyl-3-[4-(trifluoromethyl)phenoxy]propan-1-amine", diazepam: "7-chloro-1-methyl-5-phenyl-1,3-dihydro-2H-1,4-benzodiazepin-2-one",
  thalidomide: "2-(2,6-dioxopiperidin-3-yl)isoindole-1,3-dione", sucrose: "beta-D-fructofuranosyl alpha-D-glucopyranoside",
  limonene: "1-methyl-4-(prop-1-en-2-yl)cyclohex-1-ene", carvone: "2-methyl-5-(prop-1-en-2-yl)cyclohex-2-en-1-one",
  "penicillin G": "(2S,5R,6R)-3,3-dimethyl-7-oxo-6-[(2-phenylacetyl)amino]-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
  amoxicillin: "(2S,5R,6R)-6-[[(2R)-2-amino-2-(4-hydroxyphenyl)acetyl]amino]-3,3-dimethyl-7-oxo-4-thia-1-azabicyclo[3.2.0]heptane-2-carboxylic acid",
};

export const COMMON: Record<string, string> = {
  // Solvents
  THF: "oxolane", "2-MeTHF": "2-methyloxolane", DCM: "dichloromethane", CH2Cl2: "dichloromethane", CHCl3: "trichloromethane",
  DCE: "1,2-dichloroethane", DMF: "N,N-dimethylformamide", DMAc: "N,N-dimethylacetamide", DMSO: "dimethyl sulfoxide",
  MeCN: "acetonitrile", ACN: "acetonitrile", EtOAc: "ethyl acetate", Et2O: "ethoxyethane", MTBE: "2-methoxy-2-methylpropane",
  MeOH: "methanol", EtOH: "ethanol", iPrOH: "propan-2-ol", IPA: "propan-2-ol", nBuOH: "butan-1-ol", tBuOH: "2-methylpropan-2-ol",
  TFE: "2,2,2-trifluoroethanol", HFIP: "1,1,1,3,3,3-hexafluoropropan-2-ol", DME: "1,2-dimethoxyethane", NMP: "1-methylpyrrolidin-2-one",
  HMPA: "N,N,N',N',N'',N''-hexamethylphosphoric triamide", AcOH: "acetic acid", HOAc: "acetic acid", PhMe: "toluene",
  // Bases, acids and reagents
  DMAP: "N,N-dimethylpyridin-4-amine", DBU: "2,3,4,6,7,8,9,10-octahydropyrimido[1,2-a]azepine",
  DBN: "2,3,4,6,7,8-hexahydropyrrolo[1,2-a]pyrimidine", DABCO: "1,4-diazabicyclo[2.2.2]octane",
  Et3N: "N,N-diethylethanamine", TEA: "N,N-diethylethanamine", DIPEA: "N-ethyl-N-(propan-2-yl)propan-2-amine",
  DIEA: "N-ethyl-N-(propan-2-yl)propan-2-amine", iPr2NEt: "N-ethyl-N-(propan-2-yl)propan-2-amine",
  TMEDA: "N,N,N',N'-tetramethylethane-1,2-diamine", TEMPO: "smiles:CC1(C)CCCC(C)(C)N1[O]",
  TFA: "trifluoroacetic acid", TFAA: "trifluoroacetic anhydride", TfOH: "trifluoromethanesulfonic acid",
  Tf2O: "trifluoromethanesulfonic anhydride", TsOH: "4-methylbenzenesulfonic acid", pTsOH: "4-methylbenzenesulfonic acid",
  TsCl: "4-methylbenzenesulfonyl chloride", MsCl: "methanesulfonyl chloride", Ac2O: "acetic anhydride", AcCl: "acetyl chloride",
  Boc2O: "di-tert-butyl dicarbonate", NBS: "1-bromopyrrolidine-2,5-dione", NCS: "1-chloropyrrolidine-2,5-dione",
  NIS: "1-iodopyrrolidine-2,5-dione", NHS: "1-hydroxypyrrolidine-2,5-dione", mCPBA: "3-chlorobenzenecarboperoxoic acid",
  DCC: "N,N'-dicyclohexylmethanediimine", DIC: "N,N'-di(propan-2-yl)methanediimine",
  EDC: "3-(ethyliminomethylideneamino)-N,N-dimethylpropan-1-amine", CDI: "di(imidazol-1-yl)methanone", HOBt: "1H-benzotriazol-1-ol",
  DEAD: "diethyl diazene-1,2-dicarboxylate", DIAD: "dipropan-2-yl diazene-1,2-dicarboxylate", PPh3: "triphenylphosphane",
  TPPO: "triphenylphosphine oxide", TBAF: "tetrabutylammonium fluoride", TBAB: "tetrabutylammonium bromide", TBAI: "tetrabutylammonium iodide",
  TMSCl: "chloro(trimethyl)silane", TBSCl: "tert-butyl(chloro)dimethylsilane", TBDMSCl: "tert-butyl(chloro)dimethylsilane",
  TMSOTf: "trimethylsilyl trifluoromethanesulfonate", LDA: "lithium di(propan-2-yl)azanide", LiHMDS: "lithium bis(trimethylsilyl)azanide",
  NaHMDS: "sodium bis(trimethylsilyl)azanide", KHMDS: "potassium bis(trimethylsilyl)azanide", nBuLi: "butyllithium",
  tBuLi: "tert-butyllithium", sBuLi: "sec-butyllithium", DIBAL: "diisobutylaluminium hydride", "DIBAL-H": "diisobutylaluminium hydride",
  LiAlH4: "lithium aluminium hydride", LAH: "lithium aluminium hydride", NaBH4: "sodium borohydride", NaBH3CN: "sodium cyanoborohydride",
  STAB: "sodium triacetoxyborohydride", DDQ: "4,5-dichloro-3,6-dioxocyclohexa-1,4-diene-1,2-dicarbonitrile",
  HBpin: "4,4,5,5-tetramethyl-1,3,2-dioxaborolane", B2pin2: "4,4,4',4',5,5,5',5'-octamethyl-2,2'-bi(1,3,2-dioxaborolane)",
  "Hantzsch ester": "diethyl 2,6-dimethyl-1,4-dihydropyridine-3,5-dicarboxylate", Tris: "2-amino-2-(hydroxymethyl)propane-1,3-diol",
  "tris(hydroxymethyl)aminomethane": "2-amino-2-(hydroxymethyl)propane-1,3-diol",
  HEPES: "2-[4-(2-hydroxyethyl)piperazin-1-yl]ethanesulfonic acid", DTT: "1,4-bis(sulfanyl)butane-2,3-diol",
  "Et3N·HCl": "smiles:CC[NH+](CC)CC.[Cl-]", MeMgBr: "smiles:C[Mg]Br", EtMgBr: "smiles:CC[Mg]Br",
  PhMgBr: "smiles:Br[Mg]c1ccccc1", iPrMgCl: "smiles:CC(C)[Mg]Cl", MeLi: "smiles:[Li]C", PhLi: "smiles:[Li]c1ccccc1",
  LiTMP: "smiles:[Li+].CC1(C)CCCC(C)(C)[N-]1", KOtBu: "smiles:[K+].CC(C)(C)[O-]", NaOtBu: "smiles:[Na+].CC(C)(C)[O-]",
  NaOMe: "smiles:[Na+].C[O-]", NaOEt: "smiles:[Na+].CC[O-]", NaOAc: "smiles:[Na+].CC([O-])=O", KOAc: "smiles:[K+].CC([O-])=O",
  NH4OAc: "smiles:[NH4+].CC([O-])=O", TMSCN: "smiles:C[Si](C)(C)C#N", TMSCHN2: "smiles:C[Si](C)(C)C=[N+]=[N-]", CH2N2: "smiles:C=[N+]=[N-]",
  Et3SiH: "smiles:CC[SiH](CC)CC", Bu3SnH: "smiles:CCCC[SnH](CCCC)CCCC", AIBN: "smiles:CC(C)(C#N)N=NC(C)(C)C#N", BPO: "dibenzoyl peroxide",
  DAST: "smiles:CCN(CC)S(F)(F)F", "Burgess reagent": "smiles:COC(=O)[N-]S(=O)(=O)[N+](CC)(CC)CC",
  "Lawesson's reagent": "smiles:COc1ccc(cc1)P1(=S)SP(=S)(S1)c1ccc(OC)cc1",
  PCC: "smiles:c1cc[nH+]cc1.[O-][Cr](Cl)(=O)=O", PDC: "smiles:c1cc[nH+]cc1.c1cc[nH+]cc1.[O-][Cr](=O)(=O)O[Cr]([O-])(=O)=O",
  DMP: "smiles:CC(=O)OI1(OC(C)=O)(OC(C)=O)OC(=O)c2ccccc12", "Dess-Martin periodinane": "smiles:CC(=O)OI1(OC(C)=O)(OC(C)=O)OC(=O)c2ccccc12",
  IBX: "smiles:OI1(=O)OC(=O)c2ccccc12", TPAP: "smiles:CCC[N+](CCC)(CCC)CCC.[O-][Ru](=O)(=O)=O", NMO: "smiles:C[N+]1([O-])CCOCC1",
  HATU: "smiles:CN(C)C(=[N+](C)C)N1N=[N+]([O-])C2=C1C=CC=N2.F[P-](F)(F)(F)(F)F",
  HBTU: "smiles:CN(C)C(=[N+](C)C)ON1N=NC2=CC=CC=C21.F[P-](F)(F)(F)(F)F",
  TBTU: "smiles:CN(C)C(=[N+](C)C)ON1N=NC2=CC=CC=C21.F[B-](F)(F)F",
  PyBOP: "smiles:C1CCN(C1)[P+](N1CCCC1)(N1CCCC1)ON1N=NC2=CC=CC=C21.F[P-](F)(F)(F)(F)F", HOAt: "smiles:ON1N=NC2=C1N=CC=C2",
  T3P: "smiles:CCCP1(=O)OP(=O)(CCC)OP(=O)(CCC)O1", EDCI: "3-(ethyliminomethylideneamino)-N,N-dimethylpropan-1-amine",
  TBDPSCl: "smiles:CC(C)(C)[Si](Cl)(c1ccccc1)c1ccccc1", TIPSCl: "smiles:CC(C)[Si](Cl)(C(C)C)C(C)C", TESCl: "smiles:CC[Si](Cl)(CC)CC",
  TBSOTf: "smiles:CC(C)(C)[Si](C)(C)OS(=O)(=O)C(F)(F)F", TIPSOTf: "smiles:CC(C)[Si](OS(=O)(=O)C(F)(F)F)(C(C)C)C(C)C",
  "Fmoc-Cl": "smiles:ClC(=O)OCC1c2ccccc2-c2ccccc12", "Cbz-Cl": "benzyl carbonochloridate", BnBr: "(bromomethyl)benzene",
  BnCl: "(chloromethyl)benzene", MOMCl: "chloro(methoxy)methane", SEMCl: "smiles:C[Si](C)(C)CCOCCl",
  MeI: "iodomethane", CH3I: "iodomethane", EtI: "iodoethane", EtBr: "bromoethane", Me2SO4: "dimethyl sulfate",
  MeOTf: "methyl trifluoromethanesulfonate", CCl4: "tetrachloromethane", CBr4: "tetrabromomethane", CHBr3: "tribromomethane",
  SiCl4: "tetrachlorosilane",
  "proton sponge": "N1,N1,N8,N8-tetramethylnaphthalene-1,8-diamine", NMI: "1-methyl-1H-imidazole", NMM: "4-methylmorpholine",
  "2,6-lutidine": "2,6-dimethylpyridine", collidine: "2,4,6-trimethylpyridine",
  // Oxidants, radical initiators and traps, and halogenating and azide reagents. DTBP is di-tert-butyl peroxide and DCP
  // dicumyl peroxide, as radical chemists use them; Ns is the 2-nitro group (Fukuyama's), pNs the 4-nitro one.
  TBHP: "2-methylpropane-2-peroxol", DTBP: "di-tert-butyl peroxide", DCP: "bis(2-phenylpropan-2-yl) peroxide",
  BHT: "2,6-di-tert-butyl-4-methylphenol", NHPI: "2-hydroxy-1H-isoindole-1,3(2H)-dione", TBN: "tert-butyl nitrite", tBuONO: "=TBN",
  PIDA: "smiles:CC(=O)OI(OC(C)=O)c1ccccc1", "PhI(OAc)2": "=PIDA", BAIB: "=PIDA",
  PIFA: "smiles:FC(F)(F)C(=O)OI(OC(=O)C(F)(F)F)c1ccccc1", "PhI(OCOCF3)2": "=PIFA", "PhI(TFA)2": "=PIFA",
  TCCA: "1,3,5-trichloro-1,3,5-triazinane-2,4,6-trione", DCDMH: "1,3-dichloro-5,5-dimethylimidazolidine-2,4-dione",
  DBDMH: "1,3-dibromo-5,5-dimethylimidazolidine-2,4-dione", NFSI: "N-(benzenesulfonyl)-N-fluorobenzenesulfonamide",
  TMSN3: "smiles:C[Si](C)(C)N=[N+]=[N-]", TsN3: "4-methylbenzenesulfonyl azide", TfN3: "trifluoromethanesulfonyl azide",
  TsNH2: "4-methylbenzenesulfonamide", TsNHNH2: "4-methylbenzenesulfonohydrazide", NsCl: "2-nitrobenzenesulfonyl chloride",
  oNsCl: "=NsCl", pNsCl: "4-nitrobenzenesulfonyl chloride",
  // Inorganic acids, bases, salts and elements, by formula. A formula that is also SMILES ("CO", "NO") is left out.
  HCl: "smiles:Cl", HBr: "smiles:Br", HI: "smiles:I", HF: "smiles:F", H2SO4: "smiles:OS(=O)(=O)O", HNO3: "smiles:O[N+]([O-])=O",
  H3PO4: "smiles:OP(O)(O)=O", H2O: "smiles:O", H2O2: "smiles:OO", NH3: "smiles:N", D2O: "smiles:[2H]O[2H]",
  CDCl3: "smiles:[2H]C(Cl)(Cl)Cl", "DMSO-d6": "smiles:[2H]C([2H])([2H])S(=O)C([2H])([2H])[2H]", CD3OD: "smiles:[2H]OC([2H])([2H])[2H]",
  C6D6: "smiles:[2H]c1c([2H])c([2H])c([2H])c([2H])c1[2H]", CD3CN: "smiles:[2H]C([2H])([2H])C#N",
  NaOH: "smiles:[Na+].[OH-]", KOH: "smiles:[K+].[OH-]", LiOH: "smiles:[Li+].[OH-]", NaH: "smiles:[Na+].[H-]", KH: "smiles:[K+].[H-]",
  CaH2: "smiles:[Ca+2].[H-].[H-]", NaNH2: "smiles:[Na+].[NH2-]",
  K2CO3: "smiles:[K+].[K+].[O-]C([O-])=O", Na2CO3: "smiles:[Na+].[Na+].[O-]C([O-])=O", Cs2CO3: "smiles:[Cs+].[Cs+].[O-]C([O-])=O",
  NaHCO3: "smiles:[Na+].OC([O-])=O", KHCO3: "smiles:[K+].OC([O-])=O", K3PO4: "smiles:[K+].[K+].[K+].[O-]P([O-])([O-])=O",
  Na2SO4: "smiles:[Na+].[Na+].[O-]S([O-])(=O)=O", MgSO4: "smiles:[Mg+2].[O-]S([O-])(=O)=O",
  NaCl: "smiles:[Na+].[Cl-]", KCl: "smiles:[K+].[Cl-]", LiCl: "smiles:[Li+].[Cl-]", NH4Cl: "smiles:[NH4+].[Cl-]", CaCl2: "smiles:[Ca+2].[Cl-].[Cl-]",
  NaBr: "smiles:[Na+].[Br-]", KBr: "smiles:[K+].[Br-]", LiBr: "smiles:[Li+].[Br-]", NaI: "smiles:[Na+].[I-]", KI: "smiles:[K+].[I-]",
  KF: "smiles:[K+].[F-]", CsF: "smiles:[Cs+].[F-]", NaN3: "smiles:[Na+].[N-]=[N+]=[N-]", NaNO2: "smiles:[Na+].[O-]N=O",
  NaCN: "smiles:[Na+].[C-]#N", KCN: "smiles:[K+].[C-]#N", NaOCl: "smiles:[Na+].[O-]Cl", NaIO4: "smiles:[Na+].[O-]I(=O)(=O)=O",
  KMnO4: "smiles:[K+].[O-][Mn](=O)(=O)=O", Na2S2O3: "smiles:[Na+].[Na+].[O-]S([O-])(=O)=S", NaHSO3: "smiles:[Na+].OS([O-])=O",
  SOCl2: "smiles:O=S(Cl)Cl", SO2Cl2: "smiles:O=S(=O)(Cl)Cl", POCl3: "smiles:O=P(Cl)(Cl)Cl", PCl3: "smiles:ClP(Cl)Cl",
  PCl5: "smiles:ClP(Cl)(Cl)(Cl)Cl", PBr3: "smiles:BrP(Br)Br", "(COCl)2": "oxalyl dichloride", BBr3: "smiles:BrB(Br)Br", BF3: "smiles:FB(F)F",
  "BF3·OEt2": "smiles:FB(F)F.CCOCC", AlCl3: "smiles:Cl[Al](Cl)Cl", FeCl3: "smiles:Cl[Fe](Cl)Cl", TiCl4: "smiles:Cl[Ti](Cl)(Cl)Cl",
  ZnCl2: "smiles:Cl[Zn]Cl", SnCl2: "smiles:Cl[Sn]Cl", SnCl4: "smiles:Cl[Sn](Cl)(Cl)Cl", CuI: "smiles:[Cu]I", CuBr: "smiles:[Cu]Br",
  CuCl: "smiles:[Cu]Cl", CuCN: "smiles:[Cu+].[C-]#N", CuSO4: "smiles:[Cu+2].[O-]S([O-])(=O)=O", "Cu(OAc)2": "smiles:CC(=O)O[Cu]OC(C)=O",
  "Cu(OTf)2": "smiles:FC(F)(F)S(=O)(=O)O[Cu]OS(=O)(=O)C(F)(F)F", AgNO3: "smiles:[Ag+].[O-][N+]([O-])=O", Ag2O: "smiles:[Ag]O[Ag]",
  Ag2CO3: "smiles:[Ag+].[Ag+].[O-]C([O-])=O", OsO4: "smiles:O=[Os](=O)(=O)=O", CrO3: "smiles:O=[Cr](=O)=O", MnO2: "smiles:O=[Mn]=O",
  SeO2: "smiles:O=[Se]=O", I2: "smiles:II", Br2: "smiles:BrBr", Cl2: "smiles:ClCl", H2: "smiles:[HH]", O2: "smiles:O=O", N2: "smiles:N#N",
  O3: "smiles:[O-][O+]=O", CO2: "smiles:O=C=O", SO2: "smiles:O=S=O", SO3: "smiles:O=S(=O)=O", CS2: "smiles:S=C=S",
  N2O: "smiles:[N-]=[N+]=O", COCl2: "smiles:O=C(Cl)Cl", BCl3: "smiles:ClB(Cl)Cl", SF6: "smiles:FS(F)(F)(F)(F)F",
  // Metal catalysts, with the bonds to the metal drawn
  "Pd(PPh3)4": "smiles:[Pd](P(c1ccccc1)(c1ccccc1)c1ccccc1)(P(c1ccccc1)(c1ccccc1)c1ccccc1)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1",
  "Pd(OAc)2": "smiles:CC(=O)O[Pd]OC(C)=O", PdCl2: "smiles:Cl[Pd]Cl",
  "PdCl2(PPh3)2": "smiles:Cl[Pd](Cl)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1",
  "Pd(PPh3)2Cl2": "smiles:Cl[Pd](Cl)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1",
  "Pd2(dba)3": "smiles:[Pd].[Pd].O=C(/C=C/c1ccccc1)/C=C/c1ccccc1.O=C(/C=C/c1ccccc1)/C=C/c1ccccc1.O=C(/C=C/c1ccccc1)/C=C/c1ccccc1",
  "Pd(dba)2": "smiles:[Pd].O=C(/C=C/c1ccccc1)/C=C/c1ccccc1.O=C(/C=C/c1ccccc1)/C=C/c1ccccc1",
  "Ni(cod)2": "smiles:[Ni].C1/C=C\\CC/C=C\\C1.C1/C=C\\CC/C=C\\C1",
  "Grubbs catalyst": "smiles:Cl[Ru](Cl)(=Cc1ccccc1)(P(C1CCCCC1)(C1CCCCC1)C1CCCCC1)P(C1CCCCC1)(C1CCCCC1)C1CCCCC1",
  "Grubbs I": "smiles:Cl[Ru](Cl)(=Cc1ccccc1)(P(C1CCCCC1)(C1CCCCC1)C1CCCCC1)P(C1CCCCC1)(C1CCCCC1)C1CCCCC1",
  "Grubbs II": "smiles:Cc1cc(C)c(c(C)c1)N1CCN(C1=[Ru](Cl)(Cl)(=Cc1ccccc1)P(C1CCCCC1)(C1CCCCC1)C1CCCCC1)c1c(C)cc(C)cc1C",
  "Hoveyda-Grubbs II": "smiles:CC(C)Oc1ccccc1C=[Ru](Cl)(Cl)=C1N(CCN1c1c(C)cc(C)cc1C)c1c(C)cc(C)cc1C",
  "tetrakis(triphenylphosphine)palladium(0)": "=Pd(PPh3)4", "bis(triphenylphosphine)palladium(II) dichloride": "=PdCl2(PPh3)2",
  "tris(dibenzylideneacetone)dipalladium(0)": "=Pd2(dba)3", "bis(dibenzylideneacetone)palladium(0)": "=Pd(dba)2",
  "bis(cycloocta-1,5-diene)nickel(0)": "=Ni(cod)2",
  "Wilkinson's catalyst": "smiles:Cl[Rh](P(c1ccccc1)(c1ccccc1)c1ccccc1)(P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1",
  "Pd(dppf)Cl2": "smiles:Cl[Pd]1(Cl)P(C2=CC=CC=C2)(C2=CC=CC=C2)[C-]2C=CC=C2.[C-]2(C=CC=C2)P1(C1=CC=CC=C1)C1=CC=CC=C1.[Fe+2]",
  "PdCl2(dppf)": "=Pd(dppf)Cl2", "Pd(PtBu3)2": "smiles:CC(C)(C)P(C(C)(C)C)(C(C)(C)C)[Pd]P(C(C)(C)C)(C(C)(C)C)C(C)(C)C",
  "Pd(P(tBu)3)2": "=Pd(PtBu3)2",
  // Rhodium(II) carboxylates as paddlewheels: each carboxylate O bonded to one Rh, and the Rh-Rh bond.
  "Rh2(OAc)4": "smiles:[Rh]%10%13%14(OC(C)=O%11)OC(C)=O%12.[Rh]%10%11%12(OC(C)=O%13)OC(C)=O%14",
  "Rh2(TFA)4": "smiles:[Rh]%10%13%14(OC(=O%11)C(F)(F)F)OC(=O%12)C(F)(F)F.[Rh]%10%11%12(OC(=O%13)C(F)(F)F)OC(=O%14)C(F)(F)F",
  "Rh2(oct)4": "smiles:[Rh]%10%13%14(OC(=O%11)CCCCCCC)OC(=O%12)CCCCCCC.[Rh]%10%11%12(OC(=O%13)CCCCCCC)OC(=O%14)CCCCCCC",
  "Rh2(piv)4": "smiles:[Rh]%10%13%14(OC(=O%11)C(C)(C)C)OC(=O%12)C(C)(C)C.[Rh]%10%11%12(OC(=O%13)C(C)(C)C)OC(=O%14)C(C)(C)C",
  "Rh2(OPiv)4": "=Rh2(piv)4",
  "Rh2(esp)2": "smiles:[Rh]%10%11%12%13%14.[Rh]%10%15%16%17%18.O%11C(=O%15)C(C)(C)Cc1cccc(c1)CC(C)(C)C(O%16)=O%12.O%13C(=O%17)C(C)(C)Cc1cccc(c1)CC(C)(C)C(O%18)=O%14",
  // Alkene and Cp* complexes. The cyclooctadienes stand apart from the metal, as in Ni(cod)2; Cp* is drawn as its anion
  // beside the metal (OPSIN draws ferrocene so), and each bridging Cl is bonded to both metal atoms.
  "[Rh(cod)Cl]2": "smiles:Cl1[Rh]Cl[Rh]1.C1/C=C\\CC/C=C\\C1.C1/C=C\\CC/C=C\\C1",
  "[Ir(cod)Cl]2": "smiles:Cl1[Ir]Cl[Ir]1.C1/C=C\\CC/C=C\\C1.C1/C=C\\CC/C=C\\C1",
  "[Cp*RhCl2]2": "smiles:C[C-]1C(C)=C(C)C(C)=C1C.C[C-]1C(C)=C(C)C(C)=C1C.Cl[Rh+]1Cl[Rh+](Cl)Cl1",
  "[Cp*IrCl2]2": "smiles:C[C-]1C(C)=C(C)C(C)=C1C.C[C-]1C(C)=C(C)C(C)=C1C.Cl[Ir+]1Cl[Ir+](Cl)Cl1",
  // Copper, manganese, cobalt, nickel and iron. acac is drawn as its enolate, both O atoms bonded to the metal.
  CuTC: "smiles:[Cu]OC(=O)C1=CC=CS1", "[Cu(MeCN)4]PF6": "smiles:CC#N[Cu+](N#CC)(N#CC)N#CC.F[P-](F)(F)(F)(F)F",
  "Cu(MeCN)4PF6": "=[Cu(MeCN)4]PF6", "Mn(CO)5Br": "smiles:Br[Mn](=C=O)(=C=O)(=C=O)(=C=O)=C=O",
  "Co(acac)2": "smiles:CC1=CC(C)=O[Co]2(O1)OC(C)=CC(C)=O2", "Ni(acac)2": "smiles:CC1=CC(C)=O[Ni]2(O1)OC(C)=CC(C)=O2",
  "Cu(acac)2": "smiles:CC1=CC(C)=O[Cu]2(O1)OC(C)=CC(C)=O2", "Fe(acac)3": "smiles:CC1=CC(C)=O[Fe]23(O1)(OC(C)=CC(C)=O2)OC(C)=CC(C)=O3",
  // (R,R)-Jacobsen's catalyst
  "Jacobsen's catalyst": "smiles:[C@H]12[N]3[Mn]4(Cl)([N]([C@@H]1CCCC2)=CC1=CC(C(C)(C)C)=CC(C(C)(C)C)=C1O4)OC1=C(C=3)C=C(C(C)(C)C)C=C1C(C)(C)C",
  // Ligands. A chiral one is drawn with no stereochemistry, as BINAP is, so one entry gives either enantiomer.
  // Amines and N-donor heterocycles. TPA is tris(2-pyridylmethyl)amine, as coordination chemists use it (TPMA too).
  TREN: "N1,N1-bis(2-aminoethyl)ethane-1,2-diamine", Me6TREN: "N1,N1-bis[2-(dimethylamino)ethyl]-N2,N2-dimethylethane-1,2-diamine",
  TPA: "1-(pyridin-2-yl)-N,N-bis(pyridin-2-ylmethyl)methanamine", TPMA: "=TPA", en: "ethane-1,2-diamine",
  dien: "N1-(2-aminoethyl)ethane-1,2-diamine", trien: "N1,N2-bis(2-aminoethyl)ethane-1,2-diamine",
  tetren: "N1-(2-aminoethyl)-N2-{2-[(2-aminoethyl)amino]ethyl}ethane-1,2-diamine",
  PMDETA: "N1-[2-(dimethylamino)ethyl]-N1,N2,N2-trimethylethane-1,2-diamine",
  HMTETA: "N1,N2-bis[2-(dimethylamino)ethyl]-N1,N2-dimethylethane-1,2-diamine",
  cyclam: "1,4,8,11-tetraazacyclotetradecane", cyclen: "1,4,7,10-tetraazacyclododecane", TACN: "1,4,7-triazonane",
  Me3TACN: "1,4,7-trimethyl-1,4,7-triazonane", py: "pyridine", Hpz: "1H-pyrazole", Im: "1H-imidazole", MeIm: "1-methyl-1H-imidazole",
  // Bipyridines, terpyridine and phenanthrolines. dmbpy with no locants is the 4,4' one, bpm is 2,2'-bipyrimidine and
  // dmphen is neocuproine (2,9).
  bpy: "2,2'-bipyridine", bipy: "=bpy", dtbbpy: "4,4'-di-tert-butyl-2,2'-bipyridine", dmbpy: "4,4'-dimethyl-2,2'-bipyridine",
  "4,4'-dmbpy": "=dmbpy", "5,5'-dmbpy": "5,5'-dimethyl-2,2'-bipyridine", "6,6'-dmbpy": "6,6'-dimethyl-2,2'-bipyridine",
  dcbpy: "[2,2'-bipyridine]-4,4'-dicarboxylic acid", dmcbpy: "dimethyl [2,2'-bipyridine]-4,4'-dicarboxylate",
  bpz: "2,2'-bipyrazine", bpm: "2,2'-bipyrimidine", tpy: "2,2':6',2''-terpyridine", terpy: "=tpy",
  phen: "1,10-phenanthroline", neocuproine: "2,9-dimethyl-1,10-phenanthroline", dmphen: "=neocuproine",
  bathophenanthroline: "4,7-diphenyl-1,10-phenanthroline", Bphen: "=bathophenanthroline",
  bathocuproine: "2,9-dimethyl-4,7-diphenyl-1,10-phenanthroline", Me4phen: "3,4,7,8-tetramethyl-1,10-phenanthroline",
  phendione: "1,10-phenanthroline-5,6-dione",
  // Cyclometalating ligands, as the free arylpyridines. btp is 2-(1-benzothiophen-2-yl)pyridine, as in Ir(btp)2(acac).
  ppy: "2-phenylpyridine", dfppy: "2-(2,4-difluorophenyl)pyridine", "dF(CF3)ppy": "2-(2,4-difluorophenyl)-5-(trifluoromethyl)pyridine",
  piq: "1-phenylisoquinoline", btp: "2-(1-benzothiophen-2-yl)pyridine",
  // Phosphines and phosphites. dppb is the butane one, dppbz the benzene one. DIOP is Kagan's ligand.
  PCy3: "tricyclohexylphosphane", "P(tBu)3": "tri-tert-butylphosphane", PtBu3: "=P(tBu)3", PMe3: "trimethylphosphane",
  "P(OPh)3": "triphenyl phosphite", dppm: "methylenebis(diphenylphosphane)", dppe: "ethane-1,2-diylbis(diphenylphosphane)",
  dppp: "propane-1,3-diylbis(diphenylphosphane)", dppb: "butane-1,4-diylbis(diphenylphosphane)",
  dppbz: "1,2-phenylenebis(diphenylphosphane)", dppf: "1,1'-bis(diphenylphosphanyl)ferrocene",
  dcpe: "ethane-1,2-diylbis(dicyclohexylphosphane)", dmpe: "ethane-1,2-diylbis(dimethylphosphane)", depe: "ethane-1,2-diylbis(diethylphosphane)",
  DPEphos: "[oxydi(2,1-phenylene)]bis(diphenylphosphane)",
  Xantphos: "(9,9-dimethylxanthene-4,5-diyl)bis(diphenylphosphane)", BINAP: "[1,1'-binaphthalene]-2,2'-diylbis(diphenylphosphane)",
  SEGPHOS: "(4,4'-bi-1,3-benzodioxole-5,5'-diyl)bis(diphenylphosphane)",
  "DM-SEGPHOS": "(4,4'-bi-1,3-benzodioxole-5,5'-diyl)bis[bis(3,5-dimethylphenyl)phosphane]",
  "MeO-BIPHEP": "(6,6'-dimethoxy[1,1'-biphenyl]-2,2'-diyl)bis(diphenylphosphane)",
  DIOP: "[(2,2-dimethyl-1,3-dioxolane-4,5-diyl)bis(methylene)]bis(diphenylphosphane)",
  "Me-DuPhos": "1,2-bis(2,5-dimethylphospholan-1-yl)benzene", "Et-DuPhos": "1,2-bis(2,5-diethylphospholan-1-yl)benzene",
  "Me-BPE": "1,2-bis(2,5-dimethylphospholan-1-yl)ethane", "Ph-BPE": "1,2-bis(2,5-diphenylphospholan-1-yl)ethane",
  "QuinoxP*": "2,3-bis[tert-butyl(methyl)phosphanyl]quinoxaline",
  XPhos: "dicyclohexyl[2',4',6'-tri(propan-2-yl)biphenyl-2-yl]phosphane", SPhos: "dicyclohexyl(2',6'-dimethoxybiphenyl-2-yl)phosphane",
  RuPhos: "dicyclohexyl[2',6'-di(propan-2-yloxy)[1,1'-biphenyl]-2-yl]phosphane",
  BrettPhos: "dicyclohexyl[3,6-dimethoxy-2',4',6'-tri(propan-2-yl)[1,1'-biphenyl]-2-yl]phosphane",
  tBuXPhos: "di-tert-butyl[2',4',6'-tri(propan-2-yl)[1,1'-biphenyl]-2-yl]phosphane",
  tBuBrettPhos: "di-tert-butyl[3,6-dimethoxy-2',4',6'-tri(propan-2-yl)[1,1'-biphenyl]-2-yl]phosphane",
  JohnPhos: "[1,1'-biphenyl]-2-yl(di-tert-butyl)phosphane", CyJohnPhos: "[1,1'-biphenyl]-2-yl(dicyclohexyl)phosphane",
  MePhos: "dicyclohexyl(2'-methyl[1,1'-biphenyl]-2-yl)phosphane",
  DavePhos: "2'-(dicyclohexylphosphanyl)-N,N-dimethyl[1,1'-biphenyl]-2-amine", "cataCXium A": "butyldi(adamantan-1-yl)phosphane",
  // Oxazolines and Schiff bases. BOX is the parent of the R-BOX ligands, 2,2'-(propane-2,2-diyl)bis(4,5-dihydro-1,3-oxazole);
  // the imines of salen and salophen are E. Jacobsen's ligand is (R,R), as Jacobsen's catalyst above.
  BOX: "2,2'-(propane-2,2-diyl)bis(4,5-dihydro-1,3-oxazole)", "Ph-BOX": "2,2'-(propane-2,2-diyl)bis(4-phenyl-4,5-dihydro-1,3-oxazole)",
  "tBu-BOX": "2,2'-(propane-2,2-diyl)bis(4-tert-butyl-4,5-dihydro-1,3-oxazole)", PyBOX: "2,6-bis(4,5-dihydro-1,3-oxazol-2-yl)pyridine",
  "iPr-PyBOX": "2,6-bis[4-(propan-2-yl)-4,5-dihydro-1,3-oxazol-2-yl]pyridine", "Ph-PyBOX": "2,6-bis(4-phenyl-4,5-dihydro-1,3-oxazol-2-yl)pyridine",
  salen: "smiles:Oc1ccccc1/C=N/CC/N=C/c1ccccc1O", H2salen: "=salen",
  salophen: "smiles:Oc1ccccc1/C=N/c1ccccc1/N=C/c1ccccc1O", H2salophen: "=salophen",
  "Jacobsen's ligand": "2,4-di-tert-butyl-6-[(E)-({(1R,2R)-2-[(E)-(3,5-di-tert-butyl-2-hydroxybenzylidene)amino]cyclohexyl}imino)methyl]phenol",
  // Diketones as the neutral diketone (acacH, as acac), and carbon ligands. Cp, Cp* and Ind are the anions, as a
  // chemist counts the ligand; CpH and Cp*H are the dienes. COT is cyclooctatetraene.
  acacH: "pentane-2,4-dione", Hacac: "=acacH", acac: "pentane-2,4-dione", hfacH: "1,1,1,5,5,5-hexafluoropentane-2,4-dione",
  Hhfac: "=hfacH", hfac: "=hfacH", tfacH: "1,1,1-trifluoropentane-2,4-dione", Htfac: "=tfacH", tfac: "=tfacH",
  Hdpm: "2,2,6,6-tetramethylheptane-3,5-dione", Hthd: "=Hdpm", thd: "=Hdpm",
  Cp: "cyclopenta-2,4-dien-1-ide", CpH: "cyclopenta-1,3-diene", "Cp*": "1,2,3,4,5-pentamethylcyclopenta-2,4-dien-1-ide",
  "Cp*H": "1,2,3,4,5-pentamethylcyclopenta-1,3-diene", Ind: "1H-inden-1-ide", cod: "cycloocta-1,5-diene",
  nbd: "bicyclo[2.2.1]hepta-2,5-diene", COT: "cycloocta-1,3,5,7-tetraene", dba: "1,5-diphenylpenta-1,4-dien-3-one",
  // N-heterocyclic carbenes, free and as their imidazolium chlorides
  IMes: "smiles:Cc1cc(C)c(c(C)c1)N1[C]N(C=C1)c1c(C)cc(C)cc1C", IPr: "smiles:CC(C)c1cccc(C(C)C)c1N1[C]N(c2c(C(C)C)cccc2C(C)C)C=C1",
  SIMes: "smiles:Cc1cc(C)c(c(C)c1)N1[C]N(CC1)c1c(C)cc(C)cc1C", SIPr: "smiles:CC(C)c1cccc(C(C)C)c1N1[C]N(c2c(C(C)C)cccc2C(C)C)CC1",
  "IMes·HCl": "1,3-bis(2,4,6-trimethylphenyl)-1H-imidazol-3-ium chloride",
  "IPr·HCl": "1,3-bis[2,6-di(propan-2-yl)phenyl]-1H-imidazol-3-ium chloride",
  "SIMes·HCl": "1,3-bis(2,4,6-trimethylphenyl)-4,5-dihydro-1H-imidazol-3-ium chloride",
  "SIPr·HCl": "1,3-bis[2,6-di(propan-2-yl)phenyl]-4,5-dihydro-1H-imidazol-3-ium chloride",
  // Photocatalysts and dyes. The metal ones have their bonds to the metal drawn, the ligands neutral, as Octet's
  // [Ru(bpy)3]2+: the Ir-C bonds of the cyclometalated ligands too.
  "Ir(ppy)3": "smiles:[Ir]123(C4=CC=CC=C4C4=CC=CC=N41)(C1=CC=CC=C1C1=CC=CC=N12)C1=CC=CC=C1C1=CC=CC=N13", "fac-Ir(ppy)3": "=Ir(ppy)3",
  "[Ir(dF(CF3)ppy)2(dtbbpy)]PF6": "smiles:[Ir+]123(C4=CC(F)=CC(F)=C4C4=CC=C(C(F)(F)F)C=N41)(C1=CC(F)=CC(F)=C1C1=CC=C(C(F)(F)F)C=N12)N1=CC=C(C=C1C1=CC(=CC=N13)C(C)(C)C)C(C)(C)C.F[P-](F)(F)(F)(F)F",
  "Ir(dF(CF3)ppy)2(dtbbpy)PF6": "=[Ir(dF(CF3)ppy)2(dtbbpy)]PF6",
  "[Ru(bpy)3]Cl2": "smiles:C12C3=CC=CC=N3[Ru+2]34(N5=CC=CC=C5C5N3=CC=CC=5)(N=1C=CC=C2)N1=C(C2C=CC=CN=24)C=CC=C1.[Cl-].[Cl-]",
  "Ru(bpy)3Cl2": "=[Ru(bpy)3]Cl2",
  "[Ru(bpy)3](PF6)2": "smiles:C12C3=CC=CC=N3[Ru+2]34(N5=CC=CC=C5C5N3=CC=CC=5)(N=1C=CC=C2)N1=C(C2C=CC=CN=24)C=CC=C1.F[P-](F)(F)(F)(F)F.F[P-](F)(F)(F)(F)F",
  "Ru(bpy)3(PF6)2": "=[Ru(bpy)3](PF6)2",
  "4CzIPN": "2,4,5,6-tetra(carbazol-9-yl)benzene-1,3-dicarbonitrile",
  "4DPAIPN": "2,4,5,6-tetrakis(diphenylamino)benzene-1,3-dicarbonitrile",
  "Eosin Y": "2',4',5',7'-tetrabromo-3',6'-dihydroxy-3H-spiro[[2]benzofuran-1,9'-xanthen]-3-one",
  "methylene blue": "3,7-bis(dimethylamino)phenothiazin-5-ium chloride",
  "Mes-Acr+": "10-methyl-9-(2,4,6-trimethylphenyl)acridin-10-ium", "Mes-Acr-Me+": "10-methyl-9-(2,4,6-trimethylphenyl)acridin-10-ium",
  "Fukuzumi catalyst": "10-methyl-9-(2,4,6-trimethylphenyl)acridin-10-ium perchlorate",
  H2TPP: "5,10,15,20-tetraphenylporphyrin", "meso-tetraphenylporphyrin": "5,10,15,20-tetraphenylporphyrin",
  // Amino acids and nucleobases by their three-letter codes (OPSIN reads their names, not the codes). The one-letter
  // codes are left out: most of them are element symbols (C, H, N) or SMILES.
  Ala: "L-alanine", Arg: "L-arginine", Asn: "L-asparagine", Asp: "L-aspartic acid", Cys: "L-cysteine", Gln: "L-glutamine",
  Glu: "L-glutamic acid", Gly: "glycine", His: "L-histidine", Ile: "L-isoleucine", Leu: "L-leucine", Lys: "L-lysine",
  Met: "L-methionine", Phe: "L-phenylalanine", Pro: "L-proline", Ser: "L-serine", Thr: "L-threonine", Trp: "L-tryptophan",
  Tyr: "L-tyrosine", Val: "L-valine", Ade: "adenine", Gua: "guanine", Cyt: "cytosine", Thy: "thymine", Ura: "uracil",
  // Drugs and natural products (DRUG_NAMES, above)
  ...DRUG_NAMES,
  "Hünig's base": "N-ethyl-N-(propan-2-yl)propan-2-amine", "Boc anhydride": "di-tert-butyl dicarbonate",
  TPT: "2,4,6-triphenylpyrylium tetrafluoroborate", Selectfluor: "1-(chloromethyl)-4-fluoro-1,4-diazoniabicyclo[2.2.2]octane bis(tetrafluoroborate)",
};

// How keys are compared: lower case, without spaces, hyphens or apostrophes, and with a full stop or bullet between
// parts read as "·" ("Et3N.HCl" is "Et3N·HCl").
export const commonKey = (name: string) => name.toLowerCase().replace(/[\s‐-―'’ʼ-]/g, "").replace(/[.•∙⋅]/g, "·");

// Whether Octet can cite a key after its structure's name, as "N1,N1-bis(2-aminoethyl)ethane-1,2-diamine (TREN)": not
// a drug's name, and not the structure's own formula in element symbols (CH2Cl2, NaCl, K2CO3, (COCl)2). An acronym
// whose letters happen to be element symbols (NBS, DIOP, DBU) is cited, and so is a formula written with groups (Et3N,
// AcOH). counts: the structure's elements, as its formula has them.
const DRUG_KEYS = new Set(Object.keys(DRUG_NAMES));
export function citable(key: string, counts: Record<string, number>): boolean {
  if (DRUG_KEYS.has(key)) return false;
  const spelt = formulaOf(key);
  return !spelt || Object.keys({ ...spelt, ...counts }).some((el) => (spelt[el] ?? 0) !== (counts[el] ?? 0));
}
// The elements a key spells out as a formula of element symbols alone, D and T counted as H: CH2Cl2, NaCl, (COCl)2,
// CuSO4·5H2O. Undefined for a key that is not one (Et3N, nBuLi, DMSO-d6).
function formulaOf(key: string): Record<string, number> | undefined {
  const total: Record<string, number> = {};
  for (const part of key.split("·")) {
    const lead = /^\d*/.exec(part)![0], stack: Record<string, number>[] = [{}];
    const add = (into: Record<string, number>, el: string, n: number) => { into[el] = (into[el] ?? 0) + n; };
    for (const t of part.slice(lead.length).match(/[A-Z][a-z]?\d*|\)\d*|./g) ?? []) {
      const top = stack[stack.length - 1], element = /^([A-Z][a-z]?)(\d*)$/.exec(t);
      if (t === "(") stack.push({});
      else if (t[0] === ")" && stack.length > 1) { stack.pop(); for (const [el, n] of Object.entries(top)) add(stack[stack.length - 1], el, n * Number(t.slice(1) || 1)); }
      else if (element && (ELEMENTS.has(element[1]) || element[1] === "T")) add(top, /^[DT]$/.test(element[1]) ? "H" : element[1], Number(element[2] || 1));
      else return undefined;
    }
    if (stack.length !== 1 || !part.slice(lead.length)) return undefined;
    for (const [el, n] of Object.entries(stack[0])) add(total, el, n * Number(lead || 1));
  }
  return total;
}
