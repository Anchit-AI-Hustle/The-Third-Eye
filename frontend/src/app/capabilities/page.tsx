"use client";
import { Check, X, Lock, Mic, Camera, MapPin, Bell, RotateCcw, Crown } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Reveal } from "@/components/hud/Reveal";
import { BRAND_LOGOS } from "@/components/BrandLogos";
import { CAPS, type Capability } from "@/lib/capabilities";
import { useAllConsents, useConsentBundle } from "@/hooks/useConsent";
import { useAgentProfile } from "@/hooks/useAgentProfile";

const STATUS_STYLE: Record<Capability["status"], string> = {
  live:    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  partial: "bg-amber-500/15  text-amber-300  border-amber-500/30",
  planned: "bg-slate-500/15  text-slate-300  border-slate-500/30",
};

const REQ_ICON: Record<NonNullable<Capability["required"][number]>, typeof Mic> = {
  mic: Mic, cam: Camera, loc: MapPin, notif: Bell, key: Lock,
};

export default function CapabilitiesPage() {
  const { mic, cam, loc, notif } = useAllConsents();
  const { reset } = useConsentBundle();
  const { active: agent } = useAgentProfile();

  const consentForReq = (r: Capability["required"][number]) => {
    if (r === "mic")   return mic;
    if (r === "cam")   return cam;
    if (r === "loc")   return loc;
    if (r === "notif") return notif;
    return null;
  };

  const groups = ["JARVIS", "E.D.I.T.H.", "ULTRON"];
  const counts = {
    live: CAPS.filter(c => c.status === "live").length,
    partial: CAPS.filter(c => c.status === "partial").length,
    planned: CAPS.filter(c => c.status === "planned").length,
  };

  return (
    <MainLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <header className="space-y-2">
          <div className="text-xs uppercase tracking-[0.2em] text-text-muted">Operator: {agent.name}</div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Capabilities</h1>
          <p className="text-sm text-text-muted">
            Full inventory of Jarvis / E.D.I.T.H. / Ultron-class features. Live = wired & ready. Partial = working with limits. Planned = scoped, not built.
          </p>
          <div className="flex flex-wrap gap-2 pt-2 text-xs">
            <span className={`px-2 py-1 rounded-full border ${STATUS_STYLE.live}`}>{counts.live} live</span>
            <span className={`px-2 py-1 rounded-full border ${STATUS_STYLE.partial}`}>{counts.partial} partial</span>
            <span className={`px-2 py-1 rounded-full border ${STATUS_STYLE.planned}`}>{counts.planned} planned</span>
          </div>
          <p className="text-xs text-amber-300/80 flex items-center gap-1.5 pt-1">
            <Crown size={12} /> Premium features are unlocked for everyone during launch - the badge just marks what becomes paid later.
          </p>
        </header>

        <section className="rounded-2xl border border-border-default bg-background-surface/30 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">Permissions</h2>
            <button onClick={reset} className="text-xs text-text-muted hover:text-text-primary flex items-center gap-1">
              <RotateCcw size={12} /> Reset & re-ask
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { icon: Mic, label: "Microphone", consent: mic },
              { icon: MapPin, label: "Location", consent: loc },
              { icon: Bell, label: "Notifications", consent: notif },
              { icon: Camera, label: "Camera", consent: cam },
            ].map(({ icon: Icon, label, consent }) => (
              <button
                key={label}
                onClick={consent.granted ? undefined : consent.request}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-colors ${
                  consent.granted   ? "border-emerald-500/40 bg-emerald-500/5"
                  : consent.denied  ? "border-rose-500/40 bg-rose-500/5"
                                    : "border-border-default bg-background-base hover:border-[#4FC3F7]/40"
                }`}
              >
                <Icon size={16} className={consent.granted ? "text-emerald-400" : consent.denied ? "text-rose-400" : "text-text-muted"} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{label}</div>
                  <div className="text-[10px] uppercase tracking-wider text-text-muted">
                    {consent.granted ? "granted" : consent.denied ? "denied" : "tap to grant"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <Reveal immediate stagger={0.03} className="space-y-6">
        {groups.map((g) => (
          <section key={g} className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">{g}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {CAPS.filter((c) => c.group === g).map((c) => (
                <div key={c.name} data-reveal className="rounded-xl border border-border-default bg-background-surface/30 p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-medium flex items-center gap-1.5">
                        {c.icon && <c.icon size={14} className="text-[#4FC3F7]" />}
                        {c.logo && (() => { const Logo = BRAND_LOGOS[c.logo]; return <Logo size={15} />; })()}
                        {c.name}
                        {c.premium && (
                          <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300">
                            <Crown size={9} /> Premium
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-text-muted leading-snug mt-0.5">{c.blurb}</p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap ${STATUS_STYLE[c.status]}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-text-muted">
                    <span className="opacity-90">{c.inspiration}</span>
                    <div className="flex gap-1.5 ml-auto">
                      {c.required.map((r) => {
                        const I = REQ_ICON[r];
                        const cs = consentForReq(r);
                        const ok = r === "key" ? c.status !== "planned" : cs?.granted;
                        return (
                          <span key={r} title={r === "key" ? `Needs ${c.envKey ?? "API key"}` : r}>
                            <I size={12} className={ok ? "text-emerald-400" : "text-text-muted"} />
                          </span>
                        );
                      })}
                      {c.status === "live"    && <Check size={12} className="text-emerald-400" />}
                      {c.status === "planned" && <X     size={12} className="text-rose-400/60" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
        </Reveal>
      </div>
    </MainLayout>
  );
}
