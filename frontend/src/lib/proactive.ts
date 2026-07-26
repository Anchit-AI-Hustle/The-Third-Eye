"use client";

/**
 * Proactive Intelligence Engine
 *
 * Detects patterns from user signals, generates contextual suggestions,
 * and learns from behavior over time. All processing happens client-side
 * using the device vault for privacy.
 */

import { recordSignal, getSignals, topValue, timePreference, type Signal } from "@/lib/personalization";

// ─── Pattern Types ───────────────────────────────────────────────────────────

export interface Pattern {
  id: string;
  kind: string;
  description: string;
  confidence: number;       // 0–1
  frequency: number;        // occurrences in window
  lastSeen: string;         // ISO
  suggestedAction?: string;
}

export interface ProactiveSuggestion {
  id: string;
  kind: "reminder" | "insight" | "habit" | "optimization" | "alert";
  title: string;
  message: string;
  urgency: "low" | "medium" | "high";
  actions?: Array<{ label: string; command: string }>;
  context: string;
  timestamp: string;
}

export interface UserHabit {
  id: string;
  name: string;
  trigger: string;          // what causes the habit
  action: string;           // what the user does
  frequency: string;        // daily, weekly, etc.
  confidence: number;
  lastOccurrence: string;
}

export interface LearningInsight {
  id: string;
  category: string;
  insight: string;
  evidence: number;         // number of supporting signals
  confidence: number;
  generatedAt: string;
}

// ─── Pattern Detection ───────────────────────────────────────────────────────

/**
 * Analyze recent signals to detect recurring patterns.
 * Looks at signal kinds, values, and timing.
 */
export function detectPatterns(lookbackDays = 30): Pattern[] {
  const signals = getSignals();
  const cutoff = new Date(Date.now() - lookbackDays * 86400000).toISOString();
  const recent = signals.filter(s => s.at >= cutoff);

  if (recent.length < 5) return [];

  const patterns: Pattern[] = [];

  // Group by kind
  const byKind = new Map<string, Signal[]>();
  for (const s of recent) {
    const key = s.kind;
    if (!byKind.has(key)) byKind.set(key, []);
    byKind.get(key)!.push(s);
  }

  // Detect value patterns (same value repeated)
  for (const [kind, signals] of byKind) {
    const valueCounts = new Map<string, number>();
    for (const s of signals) {
      valueCounts.set(s.value, (valueCounts.get(s.value) ?? 0) + 1);
    }

    for (const [value, count] of valueCounts) {
      if (count >= 3 && count / signals.length > 0.4) {
        const confidence = Math.min(1, count / 10);
        patterns.push({
          id: `pat-${kind}-${value.replace(/\s+/g, "-").slice(0, 20)}`,
          kind,
          description: `You frequently choose "${value}" for ${kind}`,
          confidence,
          frequency: count,
          lastSeen: signals.find(s => s.value === value)?.at ?? "",
          suggestedAction: `Auto-apply "${value}" as default for ${kind}`,
        });
      }
    }
  }

  // Detect temporal patterns (same action at same time)
  const timePrefs = new Map<string, { topDays: number[]; topHours: number[] }>();
  for (const kind of byKind.keys()) {
    const tp = timePreference(kind);
    if (tp.topHours.length > 0) {
      timePrefs.set(kind, tp);
    }
  }

  for (const [kind, tp] of timePrefs) {
    if (tp.topHours.length > 0) {
      const hourNames = ["12am", "1am", "2am", "3am", "4am", "5am", "6am", "7am", "8am", "9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm", "9pm", "10pm", "11pm"];
      patterns.push({
        id: `pat-time-${kind}`,
        kind: `${kind}:timing`,
        description: `You usually do ${kind} around ${hourNames[tp.topHours[0]] ?? "unknown time"}`,
        confidence: 0.6,
        frequency: byKind.get(kind)?.length ?? 0,
        lastSeen: byKind.get(kind)?.[0]?.at ?? "",
        suggestedAction: `Schedule a reminder for ${hourNames[tp.topHours[0]] ?? "that time"}`,
      });
    }
  }

  return patterns.sort((a, b) => b.confidence - a.confidence);
}

// ─── Habit Extraction ────────────────────────────────────────────────────────

/**
 * Extract user habits from signal history.
 * A habit is a repeated action triggered by a consistent context.
 */
