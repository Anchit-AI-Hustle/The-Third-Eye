"use client";

import { useState } from "react";
import { Activity, CalendarClock } from "lucide-react";
import { HealthEngine } from "./HealthEngine";
import { HealthEvents } from "./HealthEvents";

// The complete Health Engine: nutrition + exercise planning (goal-driven,
// numbers computed exactly) and a health-events finder/scheduler — combining
// what used to be separate Recipe/Meal and Workout tools.
export function HealthStudio() {
  const [tab, setTab] = useState<"plan" | "events">("plan");
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1">
        {([["plan", "Plan", Activity], ["events", "Events & classes", CalendarClock]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-input text-sm font-medium transition-colors ${tab === id ? "bg-[#34D399]/15 text-[#34D399]" : "text-text-muted hover:text-text-secondary"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>
      {tab === "plan" ? <HealthEngine /> : <HealthEvents />}
    </div>
  );
}
