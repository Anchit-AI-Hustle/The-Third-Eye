"use client";

/**
 * Background Automation Engine
 *
 * Runs autonomous checks and actions without user prompting:
 * - Overdue task detection and escalation
 * - Calendar conflict alerts
 * - Goal deadline warnings
 * - Pattern-based proactive actions
 * - Learning from every interaction
 */

import { detectPatterns, extractHabits, generateInsights, recordInteraction, generateSuggestions } from "@/lib/proactive";
import { recordSignal, getSignals } from "@/lib/personalization";

// ─── Automation Rules ────────────────────────────────────────────────────────

export interface AutomationRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number; // 1=highest
  lastTriggered?: string;
  cooldownMs: number; // min time between triggers
  check: (ctx: AutomationContext) => AutomationResult | null;
}

export interface AutomationContext {
  tasks: Array<{ id: string; title: string; status: string; priority: string; due_date?: string }>;
  goals: Array<{ id: string; title: string; target: number; current: number; deadline?: string }>;
  notes: Array<{ id: string; title: string }>;
  habits: ReturnType<typeof extractHabits>;
  patterns: ReturnType<typeof detectPatterns>;
  insights: ReturnType<typeof generateInsights>;
  now: Date;
}

export interface AutomationResult {
  ruleId: string;
  action: "notify" | "suggest" | "open_app" | "create_task" | "update_goal";
  title: string;
  message: string;
  urgency: "low" | "medium" | "high";
  data?: any;
}

// ─── Built-in Automation Rules ───────────────────────────────────────────────

const OVERDUE_TASK_COOLDOWN = 4 * 60 * 60 * 1000; // 4 hours
const GOAL_DEADLINE_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours
const HABIT_REMINDER_COOLDOWN = 2 * 60 * 60 * 1000; // 2 hours

const AUTOMATION_RULES: AutomationRule[] = [
  {
    id: "overdue-tasks",
    name: "Overdue Task Alert",
    description: "Alert when tasks are past their due date",
    enabled: true,
    priority: 1,
    cooldownMs: OVERDUE_TASK_COOLDOWN,
    check: (ctx) => {
      const now = ctx.now;
      const overdue = ctx.tasks.filter(
        t => t.status !== "done" && t.status !== "cancelled" &&
        t.due_date && new Date(t.due_date) < now
      );
      if (overdue.length === 0) return null;
      return {
        ruleId: "overdue-tasks",
        action: "notify",
        title: `${overdue.length} overdue task(s)`,
        message: `You have ${overdue.length} overdue task(s): ${overdue.slice(0, 3).map(t => `"${t.title}"`).join(", ")}${overdue.length > 3 ? "..." : ""}. Would you like me to help reprioritize?`,
        urgency: overdue.some(t => t.priority === "urgent") ? "high" : "medium",
      };
    },
  },
  {
    id: "goal-deadline-warning",
    name: "Goal Deadline Warning",
    description: "Warn when goals are approaching their deadline",
    enabled: true,
    priority: 2,
    cooldownMs: GOAL_DEADLINE_COOLDOWN,
    check: (ctx) => {
      const now = ctx.now;
      const soon = 7 * 24 * 60 * 60 * 1000; // 7 days
      const approaching = ctx.goals.filter(
        g => g.deadline &&
        new Date(g.deadline).getTime() - now.getTime() < soon &&
        new Date(g.deadline) > now &&
        g.current < g.target
      );
      if (approaching.length === 0) return null;
      const g = approaching[0];
      const daysLeft = Math.ceil((new Date(g.deadline!).getTime() - now.getTime()) / 86400000);
      const pct = Math.round((g.current / g.target) * 100);
      return {
        ruleId: "goal-deadline-warning",
        action: "suggest",
        title: `Goal "${g.title}" deadline approaching`,
        message: `Goal "${g.title}" is ${pct}% complete with ${daysLeft} day(s) left. You need ${Math.round(g.target - g.current)} more ${g.title.includes("run") || g.title.includes("km") ? "km" : "units"} to reach your target.`,
        urgency: daysLeft <= 2 ? "high" : "medium",
      };
    },
  },
  {
    id: "habit-reminder",
    name: "Habit Reminder",
    description: "Remind about detected habits at their usual time",
    enabled: true,
    priority: 3,
    cooldownMs: HABIT_REMINDER_COOLDOWN,
    check: (ctx) => {
      const hour = ctx.now.getHours();
      const habits = ctx.habits.filter(h => h.confidence > 0.7);
      // Check if it's within 1 hour of a habit's usual time
      for (const habit of habits) {
        const match = habit.trigger.match(/(\d+)(am|pm)/i);
        if (match) {
          let habitHour = parseInt(match[1]);
          if (match[2].toLowerCase() === "pm" && habitHour !== 12) habitHour += 12;
          if (match[2].toLowerCase() === "am" && habitHour === 12) habitHour = 0;
          if (Math.abs(hour - habitHour) <= 1) {
            return {
              ruleId: "habit-reminder",
              action: "suggest",
              title: habit.name,
              message: `It's time for your usual ${habit.action.toLowerCase()}. Want me to help?`,
              urgency: "low",
            };
          }
        }
      }
      return null;
    },
  },
  {
    id: "morning-briefing",
    name: "Morning Briefing",
    description: "Offer morning briefing at start of day",
    enabled: true,
    priority: 4,
    cooldownMs: 20 * 60 * 60 * 1000, // 20 hours
    check: (ctx) => {
      const hour = ctx.now.getHours();
      if (hour >= 7 && hour <= 9) {
        return {
          ruleId: "morning-briefing",
          action: "suggest",
          title: "Morning briefing",
          message: "Good morning! Want me to prepare your daily briefing with tasks, calendar, and weather?",
          urgency: "low",
        };
      }
      return null;
    },
  },
  {
    id: "evening-review",
    name: "Evening Review",
    description: "Suggest end-of-day review",
    enabled: true,
    priority: 5,
    cooldownMs: 20 * 60 * 60 * 1000,
    check: (ctx) => {
      const hour = ctx.now.getHours();
      if (hour >= 17 && hour <= 19) {
        const completedToday = ctx.tasks.filter(
          t => t.status === "done" // simplified check
        ).length;
        if (completedToday > 0) {
          return {
            ruleId: "evening-review",
            action: "suggest",
            title: "Daily wrap-up",
            message: `You completed ${completedToday} task(s) today. Want me to generate a daily summary?`,
            urgency: "low",
          };
        }
      }
      return null;
    },
  },
  {
    id: "pattern-automation",
    name: "Pattern-Based Automation",
    description: "Suggest automations based on detected patterns",
    enabled: true,
    priority: 6,
    cooldownMs: 24 * 60 * 60 * 1000,
    check: (ctx) => {
      const strongPatterns = ctx.patterns.filter(p => p.confidence > 0.7);
      if (strongPatterns.length === 0) return null;
      const p = strongPatterns[0];
      if (p.suggestedAction) {
        return {
          ruleId: "pattern-automation",
          action: "suggest",
          title: `Automation opportunity`,
          message: `I've noticed a pattern: ${p.description}. ${p.suggestedAction}. Want me to set this up?`,
          urgency: "low",
        };
      }
      return null;
    },
  },
];