export function extractHabits(): UserHabit[] {
  const signals = getSignals();
  if (signals.length < 10) return [];

  const habits: UserHabit[] = [];
  const byKind = new Map<string, Signal[]>();

  for (const s of signals) {
    if (!byKind.has(s.kind)) byKind.set(s.kind, []);
    byKind.get(s.kind)!.push(s);
  }

  for (const [kind, sigs] of byKind) {
    if (sigs.length < 3) continue;

    // Check for temporal consistency
    const hours = sigs.map(s => new Date(s.at).getHours());
    const hourVariance = calculateVariance(hours);

    if (hourVariance < 4 && sigs.length >= 3) {
      const avgHour = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
      const hourNames = ["12am", "1am", "2am", "3am", "4am", "5am", "6am", "7am", "8am", "9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm", "9pm", "10pm", "11pm"];

      habits.push({
        id: `habit-${kind}`,
        name: `${kind} habit`,
        trigger: `Around ${hourNames[avgHour] ?? "same time"}`,
        action: `Perform ${kind}`,
        frequency: determineFrequency(sigs),
        confidence: Math.min(0.95, 0.5 + sigs.length * 0.05),
        lastOccurrence: sigs[0]?.at ?? "",
      });
    }

    // Check for value consistency
    const topVal = topValue(kind);
    if (topVal && sigs.length >= 5) {
      const matchCount = sigs.filter(s => s.value === topVal).length;
      if (matchCount / sigs.length > 0.6) {
        habits.push({
          id: `habit-${kind}-pref`,
          name: `${kind} preference`,
          trigger: `When doing ${kind}`,
          action: `Choose "${topVal}"`,
          frequency: determineFrequency(sigs),
          confidence: Math.min(0.95, 0.4 + (matchCount / sigs.length) * 0.5),
          lastOccurrence: sigs[0]?.at ?? "",
        });
      }
    }
  }

  return habits;
}

// ─── Insight Generation ──────────────────────────────────────────────────────

/**
 * Generate learning insights from accumulated signals and patterns.
 */
export function generateInsights(): LearningInsight[] {
  const signals = getSignals();
  const patterns = detectPatterns();
  const habits = extractHabits();
  const insights: LearningInsight[] = [];

  // Category breakdown
  const kindCounts = new Map<string, number>();
  for (const s of signals) {
    kindCounts.set(s.kind, (kindCounts.get(s.kind) ?? 0) + 1);
  }

  const totalSignals = signals.length;
  if (totalSignals > 0) {
    const sorted = [...kindCounts.entries()].sort((a, b) => b[1] - a[1]);
    const topCategory = sorted[0];
    if (topCategory) {
      insights.push({
        id: "insight-top-category",
        category: "Activity",
        insight: `Your most tracked activity is "${topCategory[0]}" (${topCategory[1]} signals, ${Math.round(topCategory[1] / totalSignals * 100)}% of all activity).`,
        evidence: topCategory[1],
        confidence: 0.9,
        generatedAt: new Date().toISOString(),
      });
    }
  }

  // Habit insights
  if (habits.length > 0) {
    const strongHabits = habits.filter(h => h.confidence > 0.7);
    if (strongHabits.length > 0) {
      insights.push({
        id: "insight-habits",
        category: "Habits",
        insight: `You have ${strongHabits.length} strong habit(s): ${strongHabits.map(h => h.name).join(", ")}. These could be automated.`,
        evidence: strongHabits.length,
        confidence: 0.85,
        generatedAt: new Date().toISOString(),
      });
    }
  }

  // Pattern insights
  const highConfPatterns = patterns.filter(p => p.confidence > 0.6);
  if (highConfPatterns.length > 0) {
    insights.push({
      id: "insight-patterns",
      category: "Patterns",
      insight: `Detected ${highConfPatterns.length} recurring pattern(s). The system is learning your preferences.`,
      evidence: highConfPatterns.length,
      confidence: 0.8,
      generatedAt: new Date().toISOString(),
    });
  }

  // Consistency insight
  if (totalSignals > 20) {
    const daySpan = getDaySpan(signals);
    const consistency = totalSignals / Math.max(1, daySpan);
    insights.push({
      id: "insight-consistency",
      category: "Engagement",
      insight: `You average ${consistency.toFixed(1)} signals per day over ${daySpan} day(s). ${consistency > 3 ? "Highly active!" : consistency > 1 ? "Moderately active." : "Consider tracking more activities for better personalization."}`,
      evidence: totalSignals,
      confidence: 0.9,
      generatedAt: new Date().toISOString(),
    });
  }

  return insights;
}

// ─── Proactive Suggestion Engine ─────────────────────────────────────────────

/**
 * Generate proactive suggestions based on time of day, patterns, and context.
 */
