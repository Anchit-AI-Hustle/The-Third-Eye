// Voice input for every text field: which fields take it, how spoken words
// are shaped for the field's type, and how they reach a React-controlled input.

export type DictationField = HTMLInputElement | HTMLTextAreaElement;

const TEXT_TYPES = new Set(["text", "search", "email", "url", "tel", "number", ""]);
// Fields whose value must not be said out loud, whatever their input type.
const SECRET = /\b(pin|password|passcode|otp|one-time-code|cvv|secret|token|api key|unlock code|code from)\b/i;

/** A field speech can fill. Passwords and PINs are never dictated aloud. */
export function dictatable(el: EventTarget | null): el is DictationField {
  if (!(el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) return false;
  if (el.disabled || el.readOnly || el.closest("[data-no-dictate]")) return false;
  if (el instanceof HTMLInputElement) {
    if (!TEXT_TYPES.has(el.type)) return false;
    const about = `${el.name} ${el.id} ${el.autocomplete} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`;
    if (SECRET.test(about)) return false;
  }
  return true;
}

const SPOKEN_NUMBERS: Record<string, string> = {
  zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5",
  six: "6", seven: "7", eight: "8", nine: "9", point: ".", dot: ".", minus: "-", plus: "+",
};

/** Spoken words in the form the field accepts. */
export function shapeFor(type: string, spoken: string): string {
  const said = spoken.trim();
  if (type === "email") {
    return said.toLowerCase()
      .replace(/\s+at\s+/g, "@").replace(/\s+dot\s+/g, ".")
      .replace(/\s+underscore\s+/g, "_").replace(/\s+(?:dash|hyphen)\s+/g, "-")
      .replace(/\s+/g, "");
  }
  if (type === "url") return said.toLowerCase().replace(/\s+dot\s+/g, ".").replace(/\s+slash\s+/g, "/").replace(/\s+/g, "");
  if (type === "number" || type === "tel") {
    const words = said.toLowerCase().split(/\s+/).map((w) => SPOKEN_NUMBERS[w] ?? w).join(" ");
    return type === "number" ? words.replace(/[^\d.-]/g, "") : words.replace(/[^\d+]/g, "");
  }
  return said;
}

/** Puts text at the cursor and tells React the value changed. */
export function insertDictation(el: DictationField, spoken: string) {
  const type = el instanceof HTMLInputElement ? el.type : "textarea";
  const text = shapeFor(type, spoken);
  if (!text) return;
  let start = el.value.length;
  let end = start;
  try {
    start = el.selectionStart ?? start;
    end = el.selectionEnd ?? end;
  } catch { /* email/number inputs have no selection: append */ }
  const before = el.value.slice(0, start);
  const after = el.value.slice(end);
  const joined = type === "textarea" || ["text", "search", ""].includes(type);
  const lead = joined && before && !/\s$/.test(before) ? " " : "";
  const next = `${before}${lead}${text}${after}`;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = before.length + lead.length + text.length;
  try { el.setSelectionRange(caret, caret); } catch { /* no selection on this type */ }
}
