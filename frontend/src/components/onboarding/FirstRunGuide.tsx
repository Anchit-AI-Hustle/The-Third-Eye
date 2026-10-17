"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Mic, FolderSync, Sparkles } from "lucide-react";
import { usePush } from "@/hooks/usePush";
import { deviceSyncPlugin } from "@/lib/deviceSync";
import { localNotificationsPlugin } from "@/lib/localReminders";

const DONE = "te_first_run_done";
const TRY = ["What's on my plate today?", "Remind me to drink water at 4pm", "Give me my morning briefing"];

// A one-time, three-step start: voice and notifications, bringing data in,
// and three things to say.
export function FirstRunGuide() {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState<"todo" | "on" | "partly">("todo");
  const [folder, setFolder] = useState<string | null>(null);
  const [native, setNative] = useState(false);
  const push = usePush();

  useEffect(() => {
    try { setOpen(localStorage.getItem(DONE) !== "1"); } catch { setOpen(true); }
    setNative(!!deviceSyncPlugin());
  }, []);

  if (!open) return null;
  const finish = () => {
    setOpen(false);
    try { localStorage.setItem(DONE, "1"); } catch { /* private mode: it shows again next time */ }
  };

  async function allowVoice() {
    let all = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch { all = false; }
    try {
      const notes = localNotificationsPlugin();
      if (notes) all = (await notes.requestPermissions()).display === "granted" && all;
      else if (push.state === "off") await push.enable();
    } catch { all = false; }
    setVoice(all ? "on" : "partly");
  }

  async function chooseFolder() {
    const picked = await deviceSyncPlugin()?.chooseFolder().catch(() => null);
    if (picked) setFolder(picked.name);
  }

  return (
    <div className="holo-card rounded-card p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-text-primary">Get set up</h2>
          <p className="text-text-secondary text-sm mt-1">Three steps, about a minute.</p>
        </div>
        <button type="button" onClick={finish} className="text-xs text-text-muted hover:text-text-secondary">Skip</button>
      </div>

      <ol className="mt-5 space-y-4">
        <li className="flex gap-3">
          <Step done={voice !== "todo"} icon={<Mic size={14} />} />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">Talk to it, and hear back from it</p>
            {voice === "todo" ? (
              <button type="button" onClick={() => void allowVoice()}
                className="mt-2 rounded-input bg-accent-blue/15 px-3 py-1.5 text-xs font-medium text-accent-blue hover:bg-accent-blue/25">
                Allow microphone and notifications
              </button>
            ) : (
              <p className="mt-1 text-xs text-text-muted">
                {voice === "on" ? "Voice and notifications are on." : "Some access wasn't allowed. You can turn it on later in Settings."}
              </p>
            )}
          </div>
        </li>

        <li className="flex gap-3">
          <Step done={!!folder} icon={<FolderSync size={14} />} />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">Bring in your contacts, photos and files</p>
            {native ? (
              <>
                <p className="mt-1 text-xs text-text-muted">Contacts and photos sync on their own once you allow them.</p>
                {folder ? (
                  <p className="mt-1 text-xs text-text-muted">{folder} syncs on its own.</p>
                ) : (
                  <button type="button" onClick={() => void chooseFolder()}
                    className="mt-2 rounded-input border border-white/[0.08] px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary">
                    Choose a folder to sync
                  </button>
                )}
              </>
            ) : (
              <Link href="/settings" className="mt-2 inline-block rounded-input border border-white/[0.08] px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary">
                Import contacts and files
              </Link>
            )}
          </div>
        </li>

        <li className="flex gap-3">
          <Step done={false} icon={<Sparkles size={14} />} />
          <div className="flex-1">
            <p className="text-sm font-medium text-text-primary">Try saying</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TRY.map((t) => (
                <Link key={t} href={`/assistant?ask=${encodeURIComponent(t)}`} onClick={finish}
                  className="rounded-input border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-xs text-text-secondary hover:border-accent-blue/30 hover:text-text-primary">
                  {t}
                </Link>
              ))}
            </div>
          </div>
        </li>
      </ol>
    </div>
  );
}

function Step({ done, icon }: { done: boolean; icon: React.ReactNode }) {
  return (
    <span aria-hidden="true" className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full border text-xs ${done ? "border-success/40 bg-success/10 text-success" : "border-accent-blue/30 bg-accent-blue/10 text-accent-blue"}`}>
      {done ? <Check size={14} /> : icon}
    </span>
  );
}
