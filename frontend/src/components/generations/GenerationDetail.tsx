"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Copy, Check, Download, Trash2, Eye, Code2 } from "lucide-react";
import { GEN_APPS, deleteGeneration, getGeneration, type GenerationRecord } from "@/lib/generations";

// Full input → output view for one generation.
export function GenerationDetail({ id }: { id: string }) {
  const [rec, setRec] = useState<GenerationRecord | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [htmlView, setHtmlView] = useState<"preview" | "code">("preview");

  useEffect(() => { setRec(getGeneration(id)); }, [id]);

  if (rec === undefined) return <div className="py-16 flex justify-center"><div className="w-5 h-5 border-2 border-accent-primary/20 border-t-accent-primary rounded-full animate-spin" /></div>;
  if (rec === null) {
    return (
      <div className="rounded-card border border-border-default bg-background-surface p-8 text-center">
        <p className="text-text-secondary text-sm">This generation was not found (it may have been deleted, or lives on another device).</p>
        <Link href="/generations" className="inline-flex items-center gap-1.5 mt-3 text-accent-primary text-sm hover:underline"><ArrowLeft size={14} /> Back to generations</Link>
      </div>
    );
  }

  const meta = GEN_APPS[rec.app] ?? { label: rec.app, color: "#8891A8", icon: "FileText" };
  const copy = () => navigator.clipboard.writeText(rec.output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  const download = () => {
    const ext = rec.kind === "html" ? "html" : rec.kind === "json" ? "json" : "md";
    const mime = rec.kind === "html" ? "text/html" : rec.kind === "json" ? "application/json" : "text/markdown";
    const blob = new Blob([rec.output], { type: mime });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `${rec.app}-${rec.id}.${ext}`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link href="/generations" className="inline-flex items-center gap-1.5 text-text-secondary hover:text-text-primary text-sm"><ArrowLeft size={15} /> All generations</Link>
        <div className="flex items-center gap-2">
          {rec.kind !== "audio" && (
            <button onClick={copy} className={btn}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}</button>
          )}
          {rec.kind !== "audio" && <button onClick={download} className={btn}><Download size={13} /> Download</button>}
          <button onClick={() => { deleteGeneration(rec.id); history.back(); }} className={btn}><Trash2 size={13} /> Delete</button>
        </div>
      </div>

      <div>
        <span className="hud-label" style={{ color: meta.color }}>// {rec.appLabel}</span>
        <h1 className="font-display text-2xl font-semibold text-text-primary">{rec.title}</h1>
        <p className="text-text-muted text-xs font-mono mt-1">
          {new Date(rec.createdAt).toLocaleString()} · {rec.kind}
          {rec.meta?.provider ? ` · ${String(rec.meta.provider)}` : ""}
        </p>
      </div>

      {/* Input */}
      <section className="rounded-card border border-border-default bg-background-surface p-5">
        <div className="hud-label text-text-muted mb-3">Input</div>
        {rec.inputText && <p className="text-sm text-text-secondary whitespace-pre-wrap mb-3">{rec.inputText}</p>}
        {rec.inputs.length > 0 && (
          <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {rec.inputs.map((f, i) => (
              <div key={i} className="flex flex-col">
                <dt className="text-[11px] font-mono uppercase tracking-wider text-text-muted">{f.label}</dt>
                <dd className="text-sm text-text-primary break-words">{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {!rec.inputText && rec.inputs.length === 0 && <p className="text-text-muted text-sm">No structured input recorded.</p>}
      </section>

      {/* Output */}
      <section className="rounded-card border border-border-default bg-background-surface p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="hud-label text-text-muted">Output</div>
          {rec.kind === "html" && (
            <div className="flex rounded-card border border-border-default overflow-hidden">
              <button onClick={() => setHtmlView("preview")} className={`px-2.5 py-1 text-[11px] flex items-center gap-1 ${htmlView === "preview" ? "bg-accent-primary text-black" : "text-text-secondary"}`}><Eye size={12} /> Preview</button>
              <button onClick={() => setHtmlView("code")} className={`px-2.5 py-1 text-[11px] flex items-center gap-1 border-l border-border-default ${htmlView === "code" ? "bg-accent-primary text-black" : "text-text-secondary"}`}><Code2 size={12} /> Code</button>
            </div>
          )}
        </div>

        {rec.kind === "audio" ? (
          <div className="space-y-3">
            <audio controls src={rec.output} className="w-full" />
            {typeof rec.meta?.lyrics === "string" && rec.meta.lyrics.trim() && (
              <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono bg-background-base rounded-input p-3 border border-border-default">{rec.meta.lyrics as string}</pre>
            )}
          </div>
        ) : rec.kind === "html" ? (
          htmlView === "preview"
            ? <iframe title="output" sandbox="" srcDoc={rec.output} className="w-full h-[70vh] rounded-input border border-border-default bg-white" />
            : <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono bg-background-base rounded-input p-3 border border-border-default overflow-x-auto">{rec.output}</pre>
        ) : rec.kind === "json" ? (
          <pre className="text-xs text-text-secondary whitespace-pre-wrap font-mono bg-background-base rounded-input p-3 border border-border-default overflow-x-auto">{rec.output}</pre>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{rec.output}</ReactMarkdown>
          </div>
        )}
      </section>
    </div>
  );
}

const btn = "inline-flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default bg-background-surface text-text-secondary hover:text-text-primary hover:border-border-hover text-xs transition-colors";
