"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Camera,
  Check,
  FileText,
  History,
  Inbox,
  LayoutDashboard,
  Loader2,
  Mail,
  MessageSquare,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionCard } from "@/components/assistant/ActionCard";
import type { PendingAction } from "@/hooks/useAgentConfirm";
import {
  DRAFT_REPLY,
  PROMPTS,
  SAMPLE_DOC,
  SAMPLE_EMAILS,
  SAMPLE_PHOTO,
  type DemoNote,
  type DemoTask,
  type PromptId,
} from "./sampleData";

export const DEMO_DELAY_MS = 900;

const STEPS = [
  { id: "inbox", label: "Inbox", icon: Inbox },
  { id: "ask", label: "Ask", icon: MessageSquare },
  { id: "capture", label: "Capture", icon: Camera },
  { id: "workspace", label: "Workspace", icon: LayoutDashboard },
] as const;

type Step = (typeof STEPS)[number]["id"];
type Phase = "idle" | "running" | "done";
type Msg = {
  id: number;
  role: "user" | "assistant";
  text: string;
  tools?: { name: string; done: boolean }[];
  cite?: string;
  action?: PendingAction;
};

const primary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-input bg-accent-blue px-5 text-sm font-semibold text-background-base transition-all duration-interaction hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none";
const secondary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-input border border-accent-blue/40 px-5 text-sm font-semibold text-accent-blue transition-colors hover:bg-accent-blue/10";
const card = "rounded-card border border-border-default bg-background-surface";

function addUnique<T extends { id: string }>(list: T[], add: T[]) {
  return [...list, ...add.filter((a) => !list.some((l) => l.id === a.id))];
}

