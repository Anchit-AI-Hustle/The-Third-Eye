import { describe, expect, it } from "vitest";
import { zipSync, strToU8, unzipSync, strFromU8 } from "fflate";
import { claudeExportPieces, pieces } from "@/lib/claudeExport";

const conversations = [
  {
    name: "Song for Riya",
    chat_messages: [
      { sender: "human", text: "", content: [{ type: "text", text: "Write a Hindi lo-fi song about monsoon for Riya." }] },
      { sender: "assistant", text: "Here is a draft: Baarish ki boondein…", content: [] },
    ],
  },
  { name: "Empty", chat_messages: [] },
];
const projects = [
  { name: "Music Studio", description: "My songs", prompt_template: "Always write lyrics in Hinglish.", docs: [{ filename: "style.md", content: "Vocals: warm male baritone." }] },
];

describe("reading a Claude export", () => {
  it("turns each chat into a dialogue piece with its topic, and skips empty chats", () => {
    const out = claudeExportPieces({ "conversations.json": JSON.stringify(conversations) });
    expect(out).toEqual(["Topic: Song for Riya\nI said: Write a Hindi lo-fi song about monsoon for Riya.\nClaude said: Here is a draft: Baarish ki boondein…"]);
  });

  it("keeps each project's instructions and documents", () => {
    const [p] = claudeExportPieces({ "data/projects.json": JSON.stringify(projects) });
    expect(p).toContain("Topic: my project Music Studio");
    expect(p).toContain("My standing instructions for it: Always write lyrics in Hinglish.");
    expect(p).toContain("From my document style.md: Vocals: warm male baritone.");
  });

  it("ignores other files and anything that is not valid JSON", () => {
    expect(claudeExportPieces({ "users.json": "[]", "conversations.json": "not json" })).toEqual([]);
  });

  it("reads the files out of the export zip", () => {
    const zip = zipSync({ "conversations.json": strToU8(JSON.stringify(conversations)), "README.txt": strToU8("hi") });
    const files = Object.fromEntries(Object.entries(unzipSync(zip, { filter: (e) => e.name.endsWith(".json") })).map(([k, v]) => [k, strFromU8(v)]));
    expect(claudeExportPieces(files)).toHaveLength(1);
  });

  it("splits a long chat into pieces that each fit and carry the topic", () => {
    const out = pieces("Long talk", Array.from({ length: 40 }, (_, i) => `I said: line ${i} ${"x".repeat(200)}`));
    expect(out.length).toBeGreaterThan(1);
    for (const piece of out) {
      expect(piece.length).toBeLessThanOrEqual(1800);
      expect(piece.startsWith("Topic: Long talk\n")).toBe(true);
    }
  });
});
