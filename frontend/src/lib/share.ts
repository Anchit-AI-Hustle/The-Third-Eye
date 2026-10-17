// Text and links shared to The Third Eye from another app (Android share
// sheet, the installed web app's share target, an iPhone share-sheet
// Shortcut) become a message to the assistant.

const MAX_SHARE = 4000;

export function sharedMessage(s: { title?: string | null; text?: string | null; url?: string | null }): string | null {
  const text = s.text?.trim() ?? "";
  const url = s.url?.trim() ?? "";
  const parts = [s.title?.trim(), text, url && !text.includes(url) ? url : ""].filter(Boolean);
  if (!parts.length) return null;
  return `I shared this with you. Save it as a note, then tell me in one line what it is.\n\n${parts.join("\n").slice(0, MAX_SHARE)}`;
}
