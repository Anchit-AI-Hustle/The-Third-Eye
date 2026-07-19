"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Music, Play, Download, Sparkles, AlertTriangle, Copy, Check } from "lucide-react";

const GENRES = ["Lo-fi", "Pop", "Cinematic", "Acoustic", "EDM", "Hip-hop", "Ambient", "Rock", "Classical", "Indie"];
const MOODS = ["Uplifting", "Chill", "Energetic", "Melancholic", "Dreamy", "Epic", "Romantic", "Playful"];

type Phase = "idle" | "generating" | "queued" | "ready" | "error";

export function MusicStudio() {
  const [brief, setBrief] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [mood, setMood] = useState(MOODS[0]);
  const [vocals, setVocals] = useState(true);
  const [duration, setDuration] = useState(20);

  const [phase, setPhase] = useState<Phase>("idle");
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }, []);
  useEffect(() => () => stopPoll(), [stopPoll]);

  async function generate() {
    stopPoll();
    setPhase("generating"); setError(null); setAudioUrl(null); setNote(null); setStatus("Writing the track…");
    try {
      const res = await fetch("/api/tools/music", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, genre, mood, vocals, duration }),
      });
      const d = await res.json();
      if (!res.ok) { setPhase("error"); setError(d.error ?? `HTTP ${res.status}`); if (d.prompt) setPrompt(d.prompt); if (d.lyrics) setLyrics(d.lyrics); return; }
      setPrompt(d.prompt ?? ""); setLyrics(d.lyrics ?? "");
      if (d.configured === false) {
        // No Replicate key — show prompt + lyrics so the work isn't lost.
        setPhase("error"); setNote(d.note ?? "Music generation isn't configured."); return;
      }
      if (d.fellBackToInstrumental) setNote("The vocal model was unavailable, so this is an instrumental version.");
      setPhase("queued"); setStatus("Composing audio… this can take up to a minute.");
      poll(d.jobId);
    } catch {
      setPhase("error"); setError("Network error — please try again.");
    }
  }

  function poll(jobId: string) {
    stopPoll();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/tools/music?id=${encodeURIComponent(jobId)}`);
        const d = await res.json();
        if (d.status) setStatus(`Composing audio… (${d.status})`);
        if (d.status === "succeeded" && d.audioUrl) { stopPoll(); setAudioUrl(d.audioUrl); setPhase("ready"); setStatus(""); }
        else if (d.status === "failed" || d.status === "canceled" || d.error) { stopPoll(); setPhase("error"); setError(d.error ?? "Generation failed."); }
      } catch { /* keep polling */ }
    }, 3000);
  }

  const busy = phase === "generating" || phase === "queued";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,340px)_1fr] gap-5">
      {/* Controls */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-4 sm:p-5 space-y-4 self-start">
        <div>
          <label className="block text-xs font-mono text-text-secondary mb-1.5">Describe the track <span className="text-accent-red">*</span></label>
          <textarea value={brief} onChange={(e) => setBrief(e.target.value)} rows={4}
            placeholder="e.g. a warm lo-fi track for a rainy morning, soft piano and vinyl crackle"
            className="w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[#34D399] transition-colors resize-y" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-mono text-text-secondary mb-1.5">Genre</label>
            <select value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary outline-none">
              {GENRES.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-mono text-text-secondary mb-1.5">Mood</label>
            <select value={mood} onChange={(e) => setMood(e.target.value)} className="w-full bg-background-base border border-border-default rounded-input px-3 py-2 text-sm text-text-primary outline-none">
              {MOODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <label className="text-xs font-mono text-text-secondary">Vocals + lyrics</label>
          <button onClick={() => setVocals(!vocals)}
            className={`relative w-9 h-5 rounded-full transition-colors ${vocals ? "bg-[#34D399]" : "bg-border-default"}`}>
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${vocals ? "left-4" : "left-0.5"}`} />
          </button>
        </div>
        <div>
          <label className="block text-xs font-mono text-text-secondary mb-1.5">Length: {duration}s</label>
          <input type="range" min={5} max={60} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full accent-[#34D399]" />
        </div>
        <button onClick={generate} disabled={busy || !brief.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-input text-sm font-semibold text-[#07070F] bg-[#34D399] hover:brightness-110 disabled:opacity-50 transition-all">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {phase === "generating" ? "Writing…" : phase === "queued" ? "Composing…" : "Generate music"}
        </button>
        {note && <p className="text-xs text-[#F0C94E] flex items-start gap-1.5"><AlertTriangle size={12} className="flex-none mt-0.5" />{note}</p>}
        {error && <p className="text-xs text-accent-red">{error}</p>}
      </div>

      {/* Output */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-5 min-h-[420px]">
        {phase === "idle" && (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-muted py-16">
            <Music size={28} className="opacity-40 mb-3 text-[#34D399]" />
            <p className="text-sm">Describe a track and hit “Generate music”.</p>
            <p className="text-xs mt-1">You'll get a playable, downloadable audio track — instrumental or with AI vocals.</p>
          </div>
        )}

        {busy && (
          <div className="h-full flex flex-col items-center justify-center text-center text-text-secondary py-16">
            <Loader2 size={24} className="animate-spin text-[#34D399] mb-3" />
            <p className="text-sm">{status}</p>
          </div>
        )}

        {audioUrl && phase === "ready" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#34D399]"><Play size={16} /><span className="hud-label text-[#34D399]">Your track</span></div>
            <audio controls src={audioUrl} className="w-full" />
            <a href={audioUrl} download className="inline-flex items-center gap-1.5 px-3 py-2 rounded-input border border-border-default text-xs text-text-secondary hover:text-text-primary">
              <Download size={12} /> Download .mp3
            </a>
          </div>
        )}

        {(prompt || lyrics) && (
          <div className="mt-6 pt-5 border-t border-border-default space-y-4">
            {prompt && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="hud-label text-text-muted">Style prompt</span>
                  <button onClick={() => { navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
                    className="flex items-center gap-1 text-[11px] text-text-muted hover:text-text-primary">
                    {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />} copy
                  </button>
                </div>
                <p className="text-sm text-text-secondary">{prompt}</p>
              </div>
            )}
            {lyrics && (
              <div>
                <span className="hud-label text-text-muted">Lyrics</span>
                <div className="prose-jarvis max-w-none text-sm text-text-secondary mt-1">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{lyrics}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
