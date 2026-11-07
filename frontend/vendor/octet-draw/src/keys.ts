// Keyboard shortcuts. Each action works in one place: over an atom, over a bond, or anywhere else.
// The same key can do different things in different places (n over an atom, 2 over a bond), as in ChemDraw.
// The defaults are ChemDraw's hotkeys, as ChemDraw 22.2 sets them (its hotkey table and its Atom and Generic Hotkeys
// help), so a ChemDraw user's hands already know them. The user's changes sit on top.

// item: over an atom or a bond.
export type Place = "atom" | "bond" | "item" | "any";
export type Group = "Atoms" | "Groups" | "Bonds" | "Tools" | "Selection" | "Edit";
// group: one of Group for the canvas keys; for a menu command, the menu it is in (File, Object › Align).
export type Action = { id: string; name: string; group: Group | string; place: Place };

const element = (symbol: string, name: string): Action => ({ id: `element.${symbol}`, name: `Set atom to ${name}`, group: "Atoms", place: "atom" });
const group = (id: string, name: string): Action => ({ id: `group.${id}`, name, group: "Groups", place: "atom" });
const bond = (id: string, name: string): Action => ({ id: `bond.${id}`, name, group: "Bonds", place: "bond" });
const any = (id: string, name: string, g: Group): Action => ({ id, name, group: g, place: "any" });

