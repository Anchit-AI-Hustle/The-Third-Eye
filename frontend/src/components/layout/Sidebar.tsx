"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { signOutAndClear } from "@/lib/signOutClean";
import {
  LayoutDashboard, MessageSquare, CheckSquare, BookOpen,
  BarChart2, Settings, LogOut, PanelLeftClose, PanelLeftOpen,
  FileText, Target, Sparkles, ShieldCheck, Activity, Wand2, Briefcase, LayoutGrid, Workflow, Gem, History, Bot, Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useMode, type ModeId } from "@/hooks/useMode";
import { CloudSyncBadge } from "./CloudSyncBadge";
import { PWAInstall } from "@/components/PWAInstall";
import { WalletWidget } from "@/components/billing/WalletWidget";

const COLLAPSE_KEY = "tte-sidebar-collapsed";

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  modes?: ModeId[];
}
interface NavGroup { title: string; items: NavItem[] }

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Assistant", href: "/assistant", icon: MessageSquare },
      { label: "Online Agents", href: "/agents", icon: Bot },
      { label: "Generations", href: "/generations", icon: History },
    ],
  },
  {
    title: "Workspace",
    items: [
      { label: "Task Tracker", href: "/tasks", icon: CheckSquare },
      { label: "Life Log", href: "/lifelog", icon: Radio },
      { label: "Notes", href: "/notes", icon: FileText },
      { label: "Goals", href: "/goals", icon: Target },
      { label: "Knowledge", href: "/knowledge", icon: BookOpen },
    ],
  },
  {
    title: "Create & Grow",
    items: [
      { label: "Studio", href: "/tools", icon: Wand2 },
      { label: "Skills", href: "/skills", icon: Workflow },
      { label: "Job Agent", href: "/job-agent", icon: Briefcase, modes: ["personal", "professional"] },
      { label: "Kolab", href: "/kolab", icon: Workflow, modes: ["professional", "enterprise"] },
    ],
  },
  {
    title: "Apps & Life",
    items: [
      { label: "Apps", href: "/apps", icon: LayoutGrid },
      { label: "Finance", href: "/finance", icon: BarChart2, modes: ["personal", "professional"] },
    ],
  },
  {
    title: "Account & System",
    items: [
      { label: "Plans & Credits", href: "/plans", icon: Gem },
      { label: "Capabilities", href: "/capabilities", icon: Sparkles },
      { label: "Agent Activity", href: "/activity", icon: Activity },
      { label: "App Audit", href: "/audit", icon: ShieldCheck },
    ],
  },
];

function visibleItems(items: NavItem[], modeId: ModeId): NavItem[] {
  return items.filter((it) => !it.modes || it.modes.includes(modeId));
}

