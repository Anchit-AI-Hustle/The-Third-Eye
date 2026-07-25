import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { llmCascade } from "@/lib/llmCascade";
import { computeTargets } from "@/lib/health/calc";
import type { HealthInput } from "@/lib/health/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Health Engine: numeric targets are computed deterministically (calc.ts) and
// are authoritative. The LLM only writes the qualitative meal/workout plan,
// grounded in — and told never to change — those exact numbers.

function req(i: Partial<HealthInput>): string | null {
  for (const k of ["goal", "focus", "sex", "age", "heightCm", "weightKg", "activity"] as const) {
    const v = i[k] as unknown;
    if (v === undefined || v === null || v === "") return `Missing required field: ${k}`;
  }
  if (Number(i.age) < 13 || Number(i.age) > 100) return "Age must be between 13 and 100";
  if (Number(i.heightCm) < 90 || Number(i.heightCm) > 260) return "Height looks out of range";
  if (Number(i.weightKg) < 25 || Number(i.weightKg) > 400) return "Weight looks out of range";
  return null;
}

export async function POST(reqObj: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return Response.json({ error: "Not authenticated" }, { status: 401 });

  let body: HealthInput & { personalization?: string };
  try { body = await reqObj.json(); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const err = req(body);
  if (err) return Response.json({ error: err }, { status: 400 });

  // Authoritative numbers.
  const targets = computeTargets(body);

  const wantsNutrition = body.focus === "nutrition" || body.focus === "both";
  const wantsExercise = body.focus === "exercise" || body.focus === "both";

  const optional = Object.entries({
    targetWeightKg: body.targetWeightKg, pace: body.pace, bodyFatPct: body.bodyFatPct,
    dietaryPreference: body.dietaryPreference, allergies: (body.allergies || []).join(", "),
    cuisine: body.cuisine, mealsPerDay: body.mealsPerDay, budget: body.budget,
    trainingDaysPerWeek: body.trainingDaysPerWeek, sessionMinutes: body.sessionMinutes,
    experience: body.experience, equipment: body.equipment, targetMuscles: body.targetMuscles,
    injuries: body.injuries, conditions: body.conditions, notes: body.notes,
  }).filter(([, v]) => v !== undefined && v !== "" && v !== null).map(([k, v]) => `${k}: ${v}`).join("\n");

  const system = `You are a careful, evidence-based fitness coach and registered-dietitian-style planner.
You are given EXACT daily targets that are already correct — you MUST NOT change or recompute them; build the plan to hit them.
Rules: never exceed a safe deficit; respect all dietary preferences, allergies, injuries, and medical conditions; if a condition makes a plan unsafe, say so and recommend a professional; never promise medical outcomes; be specific and practical. Return clean Markdown only.`;

  const ask = `Goal: ${body.goal}. Focus: ${body.focus}.
EXACT DAILY TARGETS (do not change): ${targets.goalCalories} kcal · protein ${targets.macros.proteinG} g · fat ${targets.macros.fatG} g · carbs ${targets.macros.carbsG} g · water ~${Math.round(targets.waterMl / 1000 * 10) / 10} L.
Context: ${body.sex}, ${body.age}y, ${body.heightCm} cm, ${body.weightKg} kg, activity ${body.activity}, BMI ${targets.bmi} (${targets.bmiCategory}).
${optional ? `Optional details:\n${optional}` : "No optional details provided — use sensible defaults and keep it simple."}
${body.personalization ? `\n${body.personalization}` : ""}

Produce Markdown:
${wantsNutrition ? `## Nutrition\n- A full day's meal plan (${body.mealsPerDay || "3-4"} meals) that ADDS UP to the exact calories & macros above (show per-meal kcal + protein). Respect diet/allergies/cuisine/budget. Add 2-3 swap options and a short grocery list.\n` : ""}
${wantsExercise ? `## Training\n- A weekly plan for ${body.trainingDaysPerWeek || "3-4"} days (${body.sessionMinutes || 45} min) matched to the goal, ${body.experience || "beginner"} level, ${body.equipment || "any equipment"}. Per day: focus, warm-up, main lifts with sets×reps×rest, and progression. Respect injuries: ${body.injuries || "none stated"}.\n` : ""}
## Weekly check-ins
- What to measure and how to adjust if progress stalls.`;

  try {
    const out = await llmCascade({
      system,
      messages: [{ role: "user", content: ask }],
      maxTokens: 2600, temperature: 0.5, stage: "tool:health",
    });
    return Response.json({ targets, plan: out.text.trim(), provider: out.provider });
  } catch (e) {
    // Targets are still valuable without the AI plan — degrade gracefully.
    return Response.json({ targets, plan: null, warning: "AI plan unavailable right now — your targets above are still accurate.", error: e instanceof Error ? e.message : "ai_unavailable" });
  }
}