export const ACTIONS: Action[] = [
  element("C", "carbon"), element("H", "hydrogen"), element("N", "nitrogen"), element("O", "oxygen"), element("S", "sulfur"),
  element("P", "phosphorus"), element("F", "fluorine"), element("Cl", "chlorine"), element("Br", "bromine"), element("I", "iodine"),
  element("B", "boron"), element("Si", "silicon"), element("Li", "lithium"),
  { id: "atom.label", name: "Type a label on the atom", group: "Atoms", place: "atom" },
  { id: "atom.newlabel", name: "Type a new label on the atom", group: "Atoms", place: "atom" },
  { id: "atom.sproutlabel", name: "Add a bond and type a label on its end", group: "Atoms", place: "atom" },
  ...["Me", "Et", "Ph", "Ac", "OMe", "CO2Me", "CF3", "NO2", "N3", "MgBr", "Fmoc", "Cbz", "Boc", "D", "R", "X", "A", "Q", "M"].map((t): Action => ({ id: `label.${t}`, name: `Set atom to ${t}`, group: "Atoms", place: "atom" })),
  // ChemDraw's FREE_SITE, UPTO_SITE and EXACT_SITE commands (no default key): an atom's substituent count, up or down.
  { id: "subst.free", name: "Add a free site", group: "Atoms", place: "atom" },
  { id: "subst.upto", name: "Raise the substituents up-to count", group: "Atoms", place: "atom" },
  { id: "subst.exactly", name: "Raise the exact substituent count", group: "Atoms", place: "atom" },
  { id: "subst.lower", name: "Lower the substituent count", group: "Atoms", place: "atom" },
  { id: "atom.attach", name: "Add an attachment point", group: "Atoms", place: "atom" },
  { id: "atom.number", name: "Show or hide the atom's number", group: "Atoms", place: "atom" },
  { id: "atom.properties", name: "Atom properties…", group: "Atoms", place: "atom" },
  { id: "atom.nickname", name: "Choose a nickname for the atom", group: "Atoms", place: "atom" },
  { id: "charge.plus", name: "Add a positive charge", group: "Atoms", place: "atom" },
  { id: "charge.minus", name: "Add a negative charge", group: "Atoms", place: "atom" },
  group("chain", "Add a bond (zig-zag)"), group("other", "Add a bond the other way"), group("acetyl", "Add an acetyl, or make C=O"),
  group("phenyl", "Add a phenyl"), group("wedgeMe", "Add a wedged methyl"), group("hashMe", "Add a hashed methyl"),
  group("cyclohexyl", "Add a cyclohexyl"), group("cyclopentyl", "Add a cyclopentyl"), group("cyclobutyl", "Add a cyclobutyl"),
  group("cyclopropyl", "Add a cyclopropyl"), group("methylidene", "Add =CH2"), group("dimethyl", "Add two methyls"), group("alkyne", "Add an alkyne"),
  group("cpLigand", "Add a cyclopentadienyl ligand (η5)"), group("phenylLigand", "Add a phenyl ligand (η6)"),
  group("sulfonyl", "Add a sulfonyl"), group("tBu", "Add a tert-butyl"),
  bond("single", "Make bond single"), bond("double", "Make bond double"), bond("triple", "Make bond triple"), bond("quadruple", "Make bond quadruple"), bond("hydrogen", "Make bond a hydrogen bond"), bond("bolddouble", "Make bond bold double"), bond("dasheddouble", "Make bond dashed double"), bond("aromaticdouble", "Make bond aromatic double"), bond("eitherdouble", "Make bond double either"),
  bond("wedge", "Make bond a wedge"), bond("hashwedge", "Make bond a hashed wedge"), bond("hollow", "Make bond a hollow wedge"), bond("dative", "Make bond dative"), bond("hashed", "Make bond hashed"),
  bond("bold", "Make bond bold"), bond("dashed", "Make bond dashed"), bond("wavy", "Make bond wavy"),
  bond("left", "Put the double bond's second line on the left"), bond("centre", "Centre the double bond"), bond("right", "Put the double bond's second line on the right"),
  bond("auto", "Place the double bond's second line automatically"), bond("front", "Bring the bond to the front where bonds cross"), bond("properties", "Bond properties"),
  bond("ring3", "Fuse a cyclopropane"), bond("ring4", "Fuse a cyclobutane"), bond("ring5", "Fuse a cyclopentane"), bond("ring6", "Fuse a cyclohexane"),
  bond("ring7", "Fuse a cycloheptane"), bond("ring8", "Fuse a cyclooctane"), bond("ring9", "Fuse a cyclononane"), bond("ring10", "Fuse a cyclodecane"),
  bond("benzene", "Fuse a benzene"), bond("cyclopentadiene", "Fuse a cyclopentadiene"),
  bond("chair1", "Fuse a chair cyclohexane"), bond("chair2", "Fuse a chair cyclohexane, other way up"),
  any("tool.select", "Select tool", "Tools"), any("tool.bond", "Bond tool", "Tools"), any("tool.chain", "Chain tool", "Tools"),
  any("tool.ring", "Ring tool", "Tools"), any("tool.benzene", "Benzene tool", "Tools"), any("tool.cyclopentadiene", "Cyclopentadiene tool", "Tools"),
  any("tool.cyclohexane", "Cyclohexane tool", "Tools"), any("tool.cyclopentane", "Cyclopentane tool", "Tools"), any("tool.erase", "Eraser tool", "Tools"), any("tool.text", "Text tool", "Tools"), any("tool.arrow", "Arrow tool", "Tools"),
  any("tool.template", "Template tool", "Tools"), any("tool.symbol", "Symbols tool", "Tools"), any("tool.shape", "Shape tool", "Tools"),
  any("tool.bracket", "Bracket tool", "Tools"), any("tool.tlc", "TLC plate tool", "Tools"), any("tool.orbital", "Orbital tool", "Tools"),
  { id: "select.here", name: "Select the atom or bond under the pointer", group: "Selection", place: "item" },
  any("eraser.smaller", "Make the eraser smaller", "Tools"), any("eraser.bigger", "Make the eraser bigger", "Tools"),
  any("nudge.left", "Move the selection left 1 pt, or the highlight one step left", "Selection"), any("nudge.right", "Move the selection right 1 pt, or the highlight one step right", "Selection"),
  any("nudge.up", "Move the selection up 1 pt, or the highlight one step up", "Selection"), any("nudge.down", "Move the selection down 1 pt, or the highlight one step down", "Selection"),
  any("nudge.left10", "Move the selection left 10 pt, or the highlight about three bonds left", "Selection"), any("nudge.right10", "Move the selection right 10 pt, or the highlight about three bonds right", "Selection"),
  any("nudge.up10", "Move the selection up 10 pt, or the highlight about three bonds up", "Selection"), any("nudge.down10", "Move the selection down 10 pt, or the highlight about three bonds down", "Selection"),
  any("rotate.ccw15", "Turn the selection 15° anticlockwise", "Selection"), any("rotate.cw15", "Turn the selection 15° clockwise", "Selection"),
  any("rotate.ccw1", "Turn the selection 1° anticlockwise", "Selection"), any("rotate.cw1", "Turn the selection 1° clockwise", "Selection"),
  any("tilt.left", "Turn the selection 12° in 3D to the left, or move the highlight to the next structure left", "Selection"),
  any("tilt.right", "Turn the selection 12° in 3D to the right, or move the highlight to the next structure right", "Selection"),
  any("tilt.up", "Turn the selection 12° in 3D up, or move the highlight to the next structure up", "Selection"),
  any("tilt.down", "Turn the selection 12° in 3D down, or move the highlight to the next structure down", "Selection"),
  any("edit.delete", "Delete the selection, or what is under the pointer", "Edit"),
  // The Actions panel's own actions (no menu command or canvas key does them): each can take a key here, so every
  // action the panel and its right-click menu show can run from the keyboard. ChemDraw has no keys for them.
  ...([["select_structure", "Select the whole structure"], ["pairs", "Show or hide lone pairs"], ["number", "Number the compounds"], ["show_warnings", "Show hidden warnings"], ["hide_warnings", "Hide the selection's warnings"],
    ["caption.add", "Add a caption under the structure"], ["template.add", "Add the selection to the templates"], ["cycle.make", "Make a catalytic cycle"], ["align.row", "Line up structures in a row"],
    ["align.column", "Line up structures in a column"], ["align.spread-row", "Space structures evenly"], ["bond.flip", "Point the bond the other way"], ["caption.edit", "Edit the text"],
    ["caption.attach", "Tie the text to its structure"], ["caption.detach", "Un-tie the text from its structure"], ["reaction.map", "Map the reaction's atoms"], ["reaction.unmap", "Clear the atom map"],
    ["cycle.centre", "Add a centre label to the cycle"], ["cycle.in", "Add a reagent coming in"], ["cycle.out", "Add a product going out"], ["cycle.tidy", "Tidy the cycle"],
    ["cycle.step.reversible", "Make the cycle's step reversible or one way"], ["cycle.step.balance.equal", "Balance the reversible step equally"],
    ["cycle.step.balance.forward", "Make the reversible step's forward half longer"], ["cycle.step.balance.back", "Make the reversible step's back half longer"],
    ["cycle.step.reset", "Reset the cycle's step"], ["cycle.step.hide", "Hide or show the step's arc"], ["cycle.step.show", "Show the cycle's hidden arcs"], ["cycle.side.add", "Add a side arrow to the cycle"], ["cycle.name", "Add a step name"],
    ["cycle.side.ends.both", "Give the side arrow both ends"], ["cycle.side.ends.in", "Make the side arrow come in only"], ["cycle.side.ends.out", "Make the side arrow go out only"],
    ["cycle.side.swap", "Swap the side arrow's in and out"], ["cycle.side.inside", "Put the side arrow inside or outside the cycle"], ["cycle.side.reset", "Reset the side arrow's position"],
    ["cycle.side.remove", "Remove the side arrow"],
    ["cycle.reverse", "Reverse the cycle"], ["cycle.remove", "Remove the cycle"], ["arrow.reverse", "Reverse the arrow"], ["arrow.flip", "Flip the arrow's curve"],
    ["arrow.point", "Add or remove the arrow's point"], ["arrow.closed", "Open or close the curve"], ["arrow.above", "Add conditions above the arrow"], ["arrow.below", "Add conditions below the arrow"],
    ["orbital.swap", "Swap the orbital's phases"], ["shape.lanes.1", "Add a lane to the plate"], ["shape.lanes.copy", "Duplicate the plate's lane"], ["shape.lanes.-1", "Delete the plate's lane"],
    ["shape.rf", "Show or hide the plate's Rf values"], ["shape.ticks", "Show or hide the plate's side ticks"], ["shape.transparent", "Make the plate transparent or opaque"], ["spot.setrf", "Set the spot's Rf"],
    ["shape.hide.origin", "Show or hide the plate's origin"], ["shape.hide.front", "Show or hide the solvent front"], ["shape.hide.border", "Show or hide the plate's border"],
    ["spot.rf", "Show or hide the spot's Rf"], ["shape.row.after", "Add a table row below"], ["shape.col.after", "Add a table column after"], ["shape.row.before", "Add a table row above"],
    ["shape.col.before", "Add a table column before"], ["shape.row.delete", "Delete the table row"], ["shape.col.delete", "Delete the table column"], ["shape.fit", "Size the table to fit"],
    ["shape.clear", "Clear the table"], ["shape.dashed", "Dashed or solid lines"]] as const).map(([command, name]): Action => ({ id: `action.${command}`, name, group: "Actions panel", place: "any" })),
  // ChemDraw's reaction shortcut: a reaction arrow and a copy of the selected structures beyond it, that way.
  any("reaction.right", "Add a reaction arrow and a copy of the selection to the right", "Selection"), any("reaction.left", "Add a reaction arrow and a copy of the selection to the left", "Selection"),
  any("reaction.up", "Add a reaction arrow and a copy of the selection above", "Selection"), any("reaction.down", "Add a reaction arrow and a copy of the selection below", "Selection"),
];

