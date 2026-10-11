import { describe, expect, it } from "vitest";
import { attachmentsAsText, cleanAttachments, geminiParts, MAX_ATTACHMENTS } from "@/lib/attachments";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("chat attachments", () => {
  it("keeps readable files and drops unsupported or malformed ones", () => {
    const out = cleanAttachments([
      { name: "a.pdf", mimeType: "application/pdf", data: b64("%PDF") },
      { name: "b.png", mimeType: "image/png", data: b64("png") },
      { name: "c.exe", mimeType: "application/x-msdownload", data: b64("MZ") },
      { name: "d.txt", mimeType: "text/plain", data: "" },
      "junk",
    ]);
    expect(out.map((a) => a.name)).toEqual(["a.pdf", "b.png"]);
  });

  it("caps the count and the total size", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ name: `${i}.txt`, mimeType: "text/plain", data: b64("x") }));
    expect(cleanAttachments(many)).toHaveLength(MAX_ATTACHMENTS);
    const huge = { name: "big.txt", mimeType: "text/plain", data: "A".repeat(5 * 1024 * 1024) };
    expect(cleanAttachments([huge])).toEqual([]);
  });

  it("sends files to Gemini inline and to text-only models as text or a notice", () => {
    const atts = cleanAttachments([
      { name: "notes.txt", mimeType: "text/plain", data: b64("Ship by Friday") },
      { name: "scan.pdf", mimeType: "application/pdf", data: b64("%PDF") },
    ]);
    expect(geminiParts(atts)[0]).toEqual({ inlineData: { mimeType: "text/plain", data: b64("Ship by Friday") } });
    const text = attachmentsAsText(atts);
    expect(text).toContain("Ship by Friday");
    expect(text).toContain('application/pdf "scan.pdf"');
  });
});