export function generateSuggestions(context?: {
  hour?: number;
  dayOfWeek?: number;
  location?: string;
  recentActivity?: string[];
}): ProactiveSuggestion[] {
  const now = new Date();
  const hour = context?.hour ?? now.getHours();
  const dayOfWeek = context?.dayOfWeek ?? now.getDay();
  const suggestions: ProactiveSuggestion[] = [];

  const habits = extractHabits();
  const patterns = detectPatterns();

  // Time-based suggestions
  if (hour >= 6 && hour <= 9) {
    suggestions.push({
      id: "sug-morning",
      kind: "reminder",
      title: "Morning routine",
      message: "Good morning! Based on your patterns, would you like me to prepare your daily briefing?",
      urgency: "medium",
      actions: [
        { label: "Show daily briefing", command: "weekly_report" },
        { label: "Check calendar", command: "get_calendar_events" },
      ],
      context: "morning",
      timestamp: now.toISOString(),
    });
  }

  if (hour >= 17 && hour <= 19) {
    suggestions.push({
      id: "sug-evening",
      kind: "reminder",
      title: "Evening wrap-up",
      message: "End of workday. Want me to review what you accomplished today?",
      urgency: "low",
      actions: [
        { label: "Daily summary", command: "weekly_report" },
        { label: "Review tasks", command: "search_tasks" },
      ],
      context: "evening",
      timestamp: now.toISOString(),
    });
  }

  // Sunday planning
  if (dayOfWeek === 0 && hour >= 9 && hour <= 12) {
    suggestions.push({
      id: "sug-weekly-planning",
      kind: "reminder",
      title: "Weekly planning",
      message: "It's Sunday morning — perfect time for weekly planning. Want me to prepare a weekly review?",
      urgency: "medium",
      actions: [
        { label: "Start weekly review", command: "weekly_report" },
      ],
      context: "weekly-planning",
      timestamp: now.toISOString(),
    });
  }

  // Habit-based suggestions
  for (const habit of habits) {
    if (habit.confidence > 0.7) {
      suggestions.push({
        id: `sug-habit-${habit.id}`,
        kind: "habit",
        title: habit.name,
        message: `Based on your habits, you usually ${habit.action} ${habit.trigger.toLowerCase()}. Would you like to do that now?`,
        urgency: "low",
        context: `habit:${habit.name}`,
        timestamp: now.toISOString(),
      });
    }
  }

  // Pattern-based optimizations
  const topPatterns = patterns.slice(0, 3);
  for (const pattern of topPatterns) {
    if (pattern.suggestedAction && pattern.confidence > 0.5) {
      suggestions.push({
        id: `sug-opt-${pattern.id}`,
        kind: "optimization",
        title: "Pattern detected",
        message: pattern.description + ". " + pattern.suggestedAction,
        urgency: "low",
        context: `pattern:${pattern.kind}`,
        timestamp: now.toISOString(),
      });
    }
  }

  return suggestions;
}

// ─── Utility Functions ───────────────────────────────────────────────────────

function calculateVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

function determineFrequency(signals: Signal[]): string {
  if (signals.length < 2) return "once";
  const dates = signals.map(s => new Date(s.at).toDateString());
  const uniqueDays = new Set(dates).size;
  const daySpan = getDaySpan(signals);

  if (daySpan <= 1 && signals.length >= 3) return "multiple times daily";
  if (uniqueDays / Math.max(1, daySpan) > 0.6) return "daily";
  if (uniqueDays >= 3 && daySpan > 5) return "regularly";
  return "occasionally";
}

function getDaySpan(signals: Signal[]): number {
  if (signals.length < 2) return 1;
  const dates = signals.map(s => new Date(s.at).getTime());
  const min = Math.min(...dates);
  const max = Math.max(...dates);
  return Math.max(1, Math.ceil((max - min) / 86400000));
}

// ─── Learning Loop ───────────────────────────────────────────────────────────

/**
 * Main learning loop — called periodically to update learned behaviors.
 * Records current context as a signal for pattern detection.
 */
export function learningTick(context?: {
  hour?: number;
  dayOfWeek?: number;
  recentTool?: string;
  recentAction?: string;
}): void {
  const now = new Date();
  const hour = context?.hour ?? now.getHours();
  const dayOfWeek = context?.dayOfWeek ?? now.getDay();

  // Record time context
  recordSignal("system:time", `${hour}:${now.getMinutes()}`, {
    dayOfWeek,
    hour,
  });

  // Record tool usage if provided
  if (context?.recentTool) {
    recordSignal("system:tool_usage", context.recentTool, {
      hour,
      dayOfWeek,
    });
  }

  // Record action if provided
  if (context?.recentAction) {
    recordSignal("system:action", context.recentAction, {
      hour,
      dayOfWeek,
    });
  }
}

/**
 * Record a user interaction for learning.
 */
export function recordInteraction(kind: string, value: string, meta?: Record<string, unknown>): void {
  recordSignal(kind, value, {
    ...meta,
    hour: new Date().getHours(),
    dayOfWeek: new Date().getDay(),
  });
}

/**
 * Get a summary of the user's learned behaviors for the AI context.
 */
export function getLearnedContext(): string {
  const habits = extractHabits();
  const insights = generateInsights();
  const patterns = detectPatterns();

  const lines: string[] = [];

  if (habits.length > 0) {
    lines.push("Learned habits:");
    for (const h of habits.slice(0, 5)) {
      lines.push(`  - ${h.name}: ${h.action} ${h.trigger.toLowerCase()} (${Math.round(h.confidence * 100)}% confident)`);
    }
  }

  if (insights.length > 0) {
    lines.push("Key insights:");
    for (const i of insights.slice(0, 3)) {
      lines.push(`  - ${i.insight}`);
    }
  }

  if (patterns.length > 0) {
    lines.push("Detected patterns:");
    for (const p of patterns.slice(0, 3)) {
      lines.push(`  - ${p.description}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "";
}
