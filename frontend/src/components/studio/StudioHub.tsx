"use client";

import Link from "next/link";
import {
  LayoutTemplate, Mail, Workflow, Music, PenLine, Presentation, Megaphone,
  ClipboardList, FileBarChart, ListChecks, Plane, ChefHat, Palette, Rocket,
  Building2, ArrowRight, type LucideIcon,
} from "lucide-react";
import { STUDIO_TOOLS, STUDIOS, type ModeId } from "@/lib/studioTools";
import { useMode } from "@/hooks/useMode";

const ICONS: Record<string, LucideIcon> = {
  LayoutTemplate, Mail, Workflow, Music, PenLine, Presentation, Megaphone,
  ClipboardList, FileBarChart, ListChecks, Plane, ChefHat, Palette, Rocket, Building2,
};

// Studio is mode-aware: it shows the tools for the CURRENTLY selected user mode
// only (Personal → Hobby Studio, Professional → Startup Studio, Enterprise →
// Office Studio). A tab row lets you switch studios, which switches the app mode.
const ORDER: ModeId[] = ["professional", "enterprise", "personal"];

export function StudioHub() {
  const { modeId, setMode } = useMode();
  const studio = STUDIOS[modeId];
  const StudioIcon = ICONS[studio.icon] ?? Rocket;
  const tools = STUDIO_TOOLS.filter((t) => t.mode === modeId);

  return (
    <div className="space-y-6">
      {/* Studio switcher — mirrors the active user mode */}
      <div className="flex flex-wrap gap-2">
        {ORDER.map((m) => {
          const s = STUDIOS[m];
          const Icon = ICONS[s.icon] ?? Rocket;
          const active = modeId === m;
          const count = STUDIO_TOOLS.filter((t) => t.mode === m).length;
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={active}
              title={`${s.name} — ${s.tagline}`}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-input border text-sm transition-colors ${
                active
                  ? "font-semibold"
                  : "border-border-default text-text-muted hover:text-text-secondary hover:border-border-hover"
              }`}
              style={active ? { borderColor: s.accent, color: s.accent, background: `${s.accent}12` } : undefined}
            >
              <Icon size={15} /> {s.name}
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded-full"
                style={{ background: active ? `${s.accent}22` : "var(--border-default, #ffffff14)", color: active ? s.accent : undefined }}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active studio header */}
      <div className="flex items-center gap-3">
        <span className="w-10 h-10 rounded-lg flex items-center justify-center flex-none" style={{ background: `${studio.accent}1A`, color: studio.accent }}>
          <StudioIcon size={20} />
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold" style={{ color: studio.accent }}>{studio.name}</h2>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border" style={{ borderColor: studio.accent, color: studio.accent }}>active mode</span>
            <span className="text-[11px] text-text-muted font-mono">{tools.length} tools</span>
          </div>
          <p className="text-xs text-text-muted">{studio.tagline}</p>
        </div>
      </div>

      {/* Tools for the active mode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {tools.map((t) => {
          const Icon = ICONS[t.icon] ?? LayoutTemplate;
          return (
            <Link key={t.id} href={`/tools/${t.id}`}
              className="group holo-card rounded-card p-4 hud-frame relative overflow-hidden hover:-translate-y-0.5 transition-transform">
              <div className="flex items-center justify-between mb-2">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-none" style={{ background: `${t.accent}1A`, color: t.accent }}>
                  <Icon size={18} />
                </span>
                <ArrowRight size={14} className="text-text-muted group-hover:text-text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
              <div className="text-sm font-semibold text-text-primary">{t.label}</div>
              <div className="text-xs text-text-muted mt-1 leading-relaxed line-clamp-3">{t.blurb}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
