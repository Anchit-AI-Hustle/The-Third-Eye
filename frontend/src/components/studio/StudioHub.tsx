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

export function StudioHub() {
  const { modeId, setMode } = useMode();
  const order: ModeId[] = ["professional", "enterprise", "personal"];

  return (
    <div className="space-y-8">
      {order.map((m) => {
        const studio = STUDIOS[m];
        const StudioIcon = ICONS[studio.icon] ?? Rocket;
        const tools = STUDIO_TOOLS.filter((t) => t.mode === m);
        const active = modeId === m;
        return (
          <section key={m}>
            <div className="flex items-center gap-2.5 mb-3">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center flex-none" style={{ background: `${studio.accent}1A`, color: studio.accent }}>
                <StudioIcon size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-primary" style={{ color: studio.accent }}>{studio.name}</span>
                  {active ? (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full border" style={{ borderColor: studio.accent, color: studio.accent }}>active mode</span>
                  ) : (
                    <button onClick={() => setMode(m)} className="text-[10px] font-mono text-text-muted hover:text-text-secondary">switch to</button>
                  )}
                </div>
                <div className="text-[11px] text-text-muted">{studio.tagline}</div>
              </div>
            </div>
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
          </section>
        );
      })}
    </div>
  );
}