export function DemoClient() {
  const [step, setStep] = useState<Step>("inbox");
  const [tasks, setTasks] = useState<DemoTask[]>([]);
  const [notes, setNotes] = useState<DemoNote[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [scan, setScan] = useState<Phase>("idle");
  const [photo, setPhoto] = useState<Phase>("idle");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);
  const nextId = useRef(0);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const later = (fn: () => void) => {
    timers.current.push(window.setTimeout(fn, DEMO_DELAY_MS));
  };

  const go = (s: Step) => {
    setStep(s);
    panel.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const scanInbox = () => {
    setScan("running");
    later(() => {
      const found = SAMPLE_EMAILS.flatMap((e) => e.tasks);
      setTasks((t) => addUnique(t, found));
      setLog((l) => [...l, `Scanned ${SAMPLE_EMAILS.length} emails, created ${found.length} tasks, skipped 1 newsletter`]);
      setScan("done");
    });
  };

  const readPhoto = () => {
    setPhoto("running");
    later(() => {
      setTasks((t) => addUnique(t, SAMPLE_PHOTO.tasks));
      setNotes((n) => addUnique(n, [SAMPLE_PHOTO.note]));
      setLog((l) => [...l, `Read ${SAMPLE_PHOTO.name}, saved 1 note and ${SAMPLE_PHOTO.tasks.length} tasks`]);
      setPhoto("done");
    });
  };

  const answer = (id: PromptId): Omit<Msg, "id" | "role" | "tools"> => {
    if (id === "due") {
      const open = tasks.filter((t) => !t.done);
      if (!open.length)
        return { text: "Nothing is tracked yet. Scan the sample inbox or read the whiteboard photo, then ask me again." };
      return {
        text: [`You have ${open.length} open task${open.length === 1 ? "" : "s"}:`, ...open.map((t) => `• ${t.title} - ${t.due} (${t.priority})`)].join("\n"),
      };
    }
    if (id === "clause")
      return {
        text: "Clause 7 renews the agreement automatically for another 12 months unless either side gives written notice at least 30 days before the renewal date. With renewal on 1 Nov, that notice window closed on 2 Oct. Also worth knowing: §9 raises fees by 4% at each renewal.",
        cite: `${SAMPLE_DOC.name} · §7 Auto-renewal, §9 Fees`,
      };
    return {
      text: "Here's a draft. I won't send anything until you confirm.",
      action: {
        id: "demo-reply",
        tool: "communicate",
        args: { action: "email", ...DRAFT_REPLY },
        summary: "Send email to Priya Shah",
        status: "pending",
      },
    };
  };

  const ask = (id: PromptId) => {
    const p = PROMPTS.find((x) => x.id === id)!;
    const userId = nextId.current++;
    const botId = nextId.current++;
    const reply = answer(id);
    setBusy(true);
    setMsgs((m) => [
      ...m,
      { id: userId, role: "user", text: p.label },
      { id: botId, role: "assistant", text: "", tools: p.tools.map((name) => ({ name, done: false })) },
    ]);
    later(() => {
      setMsgs((m) =>
        m.map((x) => (x.id === botId ? { ...x, ...reply, tools: x.tools?.map((t) => ({ ...t, done: true })) } : x)),
      );
      setBusy(false);
    });
  };

  const setAction = (patch: Partial<PendingAction>) =>
    setMsgs((m) => m.map((x) => (x.action ? { ...x, action: { ...x.action, ...patch } } : x)));

  const confirmReply = () => {
    setAction({ status: "running" });
    later(() => {
      setAction({ status: "done", result: "Demo only - nothing was sent. Signed in, this sends from your own Gmail." });
      setLog((l) => [...l, "Sent email to Priya Shah (confirmed by you - demo, not actually sent)"]);
    });
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setTasks([]);
    setNotes([]);
    setLog([]);
    setScan("idle");
    setPhoto("idle");
    setMsgs([]);
    setBusy(false);
    go("inbox");
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const next = STEPS[stepIndex + 1];

  return (
    <div ref={panel} className="scroll-mt-4">
      <nav aria-label="Demo steps" className="mb-6">
        <ol className="grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = s.id === step;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-input border px-1 py-2.5 text-xs font-medium transition-colors sm:flex-row sm:justify-center sm:gap-2 sm:text-sm",
                    active
                      ? "border-accent-blue/50 bg-accent-blue/10 text-accent-blue"
                      : "border-border-default bg-background-surface text-text-secondary hover:border-border-hover hover:text-text-primary",
                  )}
                >
                  <Icon size={16} aria-hidden />
                  <span>
                    <span className="font-mono text-text-muted">{i + 1}</span> {s.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {step === "inbox" && (
        <section aria-labelledby="demo-inbox">
          <StepHead
            id="demo-inbox"
            title="Turn an inbox into a task list"
            body="Signed in, The Third Eye reads the Gmail you connect and pulls out what you need to do. Here it scans three sample emails."
          />
          <ul className="space-y-3">
            {SAMPLE_EMAILS.map((e) => (
              <li key={e.id} className={cn(card, "p-4")}>
                <div className="flex items-start gap-3">
                  <Mail size={16} className="mt-0.5 flex-none text-text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-text-muted">{e.from}</p>
                    <p className="text-sm font-medium text-text-primary">{e.subject}</p>
                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">{e.body}</p>
                    {scan === "done" && (
                      <p className={cn("mt-2 font-mono text-xs animate-fade-in", e.tasks.length ? "text-success" : "text-text-muted")}>
                        {e.tasks.length
                          ? `→ ${e.tasks.length} task${e.tasks.length > 1 ? "s" : ""}: ${e.tasks.map((t) => t.title).join("; ")}`
                          : "→ skipped: newsletter, nothing to do"}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" onClick={scanInbox} disabled={scan === "running"} className={primary}>
              {scan === "running" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
              {scan === "running" ? "Scanning…" : scan === "done" ? "Scan again" : "Scan the sample inbox"}
            </button>
            {scan === "done" && <span role="status" className="text-sm text-success">{SAMPLE_EMAILS.flatMap((e) => e.tasks).length} tasks added to your demo workspace</span>}
          </div>
        </section>
      )}

      {step === "ask" && (
        <section aria-labelledby="demo-ask">
          <StepHead
            id="demo-ask"
            title="Ask, and it looks things up or acts"
            body="The assistant can read your tasks, search your own documents and draft messages. Anything that sends or changes something waits for your confirmation."
          />
          <div className={cn(card, "mb-4 flex items-center gap-3 p-3")}>
            <FileText size={16} className="flex-none text-accent-blue" aria-hidden />
            <p className="min-w-0 text-sm text-text-secondary">
              In the knowledge base: <span className="break-all text-text-primary">{SAMPLE_DOC.name}</span>{" "}
              <span className="text-text-muted">· {SAMPLE_DOC.pages} pages · sample</span>
            </p>
          </div>
          <div className={cn(card, "p-4")}>
            <div className="space-y-4" aria-live="polite">
              {!msgs.length && <p className="text-sm text-text-muted">Pick a question below to see a reply.</p>}
              {msgs.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="flex justify-end">
                    <p className="max-w-[85%] rounded-card border border-accent-blue/20 bg-accent-blue/10 px-4 py-2.5 text-sm text-text-primary">
                      {m.text}
                    </p>
                  </div>
                ) : (
                  <div key={m.id} className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      {m.tools?.map((t) => (
                        <span
                          key={t.name}
                          className="inline-flex items-center gap-1.5 rounded-badge border border-border-default bg-background-base px-2 py-1 font-mono text-[11px] text-text-secondary"
                        >
                          {t.done ? <Check size={12} className="text-success" aria-hidden /> : <Loader2 size={12} className="animate-spin text-accent-blue" aria-hidden />}
                          {t.name}
                        </span>
                      ))}
                    </div>
                    {m.text && (
                      <div className="max-w-[85%] animate-fade-in rounded-card border border-border-default bg-background-elevated px-4 py-3">
                        <p className="whitespace-pre-line text-sm leading-relaxed text-text-primary">{m.text}</p>
                        {m.cite && (
                          <p className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-accent-blue">
                            <Search size={12} aria-hidden /> {m.cite}
                          </p>
                        )}
                      </div>
                    )}
                    {m.action && <ActionCard action={m.action} onConfirm={confirmReply} onCancel={() => setAction({ status: "canceled" })} />}
                  </div>
                ),
              )}
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-border-default pt-4">
              {PROMPTS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => ask(p.id)}
                  className="rounded-input border border-accent-blue/30 bg-accent-blue/5 px-3 py-2 text-left text-xs text-accent-blue transition-colors hover:border-accent-blue/60 disabled:opacity-50"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {step === "capture" && (
        <section aria-labelledby="demo-capture">
          <StepHead
            id="demo-capture"
            title="Point the camera, keep what matters"
            body="Signed in, you snap a whiteboard, receipt or page and the assistant reads it into notes and tasks. This demo uses a built-in sample photo."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <figure className={cn(card, "p-3")}>
              <div
                role="img"
                aria-label={`Sample photo of a whiteboard: ${SAMPLE_PHOTO.lines.join(", ")}`}
                className="aspect-[4/3] -rotate-1 rounded-input bg-[#E8ECF1] p-5 font-mono text-[#1F2937] shadow-[inset_0_0_40px_rgba(0,0,0,0.12)]"
              >
                {SAMPLE_PHOTO.lines.map((l, i) => (
                  <p key={l} className={i === 0 ? "mb-2 text-base font-bold" : "text-sm leading-7"}>
                    {l}
                  </p>
                ))}
              </div>
              <figcaption className="mt-2 font-mono text-[11px] text-text-muted">{SAMPLE_PHOTO.name} · sample image</figcaption>
            </figure>
            <div className={cn(card, "flex flex-col p-4")}>
              {photo !== "done" ? (
                <div className="flex flex-1 flex-col items-start justify-center gap-3">
                  <button type="button" onClick={readPhoto} disabled={photo === "running"} className={primary}>
                    {photo === "running" ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Camera size={16} aria-hidden />}
                    {photo === "running" ? "Reading…" : "Read this photo"}
                  </button>
                  <p className="text-xs leading-relaxed text-text-muted">
                    Demo: your camera is not opened and nothing is uploaded. In the app, the photo you take is sent to an
                    AI provider to be read; see the{" "}
                    <Link href="/privacy" className="text-accent-blue hover:underline">
                      privacy note
                    </Link>
                    .
                  </p>
                </div>
              ) : (
                <div className="animate-fade-in space-y-3" role="status">
                  <p className="hud-label">Saved note</p>
                  <p className="text-sm font-medium text-text-primary">{SAMPLE_PHOTO.note.title}</p>
                  <p className="text-sm leading-relaxed text-text-secondary">{SAMPLE_PHOTO.note.body}</p>
                  <p className="hud-label pt-2">New tasks</p>
                  <ul className="space-y-1 text-sm text-text-secondary">
                    {SAMPLE_PHOTO.tasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-2">
                        <Check size={14} className="text-success" aria-hidden /> {t.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {step === "workspace" && (
        <section aria-labelledby="demo-workspace">
          <StepHead
            id="demo-workspace"
            title="Everything lands in one workspace"
            body="What the earlier steps captured, in one place. Tick tasks off; ask the assistant again and it sees the change."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className={cn(card, "p-4")}>
              <h3 className="hud-label mb-3">Tasks ({tasks.filter((t) => !t.done).length} open)</h3>
              {!tasks.length ? (
                <Empty onClick={() => go("inbox")} label="Scan the sample inbox to add tasks" />
              ) : (
                <ul className="space-y-2">
                  {tasks.map((t) => (
                    <li key={t.id}>
                      <label className="flex cursor-pointer items-start gap-3 rounded-input p-1.5 hover:bg-background-elevated">
                        <input
                          type="checkbox"
                          checked={!!t.done}
                          onChange={() => setTasks((all) => all.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                          className="mt-0.5 h-4 w-4 flex-none accent-[#4FC3F7]"
                        />
                        <span className="min-w-0">
                          <span className={cn("block text-sm", t.done ? "text-text-muted line-through" : "text-text-primary")}>{t.title}</span>
                          <span className="block font-mono text-[11px] text-text-muted">
                            {t.due} · {t.priority} · {t.source}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={cn(card, "p-4")}>
              <h3 className="hud-label mb-3">Notes</h3>
              {!notes.length ? (
                <Empty onClick={() => go("capture")} label="Read the sample photo to add a note" />
              ) : (
                notes.map((n) => (
                  <div key={n.id}>
                    <p className="text-sm font-medium text-text-primary">{n.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-text-secondary">{n.body}</p>
                    <p className="mt-1 font-mono text-[11px] text-text-muted">{n.source}</p>
                  </div>
                ))
              )}
            </div>
            <div className={cn(card, "p-4 sm:col-span-2")}>
              <h3 className="hud-label mb-3 flex items-center gap-2">
                <History size={12} aria-hidden /> Activity log
              </h3>
              {!log.length ? (
                <p className="text-sm text-text-muted">Every action the assistant takes is recorded here.</p>
              ) : (
                <ol className="space-y-1.5 font-mono text-xs text-text-secondary">
                  {log.map((l, i) => (
                    <li key={i}>
                      <span className="text-text-muted">{String(i + 1).padStart(2, "0")}</span> {l}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
          <div className="mt-6 rounded-card border border-accent-blue/20 bg-background-surface/60 p-6 text-center">
            <p className="font-display text-lg font-semibold">That&apos;s the loop: capture, ask, act.</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
              Sign in to run it on your own inbox, documents and photos, in a workspace only you can see.
            </p>
            <div className="mt-5 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/auth/signin" className={primary}>
                Sign in to use it <ArrowRight size={16} aria-hidden />
              </Link>
              <button type="button" onClick={reset} className={secondary}>
                <RotateCcw size={14} aria-hidden /> Start the demo over
              </button>
            </div>
          </div>
        </section>
      )}

      {next && (
        <div className="mt-8 flex justify-end">
          <button type="button" onClick={() => go(next.id)} className={secondary}>
            Next: {next.label} <ArrowRight size={16} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}

function StepHead({ id, title, body }: { id: string; title: string; body: string }) {
  return (
    <div className="mb-5">
      <h2 id={id} className="font-display text-xl font-semibold text-text-primary">
        {title}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-text-secondary">{body}</p>
    </div>
  );
}

function Empty({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="text-left text-sm text-accent-blue hover:underline">
      {label} →
    </button>
  );
}
