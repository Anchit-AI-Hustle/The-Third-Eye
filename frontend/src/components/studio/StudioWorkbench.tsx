"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Copy, Check, Download, Sparkles, BookmarkPlus, Eye, Code2, RotateCcw } from "lucide-react";
import type { StudioTool } from "@/lib/studioTools";
import { useMode } from "@/hooks/useMode";
import { useModeTags } from "@/hooks/useModeTags";
import { dataInsert } from "@/lib/dataClient";

export function StudioWorkbench({ tool }: { tool: StudioTool }) {
  const { modeId } = useMode();
  const { tagItem } = useModeTags();
  const [inputs, setInputs] = useState<Record<string, string>>(
    () => Object.fromEntries(tool.fields.map((f) => [f.name, f.type === "select" ? f.options?.[0] ?? "" : ""])),
  );
  const [output, setOutput] = useState<string>("");
  const [provider, setProvider] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [view, setView] = useState<"preview" | "code">("preview");

  const set = (name: string) => (v: string) => setInputs((p) => ({ ...p, [name]: v }));

  async function generate() {
    setLoading(true); setError(null); setSaved(false);
    try {
      const res = await fetch("/api/tools/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool: tool.id, inputs, mode: modeId }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? `HTTP ${res.status}`); return; }
      setOutput(d.output ?? ""); setProvider(d.provider ?? ""); setView("preview");
    } catch {
      setError("Network error — please try again.");
    } finally { setLoading(false); }
  }

  function copy() {
    navigator.clipboard.writeText(output).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  function download() {
    const mime = tool.format === "html" ? "text/html" : "text/markdown";
    const blob = new Blob([output], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${tool.id}-${new Date().toISOString().slice(0, 10)}.${tool.downloadExt}`;
    a.click(); URL.revokeObjectURL(a.href);
  }

  async function saveToKnowledge() {
    const id = crypto.randomUUID();
    const title = `${tool.label}: ${inputs[tool.fields[0].name]?.slice(0, 60) || "untitled"}`;
    const doc = {
      id, title, content: output,
      file_type: tool.downloadExt,
      file_size_bytes: output.length,
      created_at: new Date().toISOString(),
      chunk_count: Math.max(1, Math.ceil(output.split(/\s+/).length / 500)),
      processing_status: "ready",
    };
    await dataInsert("knowledge_docs", doc).catch(() => {});
    tagItem(id, modeId); // mode-scope the saved doc
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-5">
      {/* Input panel */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5 space-y-4 self-start">
        {tool.fields.map((f) => (
          <div key={f.name}>
            <label className="block text-xs font-mono text-text-secondary mb-1.5">
              {f.label}{f.required && <span className="text-accent-red"> *</span>}
            </label>
            {f.type === "textarea" ? (
              <textarea value={inputs[f.name]} onChange={(e) => set(f.name)(e.target.value)}
                placeholder={f.placeholder} rows={4}
                className="w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--te-accent)] transition-colors resize-y"
                style={{ ["--te-accent" as string]: tool.accent }} />
            ) : f.type === "select" ? (
              <select value={inputs[f.name]} onChange={(e) => set(f.name)(e.target.value)}
                className="w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary outline-none">
                {f.options?.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input value={inputs[f.name]} onChange={(e) => set(f.name)(e.target.value)}
                placeholder={f.placeholder}
                className="w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[var(--te-accent)] transition-colors"
                style={{ ["--te-accent" as string]: tool.accent }} />
            )}
          </div>
        ))}
        <button onClick={generate} disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold text-[#07070F] hover:brightness-110 disabled:opacity-50 transition-all"
          style={{ background: tool.accent }}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : output ? <RotateCcw size={15} /> : <Sparkles size={15} />}
          {loading ? "Generating…" : output ? "Regenerate" : tool.cta}
        </button>
        {error && <p className="text-xs text-accent-red">{error}</p>}
      </div>

      {/* Output panel */}
      <div className="rounded-card border border-border-default bg-background-surface/40 overflow-hidden min-h-[420px] flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-default flex-wrap">
          <span className="hud-label" style={{ color: tool.accent }}>Output</span>
          {provider && <span className="text-[10px] font-mono text-text-muted">via {provider}</span>}
          {output && (
            <div className="ml-auto flex items-center gap-1.5">
              {tool.format === "html" && (
                <div className="flex rounded-input border border-border-default overflow-hidden mr-1">
                  <button onClick={() => setView("preview")} className={`px-2 py-1 text-[11px] flex items-center gap-1 ${view === "preview" ? "bg-background-elevated text-text-primary" : "text-text-muted"}`}><Eye size={11} /> Preview</button>
                  <button onClick={() => setView("code")} className={`px-2 py-1 text-[11px] flex items-center gap-1 border-l border-border-default ${view === "code" ? "bg-background-elevated text-text-primary" : "text-text-muted"}`}><Code2 size={11} /> Code</button>
                </div>
              )}
              <button onClick={copy} className="flex items-center gap-1 px-2 py-1 rounded-input border border-border-default text-[11px] text-text-secondary hover:text-text-primary">
                {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />} {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={download} className="flex items-center gap-1 px-2 py-1 rounded-input border border-border-default text-[11px] text-text-secondary hover:text-text-primary">
                <Download size={11} /> .{tool.downloadExt}
              </button>
              <button onClick={saveToKnowledge} className="flex items-center gap-1 px-2 py-1 rounded-input border border-border-default text-[11px] text-text-secondary hover:text-text-primary">
                {saved ? <Check size={11} className="text-emerald-400" /> : <BookmarkPlus size={11} />} {saved ? "Saved" : "Knowledge"}
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {!output && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 text-text-muted">
              <Sparkles size={26} className="opacity-40 mb-3" style={{ color: tool.accent }} />
              <p className="text-sm">{tool.blurb}</p>
              <p className="text-xs mt-1">Fill the brief and hit “{tool.cta}”.</p>
            </div>
          )}
          {loading && (
            <div className="h-full flex items-center justify-center text-text-muted">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {output && !loading && (
            tool.format === "html" ? (
              view === "preview" ? (
                <iframe title="preview" sandbox="allow-same-origin" srcDoc={output} className="w-full h-full min-h-[420px] bg-white" />
              ) : (
                <pre className="text-[11px] leading-relaxed text-text-secondary p-4 whitespace-pre-wrap break-words font-mono">{output}</pre>
              )
            ) : (
              <div className="prose-jarvis max-w-none p-5 text-sm text-text-secondary leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