// Labels show on an expanded desktop sidebar and on the phone overlay.
// The icon rail (phone by default, desktop after collapse) hides them.
function hideWhenRail(collapsed: boolean, narrowOpen: boolean) {
  return cn(!narrowOpen && "max-lg:hidden", collapsed && "lg:hidden");
}
function onlyWhenRail(collapsed: boolean, narrowOpen: boolean) {
  return cn(narrowOpen && "hidden", !collapsed && "lg:hidden");
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [collapsed, setCollapsed] = useState(false);
  const [narrowOpen, setNarrowOpen] = useState(false);
  const { mode, modes, setMode } = useMode();

  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
  }, []);

  useEffect(() => {
    setNarrowOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => { if (mq.matches) setNarrowOpen(false); };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setNarrowOpen((open) => !open);
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  const labels = hideWhenRail(collapsed, narrowOpen);
  const railOnly = onlyWhenRail(collapsed, narrowOpen);
  const railAlign = cn(
    !narrowOpen && "max-lg:justify-center max-lg:px-2",
    collapsed && "lg:justify-center lg:px-2",
  );

  return (
    <>
      {narrowOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setNarrowOpen(false)}
          aria-hidden="true"
        />
      )}
      {narrowOpen && <div className="w-16 flex-none lg:hidden" aria-hidden="true" />}
      <aside
        aria-label="Main menu"
        className={cn(
          "flex flex-col h-screen bg-background-surface border-r border-border-default transition-all duration-200 ease-in-out z-50",
          narrowOpen
            ? "fixed inset-y-0 left-0 w-60"
            : cn("sticky top-0 flex-none", collapsed ? "w-16" : "w-16 lg:w-60 xl:w-64 3xl:w-72"),
        )}
      >
      <div className={cn(
        "flex items-center gap-3 border-b border-border-default h-16 flex-none px-3",
        railAlign,
      )}>
        <div className="arc-reactor flex-none" style={{ width: 32, height: 32 }}>
          <div className="arc-reactor-core" style={{ width: 8, height: 8 }} />
        </div>

        <div className={cn("flex-1 min-w-0", labels)}>
          <div className="font-display font-semibold text-text-primary tracking-tight leading-none gradient-text-arc">
            The Third Eye
          </div>
          <div className="text-[10px] font-mono text-text-muted mt-0.5 tracking-wider">v0.1.0 · ONLINE</div>
        </div>

        <button onClick={toggle}
          className={cn("text-text-muted hover:text-text-primary transition-colors p-2 rounded hover:bg-background-elevated", labels)}
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
          aria-expanded="true">
          <PanelLeftClose size={16} />
        </button>
      </div>

      <button onClick={toggle}
        className={cn(
          "mx-auto mt-3 p-2 text-text-muted hover:text-text-primary hover:bg-background-elevated rounded transition-colors",
          railOnly,
        )}
        title="Expand sidebar"
        aria-label="Expand sidebar"
        aria-expanded="false">
        <PanelLeftOpen size={16} />
      </button>

      <div className={cn("px-3 pt-3", labels)}>
        <div className="hud-label text-text-muted mb-1.5 px-1">Mode</div>
        <div className="space-y-1">
          {modes.map((m) => {
            const on = m.id === mode.id;
            return (
              <button key={m.id} onClick={() => setMode(m.id)} title={m.tagline}
                className={cn(
                  "w-full flex items-center gap-2 px-2.5 py-1.5 rounded-input border text-left transition-all",
                  on ? "border-transparent" : "border-border-default hover:bg-background-elevated"
                )}
                style={on ? { background: `${m.accentColor}1A`, borderColor: m.accentColor } : undefined}>
                <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: m.accentColor }} />
                <span className={cn("text-xs font-medium flex-1", on ? "text-text-primary" : "text-text-secondary")}>{m.label}</span>
                {on && <span className="text-[9px] font-mono uppercase tracking-wider" style={{ color: m.accentColor }}>active</span>}
              </button>
            );
          })}
        </div>
        <div className="text-[10px] text-text-muted mt-1.5 px-1">{mode.tagline}</div>
      </div>
      <button
        onClick={() => {
          const idx = modes.findIndex((m) => m.id === mode.id);
          setMode(modes[(idx + 1) % modes.length].id);
        }}
        title={`Mode: ${mode.label} — click to cycle`}
        className={cn(
          "mx-auto mt-3 w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-mono font-semibold text-background-base",
          railOnly,
        )}
        style={{ background: mode.accentColor }}>
        {mode.label.slice(0, 1)}
      </button>

      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {NAV_GROUPS.map((group, gi) => {
          const items = visibleItems(group.items, mode.id);
          if (items.length === 0) return null;
          return (
            <div key={group.title} className={cn(
              gi > 0 && "mt-3",
              gi > 0 && !narrowOpen && "max-lg:mt-2 max-lg:pt-2 max-lg:border-t max-lg:border-border-default/50",
              gi > 0 && collapsed && "lg:mt-2 lg:pt-2 lg:border-t lg:border-border-default/50",
            )}>
              <div className={cn("hud-label text-text-muted px-3 mb-1 text-[10px]", labels)}>{group.title}</div>
              <div className="space-y-0.5">
                {items.map(({ label, href, icon: Icon }) => {
                  const isActive = pathname.startsWith(href);
                  return (
                    <Link key={href} href={href} title={label}
                      className={cn(
                        "flex items-center gap-3 rounded-input text-sm transition-all duration-150 relative px-3 py-2.5",
                        railAlign,
                        !narrowOpen && "max-lg:py-3",
                        collapsed && "lg:py-3",
                        isActive
                          ? "bg-[#4FC3F7]/8 text-[#4FC3F7]"
                          : "text-text-secondary hover:text-text-primary hover:bg-background-elevated"
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-[#4FC3F7] rounded-r shadow-[0_0_8px_rgba(79,195,247,0.5)]" />
                      )}
                      <Icon size={16} className="flex-none" />
                      <span className={cn("flex-1 font-mono text-xs tracking-wide", labels)}>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border-default px-2 py-3 space-y-0.5 flex-none">
        <div className={cn("px-1 pb-1.5", labels)}>
          <WalletWidget />
        </div>
        <PWAInstall collapsed={collapsed} narrowOpen={narrowOpen} />
        <CloudSyncBadge collapsed={collapsed} narrowOpen={narrowOpen} />
        <Link href="/settings" title="Settings"
          className={cn(
            "flex items-center gap-3 rounded-input text-sm text-text-secondary hover:text-text-primary hover:bg-background-elevated transition-all border border-transparent px-3 py-2.5",
            railAlign,
            !narrowOpen && "max-lg:py-3",
            collapsed && "lg:py-3",
          )}
        >
          <Settings size={16} className="flex-none" />
          <span className={cn("font-mono text-xs tracking-wide", labels)}>Settings</span>
        </Link>

        {session?.user && (
          <div className={cn("flex items-center gap-2.5 px-3 py-2 rounded-input", railAlign)}>
            {session.user.image ? (
              <img
                src={session.user.image}
                alt={session.user.name ?? ""}
                className="w-6 h-6 rounded-full flex-none object-cover ring-1 ring-[#4FC3F7]/20"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[#4FC3F7]/10 border border-[#4FC3F7]/30 flex-none flex items-center justify-center text-xs text-[#4FC3F7] font-semibold">
                {session.user.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
            <span className={cn("text-text-secondary text-xs truncate flex-1 font-mono", labels)}>
              {session.user.name?.split(" ")[0] ?? session.user.email}
            </span>
            <button onClick={() => signOutAndClear({ callbackUrl: "/auth/signin" })}
              className={cn("text-text-muted hover:text-accent-red transition-colors p-1.5", labels)}
              title="Sign out"
              aria-label="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}
