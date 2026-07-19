"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Music, Clapperboard, Play, Music2, AudioLines, Mic, MessageCircle, Camera,
  Users, Ghost, AtSign, Share2, UtensilsCrossed, ShoppingBasket, ChefHat,
  ShoppingCart, Shirt, BarChart2, Wallet, Smartphone, CreditCard, Stethoscope,
  HeartPulse, Pill, Siren, Ambulance, ShieldAlert, Plane, Car, MapPin, Newspaper,
  Trophy, Gamepad2, CheckSquare, FileText, Target, MessageSquare, Mail, CalendarDays,
  Hash, Video, Contact, Wand2, TrendingUp, LayoutTemplate, Briefcase, Workflow,
  ListChecks, FileBarChart, BookOpen, ClipboardList, ArrowUpRight, HardDrive,
  type LucideIcon,
} from "lucide-react";
import { useMode } from "@/hooks/useMode";
import { appsForMode, categoriesForMode, type AppEntry } from "@/lib/apps/registry";
import { shortDeviceId } from "@/lib/deviceVault";

const ICONS: Record<string, LucideIcon> = {
  Music, Clapperboard, Play, Music2, AudioLines, Mic, MessageCircle, Camera,
  Users, Ghost, AtSign, Share2, UtensilsCrossed, ShoppingBasket, ChefHat,
  ShoppingCart, Shirt, BarChart2, Wallet, Smartphone, CreditCard, Stethoscope,
  HeartPulse, Pill, Siren, Ambulance, ShieldAlert, Plane, Car, MapPin, Newspaper,
  Trophy, Gamepad2, CheckSquare, FileText, Target, MessageSquare, Mail, CalendarDays,
  Hash, Video, Contact, Wand2, TrendingUp, LayoutTemplate, Briefcase, Workflow,
  ListChecks, FileBarChart, BookOpen, ClipboardList,
};

export function AppHub() {
  const { modeId } = useMode();
  const [device, setDevice] = useState("");
  useEffect(() => setDevice(shortDeviceId()), []);

  const apps = appsForMode(modeId);
  const categories = categoriesForMode(modeId);

  return (
    <div className="space-y-6">
      {/* Device-local data banner */}
      <div className="rounded-card border border-border-default bg-background-surface/40 p-3 flex items-center gap-3 text-xs">
        <span className="w-8 h-8 rounded-lg bg-[#34D399]/10 text-[#34D399] flex items-center justify-center flex-none"><HardDrive size={15} /></span>
        <div className="flex-1 min-w-0">
          <span className="text-text-secondary">Self-built apps keep their data <strong className="text-text-primary">on this device</strong>, mapped to your device ID.</span>
          {device && <span className="text-text-muted font-mono ml-2">{device}</span>}
        </div>
        <span className="text-[10px] font-mono text-text-muted flex-none">{apps.filter((a) => a.selfBuilt).length} self-built · {apps.filter((a) => a.kind === "external").length} linked</span>
      </div>

      {categories.map((cat) => {
        const inCat = apps.filter((a) => a.category === cat);
        if (!inCat.length) return null;
        return (
          <section key={cat}>
            <div className="flex items-center gap-2 mb-2">
              <span className="hud-label text-text-muted">{cat}</span>
              <span className="text-[10px] font-mono text-text-muted">{inCat.length}</span>
              <span className="flex-1 h-px bg-border-default" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2.5">
              {inCat.map((a) => <AppTile key={a.id} app={a} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AppTile({ app }: { app: AppEntry }) {
  const Icon = ICONS[app.icon] ?? Wand2;
  const accent = app.emergency ? "#EF4444" : app.selfBuilt ? "#34D399" : "#4FC3F7";
  const inner = (
    <div className={`group holo-card rounded-card p-3 h-full flex flex-col gap-2 hover:-translate-y-0.5 transition-transform ${app.emergency ? "border-accent-red/40" : ""}`}>
      <div className="flex items-center justify-between">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-none" style={{ background: `${accent}1A`, color: accent }}>
          <Icon size={18} />
        </span>
        {app.kind === "external" && <ArrowUpRight size={13} className="text-text-muted group-hover:text-text-primary transition-colors" />}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-text-primary truncate">{app.label}</div>
        <div className="text-[10px] font-mono mt-0.5" style={{ color: accent }}>
          {app.emergency ? "emergency" : app.selfBuilt ? "on-device" : "opens app"}
        </div>
        {app.blurb && <div className="text-[11px] text-text-muted mt-0.5 line-clamp-2">{app.blurb}</div>}
      </div>
    </div>
  );
  if (app.kind === "internal") return <Link href={app.href}>{inner}</Link>;
  const isTel = app.href.startsWith("tel:");
  return <a href={app.href} target={isTel ? undefined : "_blank"} rel="noopener noreferrer">{inner}</a>;
}
