// The Character Map's characters (CharMap.tsx), in groups, each with the name a screen reader says.

const GREEK = "αβγδεζηθικλμνξοπρστυφχψω", NAMES = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega".split(" ");
const SUPER = "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻", SUB = "₀₁₂₃₄₅₆₇₈₉₊₋";

export const CHAR_GROUPS: [string, string[]][] = [
  ["Greek", [...GREEK]],
  ["Greek capitals", [...GREEK.toUpperCase()]],
  ["Arrows", [..."→←↑↓↔⇌⇄⇒⇐⇔↻↺"]],
  ["Maths", [..."±∓×÷·−≤≥≠≈≡∝∞°′″‰√∂∫∑…"]],
  ["Superscript", [...SUPER]],
  ["Subscript", [...SUB]],
  ["Chemistry", [..."‡†•✱⊕⊖Åµ"]],
];

const OTHER: Record<string, string> = {
  "→": "Right arrow", "←": "Left arrow", "↑": "Up arrow", "↓": "Down arrow", "↔": "Left right arrow", "⇌": "Equilibrium arrows", "⇄": "Right and left arrows",
  "⇒": "Double right arrow", "⇐": "Double left arrow", "⇔": "Double left right arrow", "↻": "Clockwise arrow", "↺": "Anticlockwise arrow",
  "±": "Plus or minus", "∓": "Minus or plus", "×": "Times", "÷": "Divide", "·": "Middle dot", "−": "Minus", "≤": "Less than or equal to", "≥": "Greater than or equal to",
  "≠": "Not equal to", "≈": "Almost equal to", "≡": "Identical to", "∝": "Proportional to", "∞": "Infinity", "°": "Degree", "′": "Prime", "″": "Double prime",
  "‰": "Per mille", "√": "Square root", "∂": "Partial derivative", "∫": "Integral", "∑": "Sum", "…": "Ellipsis",
  "‡": "Double dagger", "†": "Dagger", "•": "Bullet", "✱": "Asterisk", "⊕": "Circled plus", "⊖": "Circled minus", "Å": "Angstrom", "µ": "Micro",
};
const SIGNS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "plus", "minus"];

// What a screen reader says for a character: "Greek delta", "Greek capital delta", "Superscript two".
export function charName(ch: string): string {
  const g = GREEK.indexOf(ch), G = GREEK.toUpperCase().indexOf(ch), up = SUPER.indexOf(ch), down = SUB.indexOf(ch);
  if (g >= 0) return `Greek ${NAMES[g]}`;
  if (G >= 0) return `Greek capital ${NAMES[G]}`;
  if (up >= 0) return `Superscript ${SIGNS[up]}`;
  if (down >= 0) return `Subscript ${SIGNS[down]}`;
  return OTHER[ch] ?? ch;
}
