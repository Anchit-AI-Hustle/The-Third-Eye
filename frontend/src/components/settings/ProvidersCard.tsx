"use client";

import { useEffect, useState } from "react";
import { Activity, KeyRound, Laptop, Loader2, LogIn, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Row { provider: string; status: string; model: string | null; reason: string | null; benchedUntil: string | null; checkedAt: string | null }

const LABEL: Record<string, string> = {
  ok: "Working", unknown: "Not checked yet", rate_limited: "Rate limited", quota: "Daily quota used up", credit: "Out of credit", misconfigured: "Key or model rejected", error: "Error",
};
const NAME: Record<string, string> = {
  openai: "OpenAI", gemini: "Google Gemini", "gemini-lite": "Google Gemini Flash-Lite", grok: "xAI Grok", groq: "Groq", cerebras: "Cerebras", openrouter: "OpenRouter (free models)", "openrouter-paid": "OpenRouter (paid credit)", anthropic: "Anthropic Claude (paid credit)", mistral: "Mistral", huggingface: "Hugging Face",
};

// Each provider's own way in: a sign-in where the provider offers one to other
// apps (OpenRouter, Hugging Face), otherwise a key from its console. Ollama
// takes the https URL of the user's own machine.
const OWN: { id: string; name: string; placeholder: string; note: string; url?: string; signIn?: string }[] = [
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-...", note: "Free models, or your credit for paid ones", signIn: "/api/connect/openrouter" },
  { id: "huggingface", name: "Hugging Face", placeholder: "hf_...", note: "Open models on your Hugging Face inference credit", signIn: "/api/connect/huggingface" },
  { id: "groq", name: "Groq", placeholder: "gsk_...", note: "Free key from the Groq console", url: "https://console.groq.com/keys" },
  { id: "gemini", name: "Google Gemini", placeholder: "AIza...", note: "Free key from Google AI Studio", url: "https://aistudio.google.com/apikey" },
  { id: "mistral", name: "Mistral", placeholder: "Mistral API key", note: "Free key from the Mistral console", url: "https://console.mistral.ai/api-keys" },
  { id: "cerebras", name: "Cerebras", placeholder: "csk-...", note: "Free key from Cerebras Cloud", url: "https://cloud.cerebras.ai" },
  { id: "openai", name: "OpenAI", placeholder: "sk-...", note: "API key from the OpenAI platform (billed to you)", url: "https://platform.openai.com/api-keys" },
  { id: "ollama", name: "Ollama on your computer", placeholder: "https://your-tunnel.example.com", note: "Expose Ollama through an https tunnel (Cloudflare Tunnel or ngrok)" },
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

  const load = () => fetch("/api/user/local-model").then((r) => r.json() as Promise<LocalModel>);
  useEffect(() => {
    load().then((j) => { setS(j); setModel(j.model ?? ""); setPerAssistant(j.assistantModels ?? {}); }).catch(() => {});
  }, []);

  async function save(body: Record<string, unknown>, done: string) {
    setBusy(true); setNote(null);
    const r = await fetch("/api/user/local-model", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    setNote(r?.ok ? done : j?.error ?? "Couldn't save it.");
    if (r?.ok) load().then(setS).catch(() => {});
    return !!r?.ok;
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
  const picker = (value: string, onChange: (v: string) => void, empty: string, label: string) => (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={empty} aria-label={label} list="local-models" autoComplete="off" className={`${field} flex-1 min-w-0`} />
  );

  return (
    <div className="mt-4 pt-4 border-t border-border-default space-y-3">
      <datalist id="local-models">{options.map((m) => <option key={m} value={m} />)}</datalist>
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
          <button type="button" onClick={() => void save({ token }, "Password saved.").then((ok) => ok && setToken(""))} disabled={busy || !token.trim()} className={button}>Save</button>
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
  const [adding, setAdding] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = () => fetch("/api/user/provider-keys").then((r) => r.json())
    .then((j) => setSaved(Object.fromEntries((j.keys ?? []).map((k: { provider: string; hint: string }) => [k.provider, k.hint])))).catch(() => {});
  useEffect(() => {
    void load();
    const c = new URLSearchParams(window.location.search).get("connect");
    const who = OWN.find((o) => c?.startsWith(`${o.id}_`))?.name;
    if (who && c?.endsWith("_connected")) setNote(`Signed in with ${who}. Your chats now use your own ${who} account.`);
    else if (who && c?.endsWith("_error")) setNote(`${who} sign-in didn't finish. Try again.`);
  }, []);

  async function save(id: string) {
    setBusy(true); setNote(null);
    const r = await fetch("/api/user/provider-keys", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: id, value }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    setBusy(false);
    if (r?.ok) { setValue(""); setAdding(null); setNote("Saved. Your requests use it first."); void load(); }
    else setNote(j?.error ?? "Couldn't save it.");
  }

  async function remove(id: string) {
    await fetch(`/api/user/provider-keys?provider=${id}`, { method: "DELETE" }).catch(() => null);
    void load();
  }

  return (
    <div className="mt-4 pt-4 border-t border-border-default">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound size={13} className="text-[#4FC3F7]" />
        <h3 className="text-sm font-medium text-text-primary">Your own accounts</h3>
      </div>
      <p className="text-xs text-text-muted mb-3">
        Connect your own account with each provider so your chats run on your quota first and fall back to the shared ones. Keys are stored encrypted and never shown again.
      </p>
      <ul className="space-y-1.5">
        {OWN.map((o) => (
          <li key={o.id} className="rounded-input border border-border-default bg-background-base/40 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[12rem] flex-1">
                <p className="text-sm text-text-primary">{o.name}</p>
                <p className="text-[11px] text-text-muted">{saved[o.id] ? <>Connected <span className="font-mono">{saved[o.id]}</span></> : o.note}</p>
              </div>
              {saved[o.id] ? (
                <button type="button" onClick={() => void remove(o.id)} aria-label={`Disconnect ${o.name}`} className={`${button} inline-flex items-center gap-1`}><Trash2 size={12} /> Disconnect</button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {o.signIn && <a href={o.signIn} className={`${button} inline-flex items-center gap-1.5`}><LogIn size={12} /> Sign in with {o.name}</a>}
                  {o.url && !o.signIn && <a href={o.url} target="_blank" rel="noreferrer" className={button}>Get a key</a>}
                  <button type="button" onClick={() => { setAdding(adding === o.id ? null : o.id); setValue(""); }} aria-expanded={adding === o.id} className={button}>
                    {o.id === "ollama" ? "Add address" : "Paste key"}
                  </button>
                </div>
              )}
            </div>
            {adding === o.id && (
              <div className="mt-2 flex gap-2">
                <input type={o.id === "ollama" ? "url" : "password"} value={value} onChange={(e) => setValue(e.target.value)} placeholder={o.placeholder}
                  autoComplete="off" aria-label={`${o.name} key`} className={`${field} flex-1 min-w-0`} />
                <button type="button" onClick={() => void save(o.id)} disabled={busy || !value.trim()} className={button}>
                  {busy ? <Loader2 size={12} className="animate-spin" /> : "Save"}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-xs text-text-secondary">{note}</p>}
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
