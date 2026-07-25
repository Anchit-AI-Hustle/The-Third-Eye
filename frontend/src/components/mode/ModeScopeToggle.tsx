"use client";

import { cn } from "@/lib/utils";
import { useMode } from "@/hooks/useMode";

// A compact segmented toggle that scopes a list to the active mode or shows
// everything. Pairs with useModeTags/filterByMode on Tasks, Knowledge, etc.
export function ModeScopeToggle({
  showAll,
  onChange,
}: {
  showAll: boolean;
  onChange: (showAll: boolean) => void;
}) {
  const { mode } = useMode();
  return (
    <div className="flex rounded-card border border-border-default overflow-hidden text-xs">
      <button
        onClick={() => onChange(false)}
        title={`Show only ${mode.label}-mode items`}
        className={cn(
          "px-3 py-2 flex items-center gap-1.5 transition-colors font-mono",
          !showAll ? "text-background-base font-semibold" : "bg-background-surface text-text-secondary hover:text-text-primary",
        )}
        style={!showAll ? { background: mode.accentColor } : undefined}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: showAll ? mode.accentColor : "currentColor" }} />
        {mode.label}
      </button>
      <button
        onClick={() => onChange(true)}
        title="Show items from every mode"
        className={cn(
          "px-3 py-2 transition-colors border-l border-border-default font-mono",
          showAll ? "bg-accent-blue text-white" : "bg-background-surface text-text-secondary hover:text-text-primary",
        )}
      >
        All
      </button>
    </div>
  );
}
