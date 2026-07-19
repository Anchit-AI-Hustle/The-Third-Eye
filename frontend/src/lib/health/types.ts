// Health Engine domain types. Nutrition + exercise, goal-driven. The numeric
// targets are computed deterministically (see calc.ts) — the LLM only writes the
// qualitative plan grounded in those numbers.

export type Sex = "male" | "female";
export type Goal = "lose" | "maintain" | "gain";
export type Focus = "nutrition" | "exercise" | "both";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type UnitSystem = "metric" | "imperial";
export type Pace = "relaxed" | "steady" | "aggressive"; // rate of weight change

// Minimum required inputs (compulsory) + everything else optional (full depth).
export interface HealthInput {
  // ── compulsory minimum ──
  goal: Goal;
  focus: Focus;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  // ── optional full depth ──
  targetWeightKg?: number;
  pace?: Pace;
  bodyFatPct?: number;
  dietaryPreference?: string; // vegetarian, vegan, keto, halal, jain…
  allergies?: string[];
  cuisine?: string;
  mealsPerDay?: number;
  budget?: string;
  trainingDaysPerWeek?: number;
  sessionMinutes?: number;
  experience?: "beginner" | "intermediate" | "advanced";
  equipment?: string; // home / gym / bodyweight
  targetMuscles?: string;
  injuries?: string;
  conditions?: string; // medical conditions to be cautious about
  notes?: string;
  unit?: UnitSystem;
}

export interface MacroTargets {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  proteinKcal: number;
  fatKcal: number;
  carbsKcal: number;
}

export interface HealthTargets {
  bmr: number;
  tdee: number;
  maintenanceCalories: number;
  goalCalories: number;
  dailyDeltaKcal: number; // + surplus / - deficit vs maintenance
  estWeeklyChangeKg: number; // signed
  macros: MacroTargets;
  bmi: number;
  bmiCategory: string;
  healthyWeightRangeKg: [number, number];
  waterMl: number;
  proteinPerKg: number;
  etaWeeks?: number; // to reach targetWeight, if provided
  warnings: string[];
  assumptions: string[];
}
