"use client";

import { useEffect, useState } from "react";
import { Activity, KeyRound, Laptop, Loader2, LogIn, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Row { provider: string; status: string; model: string | null; reason: string | null; benchedUntil: string | null; checkedAt: string | null }

const LABEL: Record<string, string> = {
  ok: "Working", unknown: "Not checked yet", rate_limited: "Rate limited", quota: "Daily quota used up", credit: "Out of credit", misconfigured: "Key or model rejected", error: "Error",
};
const NAME: Record<string, string> = {
  openai: "OpenAI", gemini: "Google Gemini", "gemini-lite": "Google Gemini Flash-Lite", grok: "xAI Grok", groq: "Groq", cerebras: "Cerebras", openrouter: "OpenRouter (free models)", "openrouter-paid": "OpenRouter (paid credit)", anthropic: "Anthropic Claude (paid credit)", mistral: "Mistral",
};

// Free keys a user can get themselves, so their requests don't share the
// deployment's quota. Ollama takes the https URL of their own machine.
const OWN: { id: string; name: string; placeholder: string; url?: string }[] = [
  { id: "groq", name: "Groq", placeholder: "gsk_...", url: "https://console.groq.com/keys" },
  { id: "gemini", name: "Google Gemini", placeholder: "AIza...", url: "https://aistudio.google.com/apikey" },
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-...", url: "https://openrouter.ai/keys" },
  { id: "mistral", name: "Mistral", placeholder: "Mistral API key", url: "https://console.mistral.ai/api-keys" },
  { id: "cerebras", name: "Cerebras", placeholder: "csk-...", url: "https://cloud.cerebras.ai" },
  { id: "openai", name: "OpenAI", placeholder: "sk-..." },
  { id: "ollama", name: "Ollama on your computer", placeholder: "https://your-tunnel.example.com" },
];

const ASSISTANTS = [
  { id: "jarvis", name: "JARVIS" }, { id: "friday", name: "FRIDAY" }, { id: "edith", name: "E.D.I.T.H." }, { id: "ultron", name: "ULTRON" },
];

interface LocalModel { localFirst: boolean; model: string | null; assistantModels: Record<string, string>; hasToken: boolean }

const field = "rounded-input border border-border-default bg-background-base px-2 py-1.5 text-sm text-text-primary";
const button = "px-3 py-1.5 rounded-input border border-border-default text-xs text-text-secondary hover:text-text-primary disabled:opacity-50";

// The user's own computer (Ollama through a tunnel): answers first unless
// turned off, runs the model they pick, optionally one per assistant.
function YourComputer() {
  const [s, setS] = useState<LocalModel | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [test, setTest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [perAssistant, setPerAssistant] = useState<Record<string, string>>({});
  const [token, setToken] = useState("");

  const load = () => fetch("/api/user/local-model").then((r) => r.json()).then((j: LocalModel) => {
    setS(j); setModel(j.model ?? ""); setPerAssistant(j.assistantModels ?? {});
  }).catch(() => {});
  useEffect(() => { void load(); }, []);

  async function save(body: Record<string, unknown>, done: string) {
    setBusy(true); setNote(null);
    const r = await fetch("/api/user/local-model", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    setNote(r?.ok ? done : j?.error ?? "Couldn't save it.");
    if (r?.ok) void load();
  }

  async function runTest() {
    setBusy(true); setTest(null);
    const r = await fetch("/api/user/local-model", { method: "POST" }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (j?.ok) { setModels(j.models ?? []); setTest(`Connected - ${j.models?.length ?? 0} models, ${j.ms} ms`); }
    else setTest(j?.error ?? "Couldn't reach it.");
  }

  if (!s) return null;
  const options = Array.from(new Set([...models, ...(model ? [model] : []), ...Object.values(perAssistant)]));
  const picker = (value: string, onChange: (v: string) => void, empty: string, label: string) => options.length ? (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={`${field} flex-1 min-w-0`}>
      <option value="">{empty}</option>
      {options.map((m) => <option key={m} value={m}>{m}</option>)}
    </select>
  ) : (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={empty} aria-label={label} className={`${field} flex-1 min-w-0`} />
  );

  return (
    <div className="mt-4 pt-4 border-t border-border-default space-y-3">
      <div className="flex items-center gap-2">
        <Laptop size={13} className="text-[#4FC3F7]" />
        <h3 className="text-sm font-medium text-text-primary flex-1">Your computer</h3>
        <button type="button" onClick={() => void runTest()} disabled={busy} className={button}>Test connection</button>
      </div>
      {test && <p className="text-xs text-text-secondary">{test}</p>}
      <label className="flex items-start gap-2 text-sm text-text-primary">
        <input type="checkbox" checked={s.localFirst} disabled={busy} onChange={(e) => void save({ localFirst: e.target.checked }, e.target.checked ? "Your computer answers first." : "The cloud answers first now.")} className="mt-1" />
        <span>Answer from my computer first (free)
          <span className="block text-xs text-text-muted">Your computer answers first; the free cloud models take over when it&apos;s asleep or busy.</span>
        </span>
      </label>
      <div>
        <p className="text-xs text-text-muted mb-1">Model {models.length === 0 && "(Test connection to pick from your computer's models)"}</p>
        <div className="flex gap-2">
          {picker(model, setModel, "Default (llama3.1:8b)", "Model")}
          <button type="button" onClick={() => void save({ model }, "Model saved.")} disabled={busy} className={button}>Save</button>
        </div>
      </div>
      <div>
        <p className="text-xs text-text-muted mb-1">Per assistant</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ASSISTANTS.map((a) => (
            <div key={a.id} className="flex items-center gap-2">
              <span className="w-20 text-xs text-text-secondary flex-none">{a.name}</span>
              {picker(perAssistant[a.id] ?? "", (v) => setPerAssistant((p) => ({ ...p, [a.id]: v })), "Same as above", `${a.name} model`)}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => void save({ assistantModels: perAssistant }, "Assistant models saved.")} disabled={busy} className={`${button} mt-2`}>Save assistant models</button>
      </div>
      <div>
        <p className="text-xs text-text-muted mb-1">Tunnel password {s.hasToken && <span className="text-text-secondary">· saved</span>}</p>
        <div className="flex gap-2">
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Only if your tunnel asks for one" autoComplete="off" aria-label="Tunnel password" className={`${field} flex-1 min-w-0`} />
          <button type="button" onClick={() => void save({ token }, "Password saved.").then(() => setToken(""))} disabled={busy || !token.trim()} className={button}>Save</button>
          {s.hasToken && <button type="button" onClick={() => void save({ token: "" }, "Password removed.")} disabled={busy} className={button}>Remove</button>}
        </div>
        <p className="mt-1 text-[11px] text-text-muted">user:password is sent as Basic auth, anything else as a bearer token.</p>
      </div>
      {note && <p className="text-xs text-text-secondary">{note}</p>}
    </div>
  );
}

function OwnKeys() {
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState(OWN[0].id);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = () => fetch("/api/user/provider-keys").then((r) => r.json())
    .then((j) => setSaved(Object.fromEntries((j.keys ?? []).map((k: { provider: string; hint: string }) => [k.provider, k.hint])))).catch(() => {});
  useEffect(() => {
    void load();
    const c = new URLSearchParams(window.location.search).get("connect");
    if (c === "openrouter_connected") setNote("Signed in with OpenRouter. Your chats now use your own OpenRouter account.");
    else if (c === "openrouter_error") setNote("OpenRouter sign-in didn't finish. Try again.");
  }, []);

  async function save() {
    setBusy(true); setNote(null);
    const r = await fetch("/api/user/provider-keys", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, value }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (r?.ok) { setValue(""); setNote("Saved. Your requests use it first."); void load(); }
    else setNote(j?.error ?? "Couldn't save it.");
  }

  async function remove(id: string) {
    await fetch(`/api/user/provider-keys?provider=${id}`, { method: "DELETE" }).catch(() => null);
    void load();
  }

  const pick = OWN.find((o) => o.id === provider)!;
  return (
    <div className="mt-4 pt-4 border-t border-border-default">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={13} className="text-[#4FC3F7]" />
        <h3 className="text-sm font-medium text-text-primary">Your own keys</h3>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Add your own free key so your chats run on your quota first and fall back to the shared ones. Keys are stored encrypted and never shown again.
        {pick.id === "ollama" && " For Ollama, run it on your computer and expose it through an https tunnel (Cloudflare Tunnel or ngrok)."}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <select value={provider} onChange={(e) => setProvider(e.target.value)} aria-label="Provider"
          className="rounded-input border border-border-default bg-background-base px-2 py-1.5 text-sm text-text-primary">
          {OWN.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <input type={provider === "ollama" ? "url" : "password"} value={value} onChange={(e) => setValue(e.target.value)} placeholder={pick.placeholder}
          autoComplete="off" aria-label={`${pick.name} key`}
          className="flex-1 min-w-0 rounded-input border border-border-default bg-background-base px-2 py-1.5 text-sm text-text-primary" />
        <button type="button" onClick={() => void save()} disabled={busy || !value.trim()}
          className="px-3 py-1.5 rounded-input border border-border-default text-xs text-text-secondary hover:text-text-primary disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : "Save"}
        </button>
      </div>
      <a href="/api/connect/openrouter" className={`${button} mt-2 inline-flex items-center gap-1.5`}>
        <LogIn size={12} /> Sign in with OpenRouter
      </a>
      <p className="mt-1 text-[11px] text-text-muted">Uses your own OpenRouter account: its free models, or your credit for paid ones.</p>
      {pick.url && <a href={pick.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11px] text-[#4FC3F7] hover:underline">Get a {pick.name} key</a>}
      {note && <p className="mt-2 text-xs text-text-secondary">{note}</p>}
      {Object.keys(saved).length > 0 && (
        <ul className="mt-3 space-y-1">
          {OWN.filter((o) => saved[o.id]).map((o) => (
            <li key={o.id} className="flex items-center gap-2 text-xs text-text-secondary">
              <span className="flex-1">{o.name} <span className="font-mono text-text-muted">{saved[o.id]}</span></span>
              <button type="button" onClick={() => void remove(o.id)} aria-label={`Remove ${o.name} key`} className="text-text-muted hover:text-accent-red"><Trash2 size={12} /></button>
            </li>
          ))}
        </ul>
      )}
      {saved.ollama && <YourComputer />}
    </div>
  );
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function ProvidersCard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/providers").then((r) => r.json()).then((j) => setRows(j.providers ?? [])).catch(() => setRows([]));
  }, []);

  async function recheck() {
    setBusy(true); setNote(null);
    const r = await fetch("/api/providers", { method: "POST" }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (r?.ok) setRows(j.providers ?? []);
    else setNote(j?.error ?? "Couldn't run the check.");
  }

  const working = rows?.filter((r) => r.status === "ok").length ?? 0;

  return (
    <section className="rounded-card border border-border-default bg-background-surface/30 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-1">
        <Activity size={15} className="text-[#4FC3F7]" />
        <h2 className="font-semibold text-text-primary text-sm flex-1">AI providers</h2>
        <button type="button" onClick={() => void recheck()} disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-input border border-border-default text-xs text-text-secondary hover:text-text-primary disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Re-check now
        </button>
      </div>
      <p className="text-xs text-text-muted mb-3">
        JARVIS skips any provider that is rate limited, out of quota or out of credit, and switches to a model the provider still offers when one is retired.
      </p>
      {rows === null ? (
        <div className="flex items-center gap-2 text-xs text-text-muted"><Loader2 size={12} className="animate-spin" /> Loading…</div>
      ) : (
        <>
          {rows.length > 0 && working === 0 && rows.some((r) => r.status !== "unknown") && (
            <p className="mb-3 text-xs text-accent-red">No provider is answering right now, so The Third Eye can&apos;t reply. Add credit or enable billing on one of them.</p>
          )}
          <ul className="space-y-1.5">
            {rows.map((r) => (
              <li key={r.provider} className="flex items-start gap-3 rounded-input border border-border-default bg-background-base/40 px-3 py-2">
                <span className={cn("mt-1.5 w-2 h-2 rounded-full flex-none",
                  r.status === "ok" ? "bg-success" : r.status === "unknown" ? "bg-text-muted" : r.status === "rate_limited" ? "bg-warning" : "bg-accent-red")} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text-primary">{NAME[r.provider] ?? r.provider} <span className="text-xs text-text-muted">· {LABEL[r.status] ?? r.status}</span></p>
                  <p className="text-[11px] text-text-muted truncate">
                    {r.model ?? "-"}{r.benchedUntil ? ` · back ${time(r.benchedUntil)}` : ""}{r.checkedAt ? ` · checked ${time(r.checkedAt)}` : ""}
                  </p>
                  {r.reason && <p className="text-[11px] text-text-muted truncate" title={r.reason}>{r.reason}</p>}
                </div>
              </li>
            ))}
            {!rows.length && <li className="text-xs text-text-muted">No AI provider keys are configured on this deployment.</li>}
          </ul>
          {note && <p className="mt-2 text-xs text-warning">{note}</p>}
        </>
      )}
      <OwnKeys />
    </section>
  );
}
