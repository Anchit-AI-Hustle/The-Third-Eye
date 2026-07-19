import type { ActivityLevel, Goal, HealthInput, HealthTargets, MacroTargets, Pace, Sex } from "./types";

// Deterministic, standards-based health math. These numbers must be CORRECT, so
// they are computed here (not by an LLM): Mifflin-St Jeor BMR → activity TDEE →
// goal-adjusted calories → macros. The LLM later writes the meal/workout plan
// grounded in these exact figures.

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};

// Weekly weight-change rate (kg/week) by pace and direction. Loss is capped for
// safety; lean gain is deliberately slow.
const PACE_RATE: Record<Pace, { lose: number; gain: number }> = {
  relaxed: { lose: 0.25, gain: 0.2 },
  steady: { lose: 0.5, gain: 0.35 },
  aggressive: { lose: 0.75, gain: 0.5 },
};

const KCAL_PER_KG = 7700; // approx energy in 1 kg body mass
const MIN_CALORIES: Record<Sex, number> = { male: 1500, female: 1200 }; // safe floor

/** Mifflin-St Jeor BMR. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(base + (sex === "male" ? 5 : -161));
}

export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Healthy";
  if (bmi < 30) return "Overweight";
  return "Obese";
}

function macros(calories: number, weightKg: number, goal: Goal): MacroTargets {
  // Protein: higher for loss (preserve muscle) and muscle gain; moderate for maintain.
  const proteinPerKg = goal === "maintain" ? 1.6 : 2.0;
  const proteinG = Math.round(proteinPerKg * weightKg);
  // Fat: 0.8 g/kg floor for hormones.
  const fatG = Math.round(0.8 * weightKg);
  const proteinKcal = proteinG * 4;
  const fatKcal = fatG * 9;
  const carbsKcal = Math.max(0, calories - proteinKcal - fatKcal);
  const carbsG = Math.round(carbsKcal / 4);
  return { calories, proteinG, fatG, carbsG, proteinKcal, fatKcal, carbsKcal };
}

export function computeTargets(i: HealthInput): HealthTargets {
  const warnings: string[] = [];
  const assumptions: string[] = [];

  const weightKg = Math.max(25, Math.min(400, i.weightKg));
  const heightCm = Math.max(90, Math.min(260, i.heightCm));
  const age = Math.max(13, Math.min(100, i.age));
  if (age < 18) warnings.push("Under 18 — targets are indicative only; consult a pediatric professional.");

  const b = bmr(i.sex, weightKg, heightCm, age);
  const factor = ACTIVITY_FACTOR[i.activity];
  const tdee = Math.round(b * factor);
  const maintenance = tdee;

  const heightM = heightCm / 100;
  const bmi = +(weightKg / (heightM * heightM)).toFixed(1);
  const healthyLow = +(18.5 * heightM * heightM).toFixed(1);
  const healthyHigh = +(24.9 * heightM * heightM).toFixed(1);

  const pace: Pace = i.pace ?? "steady";
  let dailyDelta = 0;
  if (i.goal === "lose") {
    dailyDelta = -Math.round((PACE_RATE[pace].lose * KCAL_PER_KG) / 7);
  } else if (i.goal === "gain") {
    dailyDelta = Math.round((PACE_RATE[pace].gain * KCAL_PER_KG) / 7);
  }

  let goalCalories = maintenance + dailyDelta;
  const floor = MIN_CALORIES[i.sex];
  if (goalCalories < floor) {
    goalCalories = floor;
    warnings.push(`Calorie target was raised to a safe floor of ${floor} kcal — a faster deficit isn't advisable.`);
    dailyDelta = goalCalories - maintenance;
  }

  const estWeeklyChangeKg = +((dailyDelta * 7) / KCAL_PER_KG).toFixed(2);

  // ETA to target weight, if given.
  let etaWeeks: number | undefined;
  if (i.targetWeightKg && Math.abs(dailyDelta) > 0) {
    const diff = i.targetWeightKg - weightKg;
    const directionOk = (i.goal === "lose" && diff < 0) || (i.goal === "gain" && diff > 0);
    if (directionOk && estWeeklyChangeKg !== 0) {
      etaWeeks = Math.max(1, Math.round(Math.abs(diff / estWeeklyChangeKg)));
    } else if (i.goal !== "maintain") {
      warnings.push("Your target weight doesn't match your goal direction — double-check goal vs target.");
    }
  }

  const m = macros(goalCalories, weightKg, i.goal);
  const waterMl = Math.round(35 * weightKg);

  assumptions.push("BMR via Mifflin-St Jeor; TDEE = BMR × activity factor.");
  assumptions.push(`Activity factor ${factor} (${i.activity.replace("_", " ")}).`);
  if (i.goal !== "maintain") assumptions.push(`~${Math.abs(estWeeklyChangeKg)} kg/${estWeeklyChangeKg < 0 ? "week loss" : "week gain"} at ${pace} pace.`);
  assumptions.push(`Protein ${m.proteinG} g (${(m.proteinG / weightKg).toFixed(1)} g/kg), fat ${m.fatG} g; carbs fill the rest.`);
  warnings.push("Estimates for a healthy adult — not medical advice. Check with a professional for conditions, pregnancy, or eating disorders.");

  return {
    bmr: b, tdee, maintenanceCalories: maintenance, goalCalories, dailyDeltaKcal: dailyDelta,
    estWeeklyChangeKg, macros: m, bmi, bmiCategory: bmiCategory(bmi),
    healthyWeightRangeKg: [healthyLow, healthyHigh], waterMl, proteinPerKg: +(m.proteinG / weightKg).toFixed(2),
    etaWeeks, warnings, assumptions,
  };
}

/** Convert imperial inputs to metric before computeTargets. */
export function toMetric(heightIn: number, weightLb: number): { heightCm: number; weightKg: number } {
  return { heightCm: +(heightIn * 2.54).toFixed(1), weightKg: +(weightLb * 0.453592).toFixed(1) };
}
