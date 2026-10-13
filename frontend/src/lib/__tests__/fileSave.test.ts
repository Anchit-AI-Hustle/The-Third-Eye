import { describe, expect, it } from "vitest";
import { safeFilename, viewerHtml, MAX_FILE_CHARS, forHistory, KEEP_FILE_CHARS } from "@/lib/fileSave";

describe("files JARVIS saves for the user", () => {
  it("keeps a plain name and its extension, and strips any path", () => {
    expect(safeFilename("index.html", "text/html")).toBe("index.html");
    expect(safeFilename("../../etc/passwd", "text/plain")).toBe("passwd.txt");
    expect(safeFilename("Times Yoga Portal", "text/html")).toBe("Times-Yoga-Portal.html");
    expect(safeFilename("", "application/json")).toBe("file.json");
  });

  it("opens HTML in a sandbox with no access to the app's cookies or storage", () => {
    const page = viewerHtml({ filename: "index.html", mime: "text/html", content: `<script>alert("x")</script><p>"hi"</p>` });
    const sandbox = page.match(/sandbox="([^"]*)"/)?.[1] ?? "";
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
    expect(page).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(page).toContain("<title>index.html</title>");
  });

  it("shows text files as text, never as markup", () => {
    const page = viewerHtml({ filename: "notes.txt", mime: "text/plain", content: "<b>not bold</b>" });
    expect(page).toContain("<pre>&lt;b&gt;not bold&lt;/b&gt;</pre>");
    expect(page).not.toContain("<iframe");
  });

  it("caps file size so a runaway reply cannot fill the browser", () => {
    expect(MAX_FILE_CHARS).toBe(1_000_000);
  });

  it("keeps small files in chat history and drops the contents of big ones", () => {
    const small = { filename: "a.csv", mime: "text/csv", content: "a,b" };
    const big = { filename: "b.html", mime: "text/html", content: "x".repeat(KEEP_FILE_CHARS + 1) };
    expect(forHistory([small, big])).toEqual([small, { ...big, content: "" }]);
  });
});