// ChemDraw's defaults. Where its table and its help disagree (Boc: y or Shift+Y), both keys work.
export const DEFAULT_KEYS: Record<string, string[]> = {
  "element.C": ["c"], "element.H": ["h"], "element.N": ["n", "w"], "element.O": ["o", "q"], "element.S": ["s"], "element.P": ["p"],
  "element.F": ["f"], "element.Cl": ["l", "shift+c"], "element.Br": ["b"], "element.I": ["i"], "element.B": ["shift+b"],
  "element.Si": ["shift+s"], "element.Li": ["shift+l"],
  "atom.label": ["enter"], "atom.newlabel": ["!"], "atom.sproutlabel": [">"],
  "label.Me": ["m"], "label.Et": ["e"], "label.Ph": ["shift+p"], "label.Ac": ["shift+a"], "label.OMe": ["shift+o"], "label.CO2Me": ["shift+e"],
  "label.CF3": ["shift+f"], "label.NO2": ["shift+n"], "label.N3": ["shift+z"], "label.MgBr": ["shift+m"], "label.Fmoc": ["shift+q"],
  "label.Cbz": ["shift+h"], "label.Boc": ["y", "shift+y"], "label.D": ["d"], "label.R": ["r"], "label.X": ["x"], "atom.attach": ["."], "atom.number": ["'"], "atom.properties": ["/", "?"], "atom.nickname": ["="], "select.here": ["g"],
  "charge.plus": ["+"], "charge.minus": ["-"],
  "group.chain": ["1"], "group.other": ["0"], "group.acetyl": ["2"], "group.phenyl": ["3", "a"], "group.wedgeMe": ["4"], "group.hashMe": ["5"],
  "group.cyclohexyl": ["6"], "group.cyclopentyl": ["7"], "group.methylidene": ["8"], "group.dimethyl": ["9"], "group.alkyne": ["z"],
  "group.cpLigand": ["j"], "group.phenylLigand": ["shift+j"],
  "group.cyclopropyl": ["v"], "group.cyclobutyl": ["u"], "group.sulfonyl": ["k"], "group.tBu": ["shift+k"],
  "bond.single": ["1"], "bond.double": ["2"], "bond.triple": ["3"], "bond.quadruple": [], "bond.hydrogen": [], "bond.wedge": ["w"], "bond.hashwedge": ["h", "shift+w"], "bond.hollow": [], "bond.dative": [],
  "bond.hashed": ["shift+h"], "bond.bold": ["b"], "bond.bolddouble": ["shift+b"], "bond.dasheddouble": ["shift+d"], "bond.aromaticdouble": [], "bond.eitherdouble": [], "bond.dashed": ["d"], "bond.wavy": ["y"],
  "bond.left": ["l"], "bond.centre": ["c"], "bond.right": ["r"], "bond.auto": [], "bond.front": ["f"], "bond.properties": ["/", "?"],
  "bond.ring3": ["v"], "bond.ring4": ["4"], "bond.ring5": ["5"], "bond.ring6": ["6"], "bond.ring7": ["7"], "bond.ring8": ["8"],
  "bond.ring9": [], "bond.ring10": [], "bond.benzene": ["a"], "bond.cyclopentadiene": ["z"], "bond.chair1": ["9"], "bond.chair2": ["0"],
  "tool.select": ["space"], "tool.bond": ["x"], "tool.chain": ["shift+x"], "tool.ring": [], "tool.benzene": ["j"],
  "tool.cyclopentadiene": ["shift+j"], "tool.cyclohexane": [], "tool.cyclopentane": [], "tool.erase": [], "tool.text": ["t"], "tool.arrow": ["e"], "tool.template": [], "tool.symbol": ["shift+e"], "tool.shape": [],
  "tool.bracket": ["shift+t"], "tool.tlc": ["g"], "tool.orbital": ["shift+g"],
  "eraser.smaller": ["["], "eraser.bigger": ["]"],
  "nudge.left": ["arrowleft"], "nudge.right": ["arrowright"], "nudge.up": ["arrowup"], "nudge.down": ["arrowdown"],
  "nudge.left10": ["shift+arrowleft"], "nudge.right10": ["shift+arrowright"], "nudge.up10": ["shift+arrowup"], "nudge.down10": ["shift+arrowdown"],
  "rotate.ccw15": ["alt+arrowup"], "rotate.cw15": ["alt+arrowdown"], "rotate.ccw1": ["alt+arrowleft"], "rotate.cw1": ["alt+arrowright"],
  "tilt.left": ["alt+shift+arrowleft"], "tilt.right": ["alt+shift+arrowright"], "tilt.up": ["alt+shift+arrowup"], "tilt.down": ["alt+shift+arrowdown"],
  "edit.delete": ["delete", "backspace"],
  "reaction.right": ["mod+arrowright"], "reaction.left": ["mod+arrowleft"], "reaction.up": ["mod+arrowup"], "reaction.down": ["mod+arrowdown"],
};