// ─── Automation Engine ───────────────────────────────────────────────────────

export class AutomationEngine {
  private rules: AutomationRule[];
  private lastTriggered: Map<string, number> = new Map();
  private listeners: Array<(result: AutomationResult) => void> = [];

  constructor(rules: AutomationRule[] = AUTOMATION_RULES) {
    this.rules = rules;
  }

  /**
   * Run all enabled rules against the current context.
   * Returns results that aren't in cooldown.
   */
  run(ctx: AutomationContext): AutomationResult[] {
    const results: AutomationResult[] = [];
    const now = Date.now();

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      // Check cooldown
      const lastTrigger = this.lastTriggered.get(rule.id) ?? 0;
      if (now - lastTrigger < rule.cooldownMs) continue;

      // Run the check
      const result = rule.check(ctx);
      if (result) {
        this.lastTriggered.set(rule.id, now);
        results.push(result);

        // Record the automation trigger
        recordSignal("automation:triggered", rule.id, {
          ruleName: rule.name,
          action: result.action,
        });

        // Notify listeners
        for (const listener of this.listeners) {
          listener(result);
        }
      }
    }

    return results.sort((a, b) => {
      const priority: Record<string, number> = { high: 0, medium: 1, low: 2 };
      return (priority[a.urgency] ?? 2) - (priority[b.urgency] ?? 2);
    });
  }

  /**
   * Subscribe to automation results.
   */
  onResult(listener: (result: AutomationResult) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Enable/disable a rule.
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.find(r => r.id === ruleId);
    if (rule) rule.enabled = enabled;
  }

  /**
   * Get all rules and their status.
   */
  getRules(): Array<{ id: string; name: string; description: string; enabled: boolean }> {
    return this.rules.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      enabled: r.enabled,
    }));
  }

  /**
   * Record that an automation result was acted on.
   */
  recordAction(resultId: string, action: string): void {
    recordSignal("automation:acted", resultId, { action });
  }
}

// Singleton instance
let engineInstance: AutomationEngine | null = null;

export function getAutomationEngine(): AutomationEngine {
  if (!engineInstance) {
    engineInstance = new AutomationEngine();
  }
  return engineInstance;
}

// ─── Autonomous Action Executor ──────────────────────────────────────────────

/**
 * Execute an autonomous action based on an automation result.
 * This is the "self-evolving" part — the system takes actions on behalf
 * of the user when it has high confidence.
 */
export async function executeAutonomousAction(
  result: AutomationResult,
  ctx: {
    openApp?: (target: string) => void;
    createTask?: (task: any) => void;
    notify?: (title: string, message: string) => void;
  }
): Promise<string> {
  switch (result.action) {
    case "notify":
      ctx.notify?.(result.title, result.message);
      return `Notified: ${result.title}`;

    case "suggest":
      // Suggestions are passive — just return the message
      return result.message;

    case "open_app":
      if (result.data?.app) {
        ctx.openApp?.(result.data.app);
        return `Opened ${result.data.app}`;
      }
      return "No app specified for open action.";

    case "create_task":
      if (result.data?.title) {
        ctx.createTask?.({
          title: result.data.title,
          priority: result.data.priority ?? "medium",
          description: result.data.description ?? "Auto-generated by JARVIS",
        });
        return `Created task: ${result.data.title}`;
      }
      return "No task details for create action.";

    default:
      return `Unknown action type: ${result.action}`;
  }
}
