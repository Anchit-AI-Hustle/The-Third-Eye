"use client";
// web/app/(app)/studio/StudioClient.tsx — the 8 Studio modules, DB-backed via /api/kolab-studio/studio/*.
// Data arrives as server props (RLS-scoped); after each mutation we router.refresh() to reload.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label } from "@/components/kolab-studio/ui";
import { CHANNELS } from "@/lib/kolab-studio/content";
import {
  ASSET_META,
  BLUEPRINTS,
  AUTO_STEPS,
  TK_STATUSES,
  TK_LABEL,
  DEFAULT_PILLARS,
  assetMix,
  trackerProgress,
  planToCsv,
  pillarColor,
  type PlanCsvRow,
} from "@/lib/kolab-studio/studioHelpers";
import type { Pillar, PlanItem, Deal, ScheduledPost, Channel } from "@/lib/kolab-studio/studio";
import type { AssetType, PlanStatus, Platform } from "@/lib/kolab-studio/types";

const TABS = [
  "strategy",
  "calendar",
  "blueprints",
  "assetmap",
  "scheduler",
  "deals",
  "automation",
  "tracker",
] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = {
  strategy: "Strategy",
  calendar: "Calendar",
  blueprints: "Blueprints",
  assetmap: "Asset Map",
  scheduler: "Scheduler",
  deals: "Brand Deals",
  automation: "Automation",
  tracker: "Tracker",
};
const CH = Object.fromEntries(CHANNELS.map((c) => [c.k, c]));

