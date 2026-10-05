"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Download, ExternalLink, Loader2, PenLine, Store, Copy, Check } from "lucide-react";
import { parseOutline, partsFor, buildEpub, crc32, type OutlineChapter } from "@/lib/book";
import { recordGeneration } from "@/lib/generations";
import { AiFieldBar } from "@/components/studio/AiFieldBar";

// Writes the planned book out chapter by chapter, keeps the draft in this
// browser as it goes (a book is too long to lose to a closed tab), then packs
// the manuscript as an EPUB and drafts the store listing to publish it with.

interface Listing { title?: string; subtitle?: string; description: string; keywords: string[]; categories?: string[]; audience?: string }
type Status = { busy: boolean; msg?: string };

const STORES = [
  { label: "Kindle Direct Publishing", href: "https://kdp.amazon.com/en_US/title-setup/kindle/new/details" },
  { label: "Google Play Books", href: "https://play.google.com/books/publish/" },
  { label: "Draft2Digital (Apple, Kobo, B&N…)", href: "https://draft2digital.com/book/new" },
];

const words = (t: string) => (t.trim() ? t.trim().split(/\s+/).length : 0);

function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked — the draft stays on screen */ }
}

function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function BookWriter({ outline, inputs, accent }: { outline: string; inputs: Record<string, string>; accent: string }) {
  const { meta, chapters } = useMemo(() => parseOutline(outline), [outline]);
  const key = `book-studio:${crc32(new TextEncoder().encode(outline)).toString(16)}`;
  const [texts, setTexts] = useState<Record<number, string>>({});
  const [author, setAuthor] = useState("");
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [open, setOpen] = useState<number | null>(null);
  const [writingAll, setWritingAll] = useState(false);
  const [listing, setListing] = useState<Listing | null>(null);
  const [listingState, setListingState] = useState<Status>({ busy: false });
  const [copied, setCopied] = useState<string | null>(null);
  const stop = useRef(false);
  // Chapters are written back to back; each needs the one before it as it is
  // now, not as it was when "Write every chapter" was pressed.
  const latest = useRef(texts);
  latest.current = texts;

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? "null") as { texts?: Record<number, string>; author?: string; listing?: Listing } | null;
      setTexts(saved?.texts ?? {});
      setAuthor(saved?.author ?? "");
      setListing(saved?.listing ?? null);
    } catch { setTexts({}); }
  }, [key]);
  useEffect(() => { save(key, { texts, author, listing }); }, [key, texts, author, listing]);

  const perChapter = Number(inputs.length) || 2500;
  const book = { title: meta.title, premise: inputs.premise, genre: inputs.genre, voice: inputs.voice, outline };
  const written = chapters.filter((c) => texts[c.n]?.trim());
  const total = written.reduce((s, c) => s + words(texts[c.n]), 0);

  async function writeChapter(c: OutlineChapter): Promise<boolean> {
    const of = partsFor(perChapter);
    const prev = chapters[chapters.indexOf(c) - 1];
    let text = "";
    setStatus((s) => ({ ...s, [c.n]: { busy: true, msg: of > 1 ? `part 1 of ${of}` : undefined } }));
    try {
      for (let part = 1; part <= of; part++) {
        if (part > 1) setStatus((s) => ({ ...s, [c.n]: { busy: true, msg: `part ${part} of ${of}` } }));
        const res = await fetch("/api/tools/book", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "chapter", book, chapter: c, part, of, words: perChapter,
            before: prev ? (latest.current[prev.n] ?? "").slice(-2000) : "",
            sofar: text.slice(-3000),
          }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.text) throw new Error(d.error ?? `HTTP ${res.status}`);
        text = text ? `${text}\n\n${d.text}` : d.text;
      }
      latest.current = { ...latest.current, [c.n]: text };
      setTexts((t) => ({ ...t, [c.n]: text }));
      setStatus((s) => ({ ...s, [c.n]: { busy: false } }));
      return true;
    } catch (e) {
      setStatus((s) => ({ ...s, [c.n]: { busy: false, msg: e instanceof Error ? e.message : "Writing failed" } }));
      return false;
    }
  }

  async function writeAll() {
    setWritingAll(true); stop.current = false;
    // In order, so each chapter picks up from how the one before it actually ended.
    for (const c of chapters) {
      if (stop.current) break;
      if (latest.current[c.n]?.trim()) continue;
      if (!(await writeChapter(c))) break;
    }
    setWritingAll(false);
  }

  const bookMeta = () => ({ title: listing?.title || meta.title, subtitle: listing?.subtitle || meta.subtitle, author: author.trim() || "Anonymous", language: "en" });
  const slug = meta.title.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "book";

  const manuscript = () => [`# ${bookMeta().title}`, bookMeta().subtitle, `by ${bookMeta().author}`,
    ...written.map((c) => `## Chapter ${c.n}: ${c.title}\n\n${texts[c.n]}`)].filter(Boolean).join("\n\n");

  function exportEpub() {
    const epub = buildEpub(bookMeta(), written.map((c) => ({ title: `Chapter ${c.n}: ${c.title}`, text: texts[c.n] })), `urn:uuid:${crypto.randomUUID()}`);
    download(`${slug}.epub`, epub.slice().buffer, "application/epub+zip");
    recordGeneration({
      app: "book", appLabel: "Book Studio", tool: "book", title: meta.title, kind: "markdown",
      inputs: [{ label: "Premise", value: inputs.premise ?? "" }, { label: "Chapters", value: `${written.length} of ${chapters.length}` }],
      output: manuscript(), meta: { words: total },
    });
  }

  async function makeListing() {
    setListingState({ busy: true });
    try {
      const res = await fetch("/api/tools/book", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "listing", book, sample: written[0] ? texts[written[0].n].slice(0, 4000) : "" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.listing) throw new Error(d.error ?? `HTTP ${res.status}`);
      setListing(d.listing);
      setListingState({ busy: false });
    } catch (e) {
      setListingState({ busy: false, msg: e instanceof Error ? e.message : "Listing failed" });
    }
  }

  function copy(label: string, text: string) {
    void navigator.clipboard.writeText(text).then(() => { setCopied(label); setTimeout(() => setCopied(null), 1500); });
  }

  if (!chapters.length) {
    return <p className="border-t border-border-default p-5 text-xs text-warning">The outline has no “### Chapter N: …” headings to write from — plan the book again.</p>;
  }

  const btn = "flex items-center gap-1.5 px-2.5 py-1 rounded-input border border-border-default text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-50";
  const primary = "flex items-center gap-1.5 px-3 py-1.5 rounded-input text-[11px] font-semibold text-[#07070F] hover:brightness-110 disabled:opacity-50";

  return (
    <div className="border-t border-border-default p-5 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <BookOpen size={15} style={{ color: accent }} />
        <span className="hud-label" style={{ color: accent }}>Write the book</span>
        <span className="text-[11px] font-mono text-text-muted">{written.length}/{chapters.length} chapters · {total.toLocaleString("en-IN")} words</span>
        <div className="ml-auto flex items-center gap-1.5">
          {writingAll
            ? <button onClick={() => { stop.current = true; }} className={btn}>Stop after this chapter</button>
            : written.length < chapters.length && (
              <button onClick={writeAll} className={primary} style={{ background: accent }}>
                <PenLine size={12} /> Write {written.length ? "the rest" : "every chapter"}
              </button>
            )}
        </div>
      </div>
      {chapters.length < (Number(inputs.chapters) || 0) && (
        <p className="text-xs text-warning">The outline came back with {chapters.length} of the {inputs.chapters} chapters asked for — plan the book again for the full set.</p>
      )}
      <p className="text-xs text-text-muted">
        Each chapter is written in order, about {perChapter.toLocaleString("en-IN")} words, picking up from how the last one ended. The draft is kept in this browser as you go; edit any chapter before you export.
      </p>

      <div className="space-y-2">
        {chapters.map((c) => {
          const st = status[c.n] ?? { busy: false };
          const text = texts[c.n] ?? "";
          return (
            <div key={c.n} className="rounded-input border border-border-default bg-background-base p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => setOpen(open === c.n ? null : c.n)} className="text-xs font-semibold text-text-primary text-left">
                  {c.n}. {c.title}
                </button>
                {text && <span className="text-[10px] font-mono text-text-muted">{words(text).toLocaleString("en-IN")} words</span>}
                {st.busy && st.msg && <span className="text-[10px] font-mono text-text-muted">{st.msg}</span>}
                <button onClick={() => writeChapter(c)} disabled={st.busy || writingAll} className={`ml-auto ${btn}`}>
                  {st.busy ? <Loader2 size={11} className="animate-spin" /> : <PenLine size={11} />}
                  {st.busy ? "Writing…" : text ? "Rewrite" : "Write"}
                </button>
              </div>
              {!st.busy && st.msg && <p className="text-[11px] text-accent-red">{st.msg}</p>}
              {open === c.n && (
                <>
                  <p className="text-[11px] text-text-muted whitespace-pre-line">{c.beats}</p>
                  <div className="flex flex-wrap items-center text-xs font-mono text-text-secondary">
                    <span>Chapter draft</span>
                    <AiFieldBar tool={{ label: "Book Studio", purpose: "one chapter of a book, in the book's voice, continuing from the beats" }}
                      field={{ name: `chapter-${c.n}`, label: `Chapter ${c.n}: ${c.title}`, type: "textarea", placeholder: "the chapter prose" }}
                      value={text}
                      context={{ Premise: inputs.premise ?? "", Title: meta.title || inputs.title || "", Voice: inputs.voice ?? "", Beats: c.beats }}
                      onChange={(v) => setTexts((t) => ({ ...t, [c.n]: v }))} />
                  </div>
                  <textarea value={text} onChange={(e) => setTexts((t) => ({ ...t, [c.n]: e.target.value }))} rows={14}
                    placeholder="Suggest a draft from the beats, or write it yourself."
                    className="w-full bg-background-surface border border-border-default rounded-input px-3 py-2 text-sm text-text-primary leading-relaxed outline-none resize-y" />
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-input border p-3 space-y-3" style={{ borderColor: accent }}>
        <div className="flex items-center gap-2 flex-wrap">
          <Store size={14} style={{ color: accent }} />
          <span className="text-xs font-semibold text-text-primary">Publish</span>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name (pen name is fine)"
            className="ml-auto w-56 bg-background-base border border-border-default rounded-input px-2 py-1 text-xs text-text-primary outline-none" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={exportEpub} disabled={!written.length} className={primary} style={{ background: accent }}>
            <Download size={12} /> EPUB{written.length < chapters.length ? ` (${written.length} ch.)` : ""}
          </button>
          <button onClick={() => download(`${slug}.md`, manuscript(), "text/markdown")} disabled={!written.length} className={btn}>
            <Download size={11} /> Manuscript .md
          </button>
          <button onClick={makeListing} disabled={listingState.busy} className={btn}>
            {listingState.busy ? <Loader2 size={11} className="animate-spin" /> : <Store size={11} />}
            {listing ? "Redo store listing" : "Write store listing"}
          </button>
        </div>
        {listingState.msg && <p className="text-[11px] text-accent-red">{listingState.msg}</p>}
        {listing && (
          <div className="space-y-2 text-[11px]">
            {([
              ["Title", listing.title ?? meta.title],
              ["Subtitle", listing.subtitle ?? ""],
              ["Description", listing.description],
              ["Keywords (7 boxes)", listing.keywords.join("\n")],
              ["Categories", (listing.categories ?? []).join("\n")],
              ["Audience", listing.audience ?? ""],
            ] as const).filter(([, v]) => v).map(([label, value]) => (
              <div key={label}>
                <div className="flex items-center gap-2">
                  <span className="hud-label text-text-muted">{label}</span>
                  <button onClick={() => copy(label, value)} className="text-text-muted hover:text-text-primary" aria-label={`Copy ${label}`}>
                    {copied === label ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  </button>
                </div>
                <p className="text-text-secondary whitespace-pre-line">{value}</p>
              </div>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-3 pt-1">
          {STORES.map((s) => (
            <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary">
              <ExternalLink size={11} /> {s.label}
            </a>
          ))}
        </div>
        <p className="text-[10px] text-text-muted">
          These stores have no publishing API, so the last step is yours: upload the EPUB, paste the listing, add a cover, set the price. Mark the book as AI-assisted where the store asks.
        </p>
      </div>
    </div>
  );
}
