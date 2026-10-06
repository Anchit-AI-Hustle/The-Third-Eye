"use client";
import { useEffect, useState } from "react";
import { saveMedia } from "@/lib/mediaFile";

export function MediaJob({ ticket }: { ticket: string }) {
  const [job, setJob] = useState<{ kind?: string; status?: string; url?: string; error?: string }>({ status: "loading" });
  const [downloadError, setDownloadError] = useState("");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    async function poll() {
      try {
        const res = await fetch(`/api/generation-job?ticket=${encodeURIComponent(ticket)}`, { signal: controller.signal });
        const data = await res.json();
        if (!active) return;
        setJob(data);
        if (res.ok && !["succeeded", "failed", "canceled"].includes(data.status)) timer = setTimeout(poll, 3000);
      } catch {
        if (active) setJob({ error: "Could not reach the server. Reload to check the job again." });
      }
    }
    poll();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [ticket]);
  return <main className="max-w-3xl mx-auto p-6 space-y-4">
    <h1 className="text-xl text-text-primary">Generated media</h1>
    <p role="status" className="text-text-secondary">{job.error || `Status: ${job.status}`}</p>
    {job.url && <>
      {job.kind === "image" ? <img src={job.url} alt="Generated result" className="max-w-full rounded-card" /> : job.kind === "music" ? <audio controls src={job.url} /> : <video controls src={job.url} className="max-w-full rounded-card" />}
      <button className="text-accent-blue underline" onClick={async () => {
        try { await saveMedia(job.url!, `generated-${job.kind}`); }
        catch { setDownloadError("Download failed. Try opening the output link below."); }
      }}>Download result</button>
      <a href={job.url} target="_blank" rel="noopener noreferrer" className="block text-accent-blue underline">Open output</a>
      {downloadError && <p role="alert">{downloadError}</p>}
      <p className="text-xs text-text-muted">Download your result now; provider files expire.</p>
    </>}
  </main>;
}
