"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Plus, Trash2, CalendarClock, MapPin, Wifi, Bell } from "lucide-react";
import { EVENT_PLATFORMS, ACTIVITY_LABELS, describeSchedule, type ActivityType, type EventFormat, type Frequency, type SubscribedEvent } from "@/lib/health/events";
import { vaultGet, vaultSet } from "@/lib/deviceVault";
import { recordSignal } from "@/lib/personalization";

const APP = "health-events";
const ACTIVITIES: (ActivityType | "all")[] = ["all", "yoga", "running", "gym", "cycling", "badminton", "pickleball", "football", "cricket", "swimming", "meditation"];

export function HealthEvents() {
  const [filter, setFilter] = useState<ActivityType | "all">("all");
  const [format, setFormat] = useState<EventFormat | "all">("all");
  const [mine, setMine] = useState<SubscribedEvent[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => setMine(vaultGet<SubscribedEvent[]>(APP, "subscriptions", [])), []);
  const save = (list: SubscribedEvent[]) => { setMine(list); vaultSet(APP, "subscriptions", list); };

  const platforms = EVENT_PLATFORMS.filter((p) =>
    (filter === "all" || p.activities.includes(filter)) &&
    (format === "all" || p.format === format || p.format === "both"),
  );

  function addEvent(e: SubscribedEvent) {
    const list = [e, ...mine];
    save(list);
    recordSignal("event.subscribe", e.activity, { frequency: e.frequency });
    setShowAdd(false);
  }

  return (
    <div className="space-y-6">
      {/* My schedule */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <span className="hud-label text-text-muted">My health schedule</span>
          <button onClick={() => setShowAdd((v) => !v)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-input bg-[#34D399] text-[#07070F] text-xs font-semibold hover:brightness-110"><Plus size={13} /> Subscribe to an event</button>
        </div>
        {showAdd && <AddEvent onAdd={addEvent} onCancel={() => setShowAdd(false)} />}
        {mine.length === 0 && !showAdd ? (
          <p className="text-sm text-text-muted py-6 text-center rounded-card border border-border-default bg-background-surface/30">Nothing scheduled yet. Subscribe to a class, run, or game — daily, weekly, or any custom rhythm — and it stays on your device with reminders.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2">
            {mine.map((e) => (
              <div key={e.id} className="rounded-card border border-border-default bg-background-surface/40 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-text-primary truncate">{e.title}</div>
                    <div className="text-[11px] text-text-muted flex items-center gap-2 mt-0.5">
                      <span className="px-1.5 py-0.5 rounded bg-[#34D399]/10 text-[#34D399]">{ACTIVITY_LABELS[e.activity]}</span>
                      {e.format === "online" ? <Wifi size={11} /> : <MapPin size={11} />}
                    </div>
                    <div className="text-[11px] text-text-secondary mt-1 flex items-center gap-1"><CalendarClock size={11} /> {describeSchedule(e)}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-none">
                    {e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-text-muted hover:text-[#4FC3F7]"><ExternalLink size={14} /></a>}
                    <button onClick={() => save(mine.filter((x) => x.id !== e.id))} className="text-text-muted hover:text-accent-red"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className="mt-1.5 text-[10px] text-text-muted flex items-center gap-1"><Bell size={10} /> Reminders on this device</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Discover platforms */}
      <section>
        <div className="hud-label text-text-muted mb-2">Find & book events</div>
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {ACTIVITIES.map((a) => <button key={a} onClick={() => setFilter(a)} className={chip(filter === a)}>{a === "all" ? "All" : ACTIVITY_LABELS[a]}</button>)}
          <span className="w-px h-4 bg-border-default mx-1" />
          {(["all", "in_person", "online"] as const).map((fm) => <button key={fm} onClick={() => setFormat(fm)} className={chip(format === fm)}>{fm === "all" ? "Any" : fm === "in_person" ? "In-person" : "Online"}</button>)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {platforms.map((p) => (
            <a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer" className="group holo-card rounded-card p-4 hover:-translate-y-0.5 transition-transform">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold text-text-primary">{p.name}</span>
                <ExternalLink size={13} className="text-text-muted group-hover:text-text-primary" />
              </div>
              <p className="text-[11px] text-text-muted leading-relaxed">{p.blurb}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {p.activities.slice(0, 4).map((a) => <span key={a} className="text-[10px] px-1.5 py-0.5 rounded bg-background-base border border-border-default text-text-muted">{ACTIVITY_LABELS[a]}</span>)}
                <span className="text-[10px] px-1.5 py-0.5 rounded border border-border-default text-text-muted">{p.format === "both" ? "in-person + online" : p.format === "online" ? "online" : "in-person"}</span>
              </div>
            </a>
          ))}
        </div>
        <p className="text-[10px] text-text-muted mt-3">Live timings, slots &amp; prices are shown on each provider when you open it — we link out, we don't book on your behalf.</p>
      </section>
    </div>
  );
}

function AddEvent({ onAdd, onCancel }: { onAdd: (e: SubscribedEvent) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [activity, setActivity] = useState<ActivityType>("yoga");
  const [fmt, setFmt] = useState<EventFormat>("in_person");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [custom, setCustom] = useState(2);
  const [duration, setDuration] = useState(60);
  const [time, setTime] = useState("07:00");
  const [url, setUrl] = useState("");

  return (
    <div className="rounded-card border border-border-default bg-background-surface/40 p-4 space-y-2.5 mb-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Event name (e.g. Morning yoga)" className={inp} />
        <select value={activity} onChange={(e) => setActivity(e.target.value as ActivityType)} className={inp}>{Object.entries(ACTIVITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={fmt} onChange={(e) => setFmt(e.target.value as EventFormat)} className={inp}><option value="in_person">In-person</option><option value="online">Online</option></select>
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={inp}><option value="once">One-time</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Custom</option></select>
        {frequency === "custom" && <label className="text-xs text-text-muted flex items-center gap-2">Every <input type="number" value={custom} onChange={(e) => setCustom(Number(e.target.value))} className={inp + " w-16"} /> days</label>}
        <label className="text-xs text-text-muted flex items-center gap-2">Duration <input type="number" value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inp + " w-20"} /> min</label>
        <label className="text-xs text-text-muted flex items-center gap-2">Time <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inp} /></label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Booking link (optional)" className={inp} />
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-input border border-border-default text-text-secondary text-xs">Cancel</button>
        <button onClick={() => title.trim() && onAdd({ id: `ev_${Date.now().toString(36)}`, title: title.trim(), activity, format: fmt, frequency, customEveryDays: custom, durationMin: duration, time, url: url || undefined, createdAt: new Date().toISOString() })} className="px-3 py-1.5 rounded-input bg-[#34D399] text-[#07070F] text-xs font-semibold">Subscribe</button>
      </div>
    </div>
  );
}

const chip = (on: boolean) => `px-2.5 py-1 rounded-full text-[11px] border ${on ? "border-[#34D399] text-[#34D399] bg-[#34D399]/10" : "border-border-default text-text-muted"}`;
const inp = "bg-background-base border border-border-default rounded-input px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-[#34D399]/50";
