import { describe, expect, it, vi } from "vitest";
import { dictatable, insertDictation, shapeFor } from "@/lib/dictation";

function field(html: string) {
  document.body.innerHTML = html;
  return document.body.querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement;
}

describe("which fields take dictation", () => {
  it("takes text, search, email, url, phone, number and textareas", () => {
    for (const html of ['<input type="text">', '<input type="search">', '<input type="email">', '<input type="url">', '<input type="tel">', '<input type="number">', "<input>", "<textarea></textarea>"]) {
      expect(dictatable(field(html))).toBe(true);
    }
  });

  it("never takes secrets, disabled or read-only fields, or ones that opted out", () => {
    for (const html of [
      '<input type="password">', '<input name="pin">', '<input autocomplete="one-time-code">',
      '<input placeholder="Unlock code">', '<input aria-label="Code from Safari">', '<input placeholder="API key / token (optional)">',
      "<input disabled>", "<input readonly>", '<input type="checkbox">', '<input type="file">',
      "<div data-no-dictate><textarea></textarea></div>",
    ]) {
      expect(dictatable(field(html))).toBe(false);
    }
  });
});

describe("shaping speech for the field", () => {
  it("turns spoken email and web addresses into the real thing", () => {
    expect(shapeFor("email", "Anchit dot Tandon at gmail dot com")).toBe("anchit.tandon@gmail.com");
    expect(shapeFor("url", "example dot com slash pricing")).toBe("example.com/pricing");
  });

  it("keeps only what a number or phone field accepts", () => {
    expect(shapeFor("number", "two five point five")).toBe("25.5");
    expect(shapeFor("tel", "plus nine one 98765 43210")).toBe("+919876543210");
  });

  it("leaves ordinary text as said", () => {
    expect(shapeFor("text", " Buy milk and eggs ")).toBe("Buy milk and eggs");
  });
});

describe("inserting into the field", () => {
  it("puts words at the cursor with a space, and React hears the change", () => {
    const el = field('<input type="text">') as HTMLInputElement;
    el.value = "Call mom";
    el.setSelectionRange(8, 8);
    const onInput = vi.fn();
    el.addEventListener("input", onInput);
    insertDictation(el, "at six");
    expect(el.value).toBe("Call mom at six");
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(el.selectionStart).toBe(15);
  });

  it("appends to an email field, which has no cursor position", () => {
    const el = field('<input type="email">') as HTMLInputElement;
    insertDictation(el, "ada at example dot com");
    expect(el.value).toBe("ada@example.com");
  });
});
