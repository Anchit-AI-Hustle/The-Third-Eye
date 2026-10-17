// Text out of PDF and Word files, for Knowledge. Loaded only when such a file
// is uploaded: pdf.js (through unpdf, which needs no worker) is large.

export async function extractDocText(name: string, bytes: Uint8Array): Promise<string> {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  if (ext === ".doc") throw new Error("Old .doc files can't be read here. Save it as .docx or PDF and upload that.");
  const text = ext === ".pdf" ? await pdfText(bytes) : await docxText(bytes);
  const clean = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) throw new Error(ext === ".pdf" ? "This PDF has no selectable text (it may be a scan)." : "This document has no text.");
  return clean;
}

async function pdfText(bytes: Uint8Array): Promise<string> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const doc = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(doc, { mergePages: false });
    return text.join("\n\n");
  } catch {
    throw new Error("Couldn't read this PDF. It may be damaged or password-protected.");
  }
}

async function docxText(bytes: Uint8Array): Promise<string> {
  let xml: string;
  try {
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
    xml = strFromU8(files["word/document.xml"]);
  } catch {
    throw new Error("Couldn't read this Word file. It may be damaged; try saving it again as .docx.");
  }
  return xml
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>|<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}
