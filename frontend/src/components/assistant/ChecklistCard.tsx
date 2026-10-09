"use client";

import { CheckCircle2, Circle, Loader2, Hourglass, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Step } from "@/lib/checklist";

const ICON = {
  done: <CheckCircle2 size={14} className="text-success flex-none mt-0.5" />,
  active: <Loader2 size={14} className="text-accent-blue flex-none mt-0.5 animate-spin" />,
  awaiting: <Hourglass size={14} className="text-warning flex-none mt-0.5" />,
  failed: <XCircle size={14} className="text-accent-red flex-none mt-0.5" />,
  pending: <Circle size={14} className="text-text-muted flex-none mt-0.5" />,
};

const LABEL: Record<Step["status"], string> = {
  done: "verified",
  active: "working",
  awaiting: "needs your Confirm",
  failed: "failed — retrying or blocked",
  pending: "to do",
};

export function ChecklistCard({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.status === "done").length;
  return (
    <div className="mb-2 rounded-card border border-border-default bg-background-elevated/60 px-3 py-2.5" aria-label="Task checklist">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-text-muted">Checklist</span>
        <span className={cn("text-[11px] font-mono", done === steps.length ? "text-success" : "text-text-secondary")}>
          {done}/{steps.length} verified
        </span>
      </div>
      <div className="h-1 rounded-full bg-border-default mb-2.5 overflow-hidden">
        <div className="h-full bg-success transition-all duration-500" style={{ width: `${(done / steps.length) * 100}%` }} />
      </div>
      <ol className="space-y-1.5">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2 text-[13px]">
            {ICON[s.status]}
            <div className="min-w-0">
              <span className={cn(s.status === "done" ? "text-text-secondary" : "text-text-primary")}>{s.id}. {s.title}</span>
              <span className={cn("ml-1.5 text-[10px] font-mono", s.status === "failed" ? "text-accent-red" : s.status === "awaiting" ? "text-warning" : "text-text-muted")}>
                {LABEL[s.status]}
              </span>
              {s.status === "done" && s.evidence && <p className="text-[11px] text-text-muted mt-0.5 break-words">✓ {s.evidence}</p>}
              {s.status === "failed" && s.note && <p className="text-[11px] text-accent-red/80 mt-0.5 break-words">{s.note}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
