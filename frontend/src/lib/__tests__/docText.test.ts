import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { extractDocText } from "@/lib/docText";

// A real one-page PDF with a text stream, offsets and all.
function pdf(lines: string[]): Uint8Array {
  const content = `BT /F1 18 Tf 72 720 Td 22 TL ${lines.map((l) => `(${l}) Tj T*`).join(" ")} ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(out);
}

function docx(paragraphs: string[]): Uint8Array {
  const body = paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join("");
  return zipSync({
    "[Content_Types].xml": strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    "word/document.xml": strToU8(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`),
  });
}

describe("document text extraction", () => {
  it("reads the text of a PDF", async () => {
    const text = await extractDocText("report.pdf", pdf(["Quarterly revenue grew 18 percent", "Churn fell to 2 percent"]));
    expect(text).toContain("Quarterly revenue grew 18 percent");
    expect(text).toContain("Churn fell to 2 percent");
  });

  it("reads a Word document paragraph by paragraph, with entities decoded", async () => {
    const text = await extractDocText("notes.docx", docx(["First point &amp; detail", "Second point"]));
    expect(text).toBe("First point & detail\nSecond point");
  });

  it("refuses a file it cannot read instead of storing junk", async () => {
    await expect(extractDocText("broken.pdf", strToU8("not a pdf at all"))).rejects.toThrow(/couldn't read/i);
    await expect(extractDocText("broken.docx", strToU8("not a zip"))).rejects.toThrow(/couldn't read/i);
    await expect(extractDocText("old.doc", strToU8("\xd0\xcf\x11\xe0"))).rejects.toThrow(/\.docx or PDF/);
  });

  it("says when a PDF has no text layer, such as a scan", async () => {
    await expect(extractDocText("scan.pdf", pdf([]))).rejects.toThrow(/no selectable text/i);
  });
});