export function StudioClient(props: {
  pillars: Pillar[];
  plan: PlanItem[];
  deals: Deal[];
  schedule: ScheduledPost[];
  channels: Channel[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("strategy");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) throw new Error(body.error || "Request failed");
      router.refresh();
      return true;
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="sticky top-[96px] z-20 mb-5 flex items-center gap-2 rounded-xl border border-kolab-line border-b-2 border-b-kolab-lime bg-gradient-to-b from-kolab-surface to-kolab-surface2 pr-1.5 shadow-[0_8px_22px_rgba(0,0,0,0.4)]">
        <span className="rounded-[11px_0_8px_0] bg-kolab-lime px-2.5 py-1.5 font-kolab-mono text-[9px] font-bold uppercase tracking-[0.14em] text-kolab-base">
          Studio menu
        </span>
        <div className="flex flex-1 gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-none whitespace-nowrap rounded-[9px] border px-3.5 py-2.5 font-kolab-mono text-[12px] font-bold ${
                tab === t
                  ? "border-transparent bg-kolab-lime text-kolab-base shadow-[0_2px_10px_rgba(194,240,74,0.3)]"
                  : "border-transparent text-kolab-muted hover:border-kolab-line hover:text-kolab-ink"
              }`}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="mb-4 rounded-lg border border-kolab-line bg-kolab-surface2 px-3 py-2 font-kolab-mono text-[12px] text-kolab-muted">
          {msg}
        </div>
      )}

      {tab === "strategy" && <Strategy pillars={props.pillars} call={call} busy={busy} />}
      {tab === "calendar" && <Calendar pillars={props.pillars} plan={props.plan} call={call} busy={busy} />}
      {tab === "blueprints" && <Blueprints />}
      {tab === "assetmap" && <AssetMap plan={props.plan} />}
      {tab === "scheduler" && <Scheduler schedule={props.schedule} channels={props.channels} call={call} busy={busy} />}
      {tab === "deals" && <Deals deals={props.deals} call={call} busy={busy} />}
      {tab === "automation" && <Automation />}
      {tab === "tracker" && <Tracker pillars={props.pillars} plan={props.plan} call={call} busy={busy} />}
    </div>
  );
}

type Call = (url: string, init: RequestInit) => Promise<boolean>;

function ModuleHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <h3 className="text-[22px]">{title}</h3>
      <p className="max-w-[60ch] text-[14px] text-kolab-muted">{sub}</p>
    </div>
  );
}

/* ---------- Strategy ---------- */
function Strategy({ pillars, call, busy }: { pillars: Pillar[]; call: Call; busy: boolean }) {
  // Keep each existing pillar's id so saving edits updates in place (preserves calendar links).
  const [rows, setRows] = useState<{ id?: string; name: string; role: string }[]>(
    pillars.length
      ? pillars.map((p) => ({ id: p.id, name: p.name, role: p.role ?? "" }))
      : DEFAULT_PILLARS.map((p) => ({ name: p.name, role: p.role })),
  );
  const set = (i: number, k: "name" | "role", v: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [k]: v } : row)));

  return (
    <div>
      <ModuleHead title="Content strategy" sub="Define the pillars your content rotates through. These drive your calendar, asset mix and tracker." />
      <div className="mb-3">
        {rows.map((p, i) => (
          <div
            key={i}
            className="mb-2.5 flex items-center gap-2.5 rounded-[11px] border border-kolab-line bg-kolab-surface p-3"
            style={{ borderLeft: `4px solid ${pillarColor(i)}` }}
          >
            <span className="h-[18px] w-[18px] flex-none rounded" style={{ background: pillarColor(i) }} />
            <Input value={p.name} placeholder="Pillar name" onChange={(e) => set(i, "name", e.target.value)} />
            <Input value={p.role} placeholder="Role" onChange={(e) => set(i, "role", e.target.value)} />
            <button
              className="border-none bg-transparent text-[18px] text-kolab-faint hover:text-kolab-clay"
              onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Button onClick={() => setRows((r) => [...r, { name: "New pillar", role: "" }])}>+ Add pillar</Button>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() =>
            call("/api/kolab-studio/studio/pillars", {
              method: "PUT",
              body: JSON.stringify({ pillars: rows.filter((r) => r.name.trim()) }),
            })
          }
        >
          Save pillars
        </Button>
      </div>
    </div>
  );
}

/* ---------- Calendar ---------- */
function Calendar({ pillars, plan, call, busy }: { pillars: Pillar[]; plan: PlanItem[]; call: Call; busy: boolean }) {
  const [pillarId, setPillarId] = useState<string>(pillars[0]?.id ?? "");
  const [format, setFormat] = useState("");
  const [asset, setAsset] = useState<AssetType>("video");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:30");
  const [hook, setHook] = useState("");

  async function add() {
    const okAdd = await call("/api/kolab-studio/studio/plan", {
      method: "POST",
      body: JSON.stringify({
        pillar_id: pillarId || null,
        format,
        asset_type: asset,
        date: date || undefined,
        time: time || undefined,
        hook,
      }),
    });
    if (okAdd) setHook("");
  }

  return (
    <div>
      <ModuleHead title="Content calendar" sub="Build your rolling plan. Generate a starter week from your pillars, then edit freely." />
      <Card className="mb-3.5 p-4">
        <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <div>
            <Label>Pillar</Label>
            <select className="w-full rounded-[10px] border border-kolab-line bg-kolab-surface2 px-3 py-[11px] text-[14px] text-kolab-ink" value={pillarId} onChange={(e) => setPillarId(e.target.value)}>
              <option value="">—</option>
              {pillars.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Format</Label>
            <Input value={format} placeholder="Reel · 30s" onChange={(e) => setFormat(e.target.value)} />
          </div>
          <div>
            <Label>Asset</Label>
            <select className="w-full rounded-[10px] border border-kolab-line bg-kolab-surface2 px-3 py-[11px] text-[14px] text-kolab-ink" value={asset} onChange={(e) => setAsset(e.target.value as AssetType)}>
              {(Object.keys(ASSET_META) as AssetType[]).map((a) => (
                <option key={a} value={a}>
                  {ASSET_META[a].l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Time</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div style={{ gridColumn: "1/-1" }}>
            <Label>Hook / idea</Label>
            <Input value={hook} placeholder="The idea for this post" onChange={(e) => setHook(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" disabled={busy} onClick={add}>
            + Add to plan
          </Button>
          <Button
            disabled={busy}
            onClick={() => call("/api/kolab-studio/studio/plan", { method: "POST", body: JSON.stringify({ generate: "week" }) })}
          >
            ✨ Generate starter week
          </Button>
        </div>
      </Card>

      {plan.length === 0 ? (
        <p className="text-[14px] text-kolab-muted">No posts planned. Add one or generate a starter week.</p>
      ) : (
        plan.map((x) => {
          const pil = pillars.find((p) => p.id === x.pillar_id);
          const a = x.asset_type ? ASSET_META[x.asset_type] : null;
          return (
            <div key={x.id} className="mb-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[11px] border border-kolab-line bg-kolab-surface p-3" style={{ borderLeft: `4px solid ${pil ? pillarColor(pillars.indexOf(pil)) : "var(--kolab-lime)"}` }}>
              <div className="font-kolab-mono text-[10px] uppercase text-kolab-muted">
                {x.date || ""}
                <br />
                {x.time || ""}
              </div>
              <div>
                <div className="text-[14px] font-semibold">{x.hook || "(idea)"}</div>
                <div className="mt-1 font-kolab-mono text-[10px] uppercase text-kolab-muted">
                  {(pil?.name || "—") + (x.format ? " · " + x.format : "")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {a && (
                  <span className="rounded px-1.5 py-0.5 font-kolab-mono text-[9px] font-bold uppercase text-white" style={{ background: a.c }}>
                    {a.l}
                  </span>
                )}
                <button
                  className="border-none bg-transparent text-[18px] text-kolab-faint hover:text-kolab-clay"
                  onClick={() => call(`/api/kolab-studio/studio/plan?id=${x.id}`, { method: "DELETE" })}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ---------- Blueprints (static) ---------- */
function Blueprints() {
  return (
    <div>
      <ModuleHead title="Post blueprints" sub="Reusable skeletons — every post follows the same five-beat backbone: Hook → Relate → Value → Proof → CTA." />
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
        {BLUEPRINTS.map((b) => (
          <Card key={b.t} className="p-[18px]">
            <h4 className="mb-2.5 text-[16px]">{b.t}</h4>
            <ol className="list-none">
              {b.steps.map((s, i) => (
                <li key={i} className="border-t border-kolab-line py-[7px] pl-[30px] text-[13.5px] text-[#d8d0c6] first:border-t-0" style={{ textIndent: "-30px" }}>
                  <span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-md bg-kolab-surface2 font-kolab-mono text-[10px] font-bold text-kolab-lime" style={{ textIndent: 0 }}>
                    {i + 1}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- Asset Map (derived) ---------- */
function AssetMap({ plan }: { plan: PlanItem[] }) {
  const { counts, total } = assetMix(plan.map((p) => ({ asset_type: p.asset_type, status: p.status, done: p.done })));
  const order: AssetType[] = ["video", "carousel", "photo", "loop"];
  if (!total) {
    return (
      <div>
        <ModuleHead title="Asset & shot map" sub="Live from your calendar — the production load before you film." />
        <p className="text-[14px] text-kolab-muted">Build your calendar to see the asset mix.</p>
      </div>
    );
  }
  return (
    <div>
      <ModuleHead title="Asset & shot map" sub="Live from your calendar — the production load before you film." />
      <div className="mb-4 flex h-10 overflow-hidden rounded-[11px] border border-kolab-line">
        {order
          .filter((k) => counts[k] > 0)
          .map((k) => {
            const pct = (counts[k] / total) * 100;
            return (
              <div key={k} className="flex items-center justify-center overflow-hidden whitespace-nowrap font-kolab-mono text-[11px] font-bold text-kolab-base" style={{ width: `${pct}%`, background: ASSET_META[k].c }}>
                {pct >= 12 ? `${ASSET_META[k].l} ${Math.round(pct)}%` : ""}
              </div>
            );
          })}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {order.map((k) => (
          <div key={k} className="rounded-xl border border-kolab-line bg-kolab-surface p-3.5" style={{ borderTop: `3px solid ${ASSET_META[k].c}` }}>
            <div className="font-kolab-display text-[28px] font-black" style={{ color: ASSET_META[k].c }}>
              {counts[k]}
            </div>
            <div className="mt-1 font-kolab-mono text-[10px] uppercase tracking-[0.1em] text-kolab-muted">{ASSET_META[k].l}</div>
          </div>
        ))}
      </div>
      <p className="text-[14px] text-kolab-muted">{total} posts planned · video is your growth engine, carousels the save layer.</p>
    </div>
  );
}

/* ---------- Scheduler ---------- */
function Scheduler({ schedule, channels, call, busy }: { schedule: ScheduledPost[]; channels: Channel[]; call: Call; busy: boolean }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:30");
  const [picked, setPicked] = useState<Platform[]>(["instagram"]);
  const toggle = (k: Platform) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));

  async function add() {
    const okAdd = await call("/api/kolab-studio/studio/schedule", {
      method: "POST",
      body: JSON.stringify({ title, date: date || undefined, time: time || undefined, channels: picked }),
    });
    if (okAdd) setTitle("");
  }

  return (
    <div>
      <ModuleHead title="Scheduler & channels" sub="Queue posts per channel. Real auto-publish plugs in via the platform APIs (Phase 3)." />
      <div className="mb-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {CHANNELS.map((c) => {
          const linked = channels.find((ch) => ch.platform === c.k)?.handle;
          return (
            <Card key={c.k} className="p-3.5" style={{ borderTop: `3px solid ${c.c}` }}>
              <div className="mb-2 flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-[9px] font-kolab-display text-[12px] font-black text-white" style={{ background: c.c }}>
                  {c.ini}
                </span>
                <div>
                  <h4 className="text-[14px]">{c.n}</h4>
                  <div className="font-kolab-mono text-[9px] uppercase text-kolab-faint">{linked ? "Linked · " + linked : "Not connected"}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Card className="mb-4 p-4">
        <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <div>
            <Label>Title / caption</Label>
            <Input value={title} placeholder="Post idea" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>Time (IST)</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <Label>Channels</Label>
        <div className="mb-3 flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <label key={c.k} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-kolab-line px-2.5 py-1 font-kolab-mono text-[10px]">
              <input type="checkbox" checked={picked.includes(c.k as Platform)} onChange={() => toggle(c.k as Platform)} style={{ accentColor: "var(--kolab-lime)" }} />
              {c.n}
            </label>
          ))}
        </div>
        <Button variant="primary" disabled={busy} onClick={add}>
          + Add to queue
        </Button>
      </Card>

      {schedule.length === 0 ? (
        <p className="text-[14px] text-kolab-muted">Queue is empty.</p>
      ) : (
        schedule.map((q) => {
          const dt = q.scheduled_at ? new Date(q.scheduled_at) : null;
          return (
            <div key={q.id} className="mb-2.5 grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-[11px] border border-kolab-line bg-kolab-surface p-3" style={{ borderLeft: `4px solid ${q.channels?.[0] ? CH[q.channels[0]]?.c ?? "var(--kolab-lime)" : "var(--kolab-lime)"}` }}>
              <div className="min-w-[56px] text-center font-kolab-mono text-[11px]">
                {dt ? (
                  <>
                    <b className="block font-kolab-display text-[15px]">{String(dt.getDate()).padStart(2, "0")}</b>
                    {dt.toLocaleDateString("en-GB", { month: "short" })}
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div>
                <div className="font-semibold">{q.title}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(q.channels ?? []).map((k) => (
                    <span key={k} className="rounded px-1.5 py-0.5 font-kolab-mono text-[9px] font-bold uppercase text-white" style={{ background: CH[k]?.c ?? "#888" }}>
                      {CH[k]?.n ?? k}
                    </span>
                  ))}
                </div>
              </div>
              <button className="border-none bg-transparent text-[19px] text-kolab-faint hover:text-kolab-clay" onClick={() => call(`/api/kolab-studio/studio/schedule?id=${q.id}`, { method: "DELETE" })}>
                ×
              </button>
            </div>
          );
        })
      )}
    </div>
  );
}

/* ---------- Brand Deals ---------- */
function Deals({ deals, call, busy }: { deals: Deal[]; call: Call; busy: boolean }) {
  const empty = { brand: "", emoji: "", product: "", category: "", code: "", discount: "", price: "", affiliate_url: "" };
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof empty, v: string) => setF((p) => ({ ...p, [k]: v }));

  async function add() {
    const okAdd = await call("/api/kolab-studio/studio/deals", { method: "POST", body: JSON.stringify(f) });
    if (okAdd) setF(empty);
  }

  return (
    <div>
      <ModuleHead title="Brand deals & coupons" sub="Manage coupons that generate your public storefront." />
      <Card className="mb-4 p-4">
        <div className="mb-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          <div><Label>Brand</Label><Input value={f.brand} placeholder="MyProtein" onChange={(e) => set("brand", e.target.value)} /></div>
          <div><Label>Emoji</Label><Input maxLength={2} value={f.emoji} placeholder="🥤" onChange={(e) => set("emoji", e.target.value)} /></div>
          <div><Label>Product</Label><Input value={f.product} placeholder="Whey 1kg" onChange={(e) => set("product", e.target.value)} /></div>
          <div><Label>Category</Label><Input value={f.category} placeholder="Supplements" onChange={(e) => set("category", e.target.value)} /></div>
          <div><Label>Code</Label><Input value={f.code} placeholder="SAVE20" onChange={(e) => set("code", e.target.value)} /></div>
          <div><Label>Discount</Label><Input value={f.discount} placeholder="20% off" onChange={(e) => set("discount", e.target.value)} /></div>
          <div><Label>Price</Label><Input value={f.price} placeholder="₹1,999" onChange={(e) => set("price", e.target.value)} /></div>
          <div><Label>Buy / affiliate link</Label><Input value={f.affiliate_url} placeholder="https://…" onChange={(e) => set("affiliate_url", e.target.value)} /></div>
        </div>
        <Button variant="primary" disabled={busy} onClick={add}>+ Add deal</Button>
      </Card>

      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
        {deals.length === 0 ? (
          <p className="text-[14px] text-kolab-muted">No deals yet.</p>
        ) : (
          deals.map((x) => (
            <div key={x.id} className="flex flex-col overflow-hidden rounded-xl border border-kolab-line bg-kolab-surface">
              <div className="relative grid h-20 place-items-center bg-gradient-to-br from-kolab-surface2 to-kolab-base text-[34px]">
                {x.emoji || "🏷️"}
                {x.discount && <span className="absolute right-2 top-2 rounded bg-kolab-lime px-1.5 py-0.5 font-kolab-mono text-[9px] font-bold text-kolab-base">{x.discount}</span>}
              </div>
              <div className="flex flex-1 flex-col gap-1.5 p-3.5">
                <span className="font-kolab-mono text-[9px] uppercase tracking-[0.08em] text-kolab-muted">{x.brand}{x.category ? " · " + x.category : ""}</span>
                <span className="text-[14px] font-semibold">{x.product}</span>
                {x.price && <span className="font-kolab-display text-[15px] font-black">{x.price}</span>}
                {x.code && <code className="rounded border border-dashed border-kolab-line bg-kolab-surface2 px-1.5 py-1 font-kolab-mono text-[11px] text-kolab-lime">{x.code}</code>}
                <button className="mt-1.5 rounded-[9px] border border-kolab-line bg-kolab-surface px-2.5 py-1.5 font-kolab-mono text-[10px] font-bold uppercase text-kolab-ink hover:border-kolab-clay hover:text-kolab-clay" onClick={() => call(`/api/kolab-studio/studio/deals?id=${x.id}`, { method: "DELETE" })}>
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ---------- Automation (static) ---------- */
function Automation() {
  return (
    <div>
      <ModuleHead title="Automation engine" sub="Batch once a week, schedule ahead, then just show up for comments. Real auto-publish plugs in via the channel APIs (Phase 3)." />
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {AUTO_STEPS.map((s) => (
          <Card key={s.n} className="p-4" style={{ borderTop: "3px solid var(--kolab-lime)" }}>
            <div className="font-kolab-mono text-[11px] font-bold text-kolab-lime">{s.n}</div>
            <h4 className="my-1.5 text-[15px]">{s.h}</h4>
            <p className="text-[13px] text-kolab-muted">{s.p}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ---------- Tracker ---------- */
function Tracker({ pillars, plan, call, busy }: { pillars: Pillar[]; plan: PlanItem[]; call: Call; busy: boolean }) {
  const { posted, total, pct } = trackerProgress(plan.map((p) => ({ asset_type: p.asset_type, status: p.status, done: p.done })));

  function exportCsv() {
    const rows: PlanCsvRow[] = plan.map((x) => ({
      date: x.date,
      time: x.time,
      pillar: pillars.find((p) => p.id === x.pillar_id)?.name ?? "",
      format: x.format,
      asset_type: x.asset_type,
      hook: x.hook,
      status: x.status,
      done: x.done,
      notes: x.notes,
    }));
    const csv = planToCsv(rows);
    const blob = new Blob(["﻿" + csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "content-tracker.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div>
      <ModuleHead title="Tracker" sub="Your plan as an editable checklist — set status, tick when live, export to Excel." />
      <div className="mb-4 flex flex-wrap items-center gap-3.5">
        <div className="min-w-[200px] flex-1">
          <div className="mb-1.5 flex justify-between font-kolab-mono text-[11px] uppercase tracking-[0.08em] text-kolab-muted">
            <span>Posted</span>
            <span>
              <b className="text-kolab-lime">{posted}</b> / {total}
            </span>
          </div>
          <div className="h-[11px] overflow-hidden rounded-full border border-kolab-line bg-kolab-surface2">
            <div className="h-full bg-kolab-lime transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Button disabled={!total} onClick={exportCsv}>
          ⤓ Export to Excel
        </Button>
      </div>

      {plan.length === 0 ? (
        <p className="text-[14px] text-kolab-muted">Nothing to track yet — build your calendar.</p>
      ) : (
        plan.map((x) => {
          const done = x.done || x.status === "posted";
          return (
            <div key={x.id} className={`mb-2.5 grid grid-cols-[1fr_auto] items-center gap-3 rounded-[11px] border border-kolab-line bg-kolab-surface p-3 ${done ? "opacity-60" : ""}`}>
              <div>
                <div className="text-[14px] font-semibold">{x.hook || "(idea)"}</div>
                <div className="mt-0.5 font-kolab-mono text-[10px] uppercase text-kolab-muted">
                  {(x.date || "") + (x.format ? " · " + x.format : "")}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <select
                  className="rounded-lg border border-kolab-line bg-kolab-surface2 px-2 py-1.5 font-kolab-mono text-[11px] font-bold text-kolab-ink"
                  value={x.status}
                  disabled={busy}
                  onChange={(e) => call("/api/kolab-studio/studio/plan", { method: "PATCH", body: JSON.stringify({ id: x.id, status: e.target.value as PlanStatus }) })}
                >
                  {TK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TK_LABEL[s]}
                    </option>
                  ))}
                </select>
                <label className="flex cursor-pointer items-center gap-1.5 font-kolab-mono text-[10px] uppercase text-kolab-muted">
                  <input type="checkbox" checked={done} disabled={busy} style={{ accentColor: "var(--kolab-lime)" }} onChange={(e) => call("/api/kolab-studio/studio/plan", { method: "PATCH", body: JSON.stringify({ id: x.id, done: e.target.checked }) })} /> Done
                </label>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
