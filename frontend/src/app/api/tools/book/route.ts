import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";
import { PART_WORDS } from "@/lib/book";

export const runtime = "nodejs";
export const maxDuration = 60;

// Book Studio's writer. The outline comes from the `book` Studio tool; this
// writes it out one chapter part at a time (about 2,500 words a call, so each
// fits a function's lifetime), then drafts the store listing to publish it.
//   POST { action: "chapter", book, chapter, part, of, words, before, sofar } → { text }
//   POST { action: "listing", book, sample }                                  → { listing }

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

interface Book { title?: unknown; premise?: unknown; genre?: unknown; voice?: unknown; outline?: unknown }

function bookContext(b: Book): string {
  return [
    `Title: ${str(b.title, 200) || "Untitled"}`,
    str(b.genre, 80) && `Genre: ${str(b.genre, 80)}`,
    str(b.voice, 300) && `Voice: ${str(b.voice, 300)}`,
    str(b.premise, 2000) && `Premise: ${str(b.premise, 2000)}`,
    `Full outline:\n${str(b.outline, 12_000)}`,
  ].filter(Boolean).join("\n");
}

export async function POST(req: NextRequest) {
  if (!(await getServerSession(authOptions))?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const book = (body.book && typeof body.book === "object" ? body.book : {}) as Book;
  if (!str(book.outline, 12_000)) return Response.json({ error: "Plan the book first — the outline is missing." }, { status: 400 });

  try {
    if (body.action === "listing") {
      const out = await llmCascade({
        system: `You write Amazon KDP / Google Play Books listings that sell without hype. Return ONLY JSON:
{"title": string, "subtitle": string, "description": string, "keywords": string[7], "categories": string[3], "audience": string}
- description: 150-300 words, plain paragraphs separated by blank lines, opens with a hook, no ALL CAPS, no reviews or claims you can't back.
- keywords: 7 search phrases readers actually type (2-5 words each), not repeating the title.
- categories: 3 real BISAC-style category paths, e.g. "Fiction / Thrillers / Psychological".
- audience: one line on who it's for (and "Adult"/"Young adult"/"Children" as fits).`,
        messages: [{ role: "user", content: `${bookContext(book)}\n\nOpening pages:\n${str(body.sample, 4000)}` }],
        maxTokens: 1500, temperature: 0.6, stage: "book:listing",
      });
      const s = out.text.indexOf("{"), e = out.text.lastIndexOf("}");
      let listing: Record<string, unknown> = {};
      try { listing = JSON.parse(out.text.slice(s, e + 1)); } catch { /* reported below */ }
      if (typeof listing.description !== "string" || !Array.isArray(listing.keywords)) {
        return Response.json({ error: "The listing came back incomplete — try again." }, { status: 502 });
      }
      return Response.json({ listing: { ...listing, keywords: listing.keywords.slice(0, 7), categories: Array.isArray(listing.categories) ? listing.categories.slice(0, 3) : [] } });
    }

    const ch = (body.chapter && typeof body.chapter === "object" ? body.chapter : {}) as { n?: unknown; title?: unknown; beats?: unknown };
    const n = Number(ch.n), part = Number(body.part ?? 1), of = Number(body.of ?? 1);
    const words = Math.min(Math.max(Number(body.words) || PART_WORDS, 500), 20_000);
    if (!Number.isInteger(n) || n < 1 || !str(ch.title, 200) || !Number.isInteger(part) || !Number.isInteger(of) || part < 1 || part > of || of > 8) {
      return Response.json({ error: "A chapter needs its number, title and a valid part." }, { status: 400 });
    }
    const target = Math.round(words / of);
    const sofar = str(body.sofar, 6000);
    const out = await llmCascade({
      system: `You are writing a book, one chapter at a time, in the voice set by the outline. Write finished prose, not notes.
- Write ONLY the chapter text: no chapter heading, no title, no commentary, no "In this chapter".
- About ${target} words${of > 1 ? ` — this is part ${part} of ${of} of the chapter, so ${part < of ? "stop at a natural break without wrapping the chapter up" : "carry on from where the text left off and land the chapter's ending"}` : ""}.
- Follow the chapter's beats from the outline, in order, and stay consistent with everything before it: names, facts, timeline, tone.
- Paragraphs separated by a blank line. Scene breaks as "* * *". Use Markdown only for *emphasis*${/non-fiction|business|self-help/i.test(str(book.genre, 80)) ? " and short ## subheadings where a reader needs them" : ""}.`,
      messages: [{
        role: "user",
        content: [
          bookContext(book),
          str(body.before, 3000) && `How the previous chapter ended:\n${str(body.before, 3000)}`,
          `Now write Chapter ${n}: ${str(ch.title, 200)}\nBeats:\n${str(ch.beats, 2000)}`,
          sofar && `The chapter so far ends with:\n${sofar}\n\nContinue directly from there.`,
        ].filter(Boolean).join("\n\n"),
      }],
      maxTokens: Math.min(8000, Math.ceil(target * 1.7) + 300),
      temperature: 0.8,
      stage: "book:chapter",
    });
    const text = out.text.trim().replace(/^```[a-z]*\n?|\n?```$/g, "").replace(/^#{1,3}\s*Chapter\s+\d+[^\n]*\n+/i, "").trim();
    if (text.split(/\s+/).length < 80) return Response.json({ error: "The chapter came back too short — try again." }, { status: 502 });
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Writing failed" }, { status: 502 });
  }
}
