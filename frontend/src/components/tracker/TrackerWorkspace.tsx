"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Radio, ListChecks } from "lucide-react";
import { CaptureClient } from "@/components/capture/CaptureClient";
import { TasksClient } from "@/components/tasks/TasksClient";
import { useCapture } from "@/components/capture/CaptureContext";

// The unified Task Tracker workspace. One feature, two intake paths:
//   1. Live Capture — the mic listens and auto-extracts action items.
//   2. Ingestion    — Gmail + Google Chat of the linked account are scraped
//                     (headless via IngestBridge, or on-demand "Scan now").
// Both write into the same task store that the Tracker below reads, so a task
// is a task no matter where it came from. The capture/sources panel is
// collapsible so the tracker stays the centre of gravity once it's populated.

const PANEL_KEY = "te_tracker_capture_open_v1";

export function TrackerWorkspace() {
  const { listening, analyzing, tasks: liveTasks } = useCapture();
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Default open on first visit; remember the user's choice afterwards.
    const pref = localStorage.getItem(PANEL_KEY);
    setOpen(pref === null ? true : pref === "1");
    setHydrated(true);
  }, []);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      try { localStorage.setItem(PANEL_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };

  return (
    <div className="space-y-6">
      {/* Capture & Sources — collapsible intake panel */}
      <section className="rounded-card border border-border-default bg-background-surface/30 overflow-hidden">
        <button
          onClick={toggle}
          className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-background-surface/50 transition-colors"
        >
          <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-none bg-[#4FC3F7]/10 text-[#4FC3F7]">
            <Radio size={16} className={listening ? "animate-pulse" : ""} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-text-primary text-sm">Live Capture &amp; Sources</span>
              {listening && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-accent-red/50 text-accent-red flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-red animate-pulse" /> live
                </span>
              )}
              {analyzing && <span className="text-[10px] font-mono text-text-muted">analyzing…</span>}
            </div>
            <div className="text-[11px] text-text-muted mt-0.5">
              Mic + Gmail &amp; Chat feed this tracker automatically
              {liveTasks.length > 0 && !open ? ` · ${liveTasks.length} detected this session` : ""}
            </div>
          </div>
          <ChevronDown
            size={16}
            className={`text-text-muted flex-none transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {hydrated && open && (
          <div className="px-4 sm:px-5 pb-5 pt-1 border-t border-border-default">
            <CaptureClient />
          </div>
        )}
      </section>

      {/* The tracker itself — fed by every source above plus manual entry */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <ListChecks size={15} className="text-[#4FC3F7]" />
          <span className="hud-label text-text-muted">Tasks</span>
        </div>
        <TasksClient />
      </section>
    </div>
  );
}
