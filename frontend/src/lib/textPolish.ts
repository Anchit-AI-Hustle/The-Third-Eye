const FIXES: [RegExp, string][] = [
  [/\bpsychadelic\b/gi, "psychedelic"],
  [/\bpsycadelic\b/gi, "psychedelic"],
  [/\bpsycedelic\b/gi, "psychedelic"],
  [/\bpsychedelik\b/gi, "psychedelic"],
  [/\bpsychadelia\b/gi, "psychedelia"],
  [/\bphsytrance\b/gi, "psytrance"],
  [/\brecieve\b/gi, "receive"],
  [/\bseperate\b/gi, "separate"],
  [/\bwierd\b/gi, "weird"],
  [/\boccassion\b/gi, "occasion"],
];

function matchCase(from: string, to: string): string {
  if (from === from.toUpperCase()) return to.toUpperCase();
  if (from[0] === from[0].toUpperCase()) return to[0].toUpperCase() + to.slice(1);
  return to;
}

/** Fix a few misspellings models and prompts keep repeating. Leaves every other word alone. */
export function correctSpelling(text: string): string {
  return FIXES.reduce((s, [re, to]) => s.replace(re, (m) => matchCase(m, to)), text);
}