export type Keymap = Record<string, string[]>;
// A key saved for an action under its old id works for it under its new one.
const RENAMED: Record<string, string> = { "action.cycle.ungroup": "action.cycle.remove" };
export const keymap = (changes: Keymap = {}): Keymap => ({ ...DEFAULT_KEYS, ...Object.fromEntries(Object.entries(changes).map(([k, v]) => [RENAMED[k] && !changes[RENAMED[k]] ? RENAMED[k] : k, v])) });

// One key press as a string: "n", "shift+n", "+", "shift+arrowup", "alt+arrowleft". Letters and named keys keep
// Shift; on their own, symbols such as + are already shifted. Option changes the letter a key types on a Mac, so the
// physical key (e.code) is used whenever Option is held. With Command, Ctrl or Option, a symbol or digit key is its
// physical key and keeps Shift (⇧⌘- is "mod+shift+-", not ⌘_), as menu shortcuts are written.
const SYMBOL_CODES: Record<string, string> = { Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`" };
export function keyOf(e: { key: string; code?: string; shiftKey: boolean; altKey: boolean; metaKey: boolean; ctrlKey: boolean }): string | undefined {
  if (["Shift", "Alt", "Meta", "Control", "CapsLock", "Dead"].includes(e.key)) return undefined;
  let key = e.key === " " ? "space" : e.key.toLowerCase();
  if (e.altKey && e.code?.startsWith("Key")) key = e.code.slice(3).toLowerCase();
  const held = e.metaKey || e.ctrlKey || e.altKey, base = e.code && (SYMBOL_CODES[e.code] ?? (/^Digit\d$/.test(e.code) ? e.code.slice(5) : undefined));
  if (held && base) return [(MAC ? e.metaKey : e.metaKey || e.ctrlKey) && "mod", MAC && e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && "shift", base].filter(Boolean).join("+");
  const named = key.length > 1;
  // On the Mac, Command is mod and Control its own key (⌃⌘E is not ⌘E); elsewhere Ctrl is mod.
  const mods = [(MAC ? e.metaKey : e.metaKey || e.ctrlKey) && "mod", MAC && e.ctrlKey && "ctrl", e.altKey && "alt", e.shiftKey && (/^[a-z]$/.test(key) || named) && "shift"].filter(Boolean);
  return [...mods, key].join("+");
}

// How a key looks on screen.
const MAC = typeof navigator !== "undefined" && navigator.platform.startsWith("Mac");
const NAMES: Record<string, string> = {
  delete: "Delete", backspace: MAC ? "⌫" : "Backspace", space: "Space", escape: "Esc", enter: MAC ? "↩" : "Enter", "-": "−",
  arrowleft: "←", arrowright: "→", arrowup: "↑", arrowdown: "↓",
};
// A shortcut written the Mac way (⇧⌥⌘L, or ⇧Ctrl+L from code that puts Ctrl+ for ⌘ off the Mac) as this platform
// shows it: unchanged on the Mac; on Windows and Linux, Ctrl+Alt+Shift+L, in that order.
export function platformLabel(s: string | undefined): string | undefined {
  if (MAC || !s) return s;
  const MODS: Record<string, string> = { "⌃": "Ctrl", "⌥": "Alt", "⇧": "Shift", "⌘": "Ctrl", "Ctrl+": "Ctrl", "Alt+": "Alt", "Shift+": "Shift" };
  const mods = new Set<string>();
  let rest = s;
  for (let m = /^(⌃|⌥|⇧|⌘|Ctrl\+|Alt\+|Shift\+)/.exec(rest); m && rest.length > m[1].length; m = /^(⌃|⌥|⇧|⌘|Ctrl\+|Alt\+|Shift\+)/.exec(rest)) {
    mods.add(MODS[m[1]]);
    rest = rest.slice(m[1].length);
  }
  const key = ({ "⌫": "Backspace", "⌦": "Delete", "↩": "Enter", "⎋": "Esc" } as Record<string, string>)[rest] ?? rest;
  return [...["Ctrl", "Alt", "Shift"].filter((k) => mods.has(k)), key].join("+");
}

// A key as this platform writes it: ⌃⌥⇧⌘ before the key on the Mac, in that order; Ctrl+Alt+Shift+ elsewhere.
export function label(key: string): string {
  if (key === "+") return "+";
  const parts = key.split("+"), last = parts.pop()!, mods = new Set(parts), name = NAMES[last] ?? (last.length === 1 ? last.toUpperCase() : last);
  if (MAC) return [["ctrl", "⌃"], ["alt", "⌥"], ["shift", "⇧"], ["mod", "⌘"]].filter(([m]) => mods.has(m)).map(([, g]) => g).join("") + name;
  return [...(mods.has("mod") || mods.has("ctrl") ? ["Ctrl"] : []), ...(mods.has("alt") ? ["Alt"] : []), ...(mods.has("shift") ? ["Shift"] : []), name].join("+");
}

// Menu commands (src-tauri/src/main.rs lists them): each is an action "menu.<id>" whose default is the menu's own
// shortcut, so Settings lists and changes them with the canvas keys. A shortcut with Command or Ctrl is the menu's
// (native: it works wherever the focus is, as menus do); any other key the page handles, never while typing.
const ACCEL: Record<string, string> = { space: "Space", enter: "Enter", backspace: "Backspace", delete: "Delete", escape: "Escape", tab: "Tab", arrowup: "Up", arrowdown: "Down", arrowleft: "Left", arrowright: "Right" };
export function fromAccelerator(a: string): string | undefined {
  if (!a) return undefined;
  const parts = a.split("+"), key = parts.pop()!.toLowerCase(), mods = new Set(parts.map((p) => p.toLowerCase()));
  const name = Object.entries(ACCEL).find(([, v]) => v.toLowerCase() === key)?.[0] ?? (key === "" ? "+" : key);
  return [mods.has("cmdorctrl") || mods.has("cmd") || mods.has("command") ? "mod" : "", mods.has("ctrl") || mods.has("control") ? (MAC ? "ctrl" : "mod") : "", mods.has("alt") || mods.has("option") ? "alt" : "", mods.has("shift") ? "shift" : ""]
    .filter((m, k, all) => m && all.indexOf(m) === k).concat(name).join("+");
}
export const native = (key: string) => /(^|\+)(mod|ctrl)\+/.test(key);
export function toAccelerator(key: string): string {
  const parts = key.split("+"), last = parts.pop()!, mods = new Set(parts);
  const name = ACCEL[last] ?? (/^f\d{1,2}$/.test(last) ? last.toUpperCase() : last.length === 1 ? last.toUpperCase() : last);
  return [mods.has("mod") ? "CmdOrCtrl" : "", mods.has("ctrl") ? "Ctrl" : "", mods.has("alt") ? "Alt" : "", mods.has("shift") ? "Shift" : "", name].filter(Boolean).join("+");
}
// Whether a menu command runs now. Over a dialog or Settings only Undo, Redo and Select All run, on the text in its
// fields, as a Mac app's menu does over a sheet. Home covers the drawing in the same way: there only the commands that
// start or open a drawing (Open Recent too), or open Settings, About, the tutorial or the Help menu's items, run. Quit
// and Close Window run everywhere: they ask about unsaved changes over any dialog (src-tauri/src/quit.rs). Cut, Copy and
// Paste (Octet's own items on Linux) run everywhere too: they work on the text being typed, and the drawing takes them
// only when nothing covers it.
const HOME_COMMANDS = ["home", "new", "open", "settings", "about", "tutorial", "shortcuts", "report_problem", "check_updates", "select_all"];
export function menuRuns(id: string, over: { home: boolean; modal: boolean; typing: boolean }) {
  if (["quit", "close", "cut", "copy", "paste"].includes(id)) return true;
  if (over.typing && ["undo", "redo", "select_all"].includes(id)) return true;
  if (over.modal) return false;
  return !over.home || HOME_COMMANDS.includes(id) || id.startsWith("new_") || id.startsWith("recent_");
}
export function registerMenu(items: [string, string, string, string][]) {
  // A command no longer in the menu (the Search menu, with Online search off) leaves the list.
  const ids = new Set(items.map(([id]) => `menu.${id}`));
  for (let k = ACTIONS.length - 1; k >= 0; k--) if (ACTIONS[k].id.startsWith("menu.") && !ids.has(ACTIONS[k].id)) ACTIONS.splice(k, 1);
  for (const [id, name, section, keys] of items) {
    const action = `menu.${id}`;
    if (!ACTIONS.some((a) => a.id === action)) ACTIONS.push({ id: action, name: name.replace(/…$/, ""), group: section || "Menu", place: "any" });
    const k = fromAccelerator(keys);
    DEFAULT_KEYS[action] = k ? [k] : [];
  }
}

// The action a key runs here. Atom and bond keys win over keys that work anywhere.
export function actionFor(map: Keymap, key: string, place: "atom" | "bond" | "none"): string | undefined {
  const found = (p: Place) => ACTIONS.find((a) => (a.place === p || (a.place === "item" && p !== "any")) && map[a.id]?.includes(key))?.id;
  return (place !== "none" ? found(place) : undefined) ?? found("any");
}

// Other actions that already use this key in the same place.
export function clashes(map: Keymap, id: string, key: string): string[] {
  const place = ACTIONS.find((a) => a.id === id)?.place;
  const near = (p?: Place) => p === place || (p === "item" && (place === "atom" || place === "bond")) || (place === "item" && (p === "atom" || p === "bond"));
  return ACTIONS.filter((a) => a.id !== id && near(a.place) && map[a.id]?.includes(key)).map((a) => a.id);
}

// A drag that moves a copy of the selection (issues 33 and 45): Option-drag on the Mac; on Windows and Linux,
// Ctrl-drag as in ChemDraw for Windows, and Alt-drag too (Linux window managers often take Alt-drag for themselves).
export const copyDrag = (e: { altKey: boolean; ctrlKey: boolean }, mac = MAC) => e.altKey || (!mac && e.ctrlKey);
// A click that adds to the selection, or takes out what was all selected: Shift-click, and on Windows and Linux
// Ctrl-click too, as in Explorer (issue 32). On the Mac Control-click is the right-click. Only the click adds: a Ctrl
// press that then drags still moves a copy (copyDrag).
export const addsToSelection = (e: { shiftKey: boolean; ctrlKey: boolean }, mac = MAC) => e.shiftKey || (!mac && e.ctrlKey);
// ⌘ (Ctrl on Windows and Linux) held during a move keeps what moves off any catalytic cycle. A drag that started as a
// Ctrl-drag copy keeps Ctrl as the copy key: Ctrl held from the press does not also keep the copy off a cycle. The
// Windows key (meta) still does, and so does Ctrl on an Alt-drag copy.
export const skipsCycle = (e: { metaKey: boolean; ctrlKey: boolean }, ctrlCopy: boolean) => e.metaKey || (e.ctrlKey && !ctrlCopy);

// The focused element, as much of it as the key checks read.
type Focus = { tagName: string; type?: string; isContentEditable?: boolean } | null | undefined;

// A field that takes typed text: its keys, Undo and Select All are the text's. A slider, tick box, radio button,
// colour well or button does not take text, so the drawing keeps its keys (controlTakes gives the exceptions).
const TEXT_INPUTS = ["text", "search", "number", "email", "url", "tel", "password"];
export const textEntry = (el: Focus) => !!el && (el.tagName === "TEXTAREA" || el.isContentEditable === true || (el.tagName === "INPUT" && TEXT_INPUTS.includes(el.type ?? "text")));

// ChemDraw's text keys with ⌘ (Ctrl on Windows and Linux) in a caption or atom label box: the command each runs. A label
// takes Bold, Italic, Underline, Plain, Subscript and Superscript (Fe with III raised, issue 44); a caption takes
// Formula too. ⇧⌘N in either is Convert Name to Structure.
const TEXT_KEYS: Record<string, string> = { b: "caption.bold", i: "caption.italic", u: "caption.underline", t: "caption.plain", f: "caption.formula", "-": "caption.sub", "=": "caption.super", "+": "caption.super" };
export function textKey(e: { key: string; shiftKey: boolean }, label: boolean): string | undefined {
  const k = e.key.toLowerCase();
  if (e.shiftKey && k === "n") return "name_to_structure";
  const command = TEXT_KEYS[k];
  return label && command && !["b", "i", "u", "t", "-", "=", "+"].includes(k) ? undefined : command;
}

// A control the keyboard moved to (Tab) keeps the keys it uses: Space and Return press a button, and the arrow keys,
// Home, End, Page Up and Page Down move a slider. After a click they stay the drawing's: Windows focuses a clicked
// button, and then counts that focus as the keyboard's at the next key, so :focus-visible cannot tell.
const SLIDER_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
export function controlTakes(key: string, el: Focus, byKeyboard: boolean) {
  if (!el || !byKeyboard) return false;
  if (el.tagName === "BUTTON") return key === " " || key === "Enter";
  return el.tagName === "INPUT" && el.type === "range" && SLIDER_KEYS.includes(key);
}

// Arrow keys on Home's tiles: the New row and the recent drawings, each grid with its own number of columns. from:
// the tile with the focus (-1: none, then any arrow goes to the first tile). Left and Right go to the tile before or
// after in reading order. Up and Down go to the nearest row above or below, to the tile there whose middle is nearest
// across (the left one of two as near); with no row there, the focus stays.
type Rect = { x: number; y: number; width: number; height: number };
export function tileTo(key: string, from: number, tiles: Rect[]): number | undefined {
  const step = ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[key];
  if (!step || !tiles.length) return undefined;
  if (from < 0) return 0;
  if (key === "ArrowRight" || key === "ArrowLeft") return Math.min(tiles.length - 1, Math.max(0, from + step));
  const at = tiles[from], mid = (r: Rect) => r.x + r.width / 2, half = Math.min(...tiles.map((r) => r.height)) / 2;
  // A row is the tiles whose tops are less than half a tile apart (the tiles move a little as Home arrives).
  const next = tiles.map((r, k) => ({ r, k })).filter(({ r }) => (r.y - at.y) * step > half);
  if (!next.length) return from;
  const top = step > 0 ? Math.min(...next.map(({ r }) => r.y)) : Math.max(...next.map(({ r }) => r.y));
  const row = next.filter(({ r }) => Math.abs(r.y - top) < half), off = (r: Rect) => Math.abs(mid(r) - mid(at));
  return row.reduce((a, b) => (off(b.r) < off(a.r) - 0.5 ? b : a)).k;
}

// Feedback's keys (for testers, REL-8): ⌘ (Ctrl on Windows and Linux) held, with 1, 2 and 3 all pressed within
// 400 ms. Only the presses count, as macOS sends no key-up while ⌘ is held. pressed: when each digit was last
// pressed (ms); it is emptied when the keys are complete.
export function feedbackChord(pressed: Map<string, number>, digit: string, at: number): boolean {
  pressed.set(digit, at);
  const times = ["1", "2", "3"].map((d) => pressed.get(d) ?? -Infinity);
  if (Math.max(...times) - Math.min(...times) > 400) return false;
  pressed.clear();
  return true;
}
