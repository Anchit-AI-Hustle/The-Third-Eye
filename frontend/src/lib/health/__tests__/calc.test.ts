import { describe, it, expect } from "vitest";
import { bmr, computeTargets, bmiCategory, toMetric } from "../calc";
import type { HealthInput } from "../types";

const base: HealthInput = {
  goal: "maintain", focus: "both", sex: "male", age: 30, heightCm: 180, weightKg: 80, activity: "moderate",
};

describe("BMR (Mifflin-St Jeor)", () => {
  it("computes male BMR", () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(bmr("male", 80, 180, 30)).toBe(1780);
  });
  it("computes female BMR", () => {
    // 10*60 + 6.25*165 - 5*30 - 161 = 600 + 1031.25 - 150 - 161 = 1320.25 → 1320
    expect(bmr("female", 60, 165, 30)).toBe(1320);
  });
});

describe("targets", () => {
  it("maintenance = TDEE (BMR × 1.55)", () => {
    const t = computeTargets(base);
    expect(t.bmr).toBe(1780);
    expect(t.tdee).toBe(2759); // 1780*1.55 = 2759
    expect(t.goalCalories).toBe(2759);
    expect(t.dailyDeltaKcal).toBe(0);
  });
  it("weight-loss applies a safe deficit and correct macros", () => {
    const t = computeTargets({ ...base, goal: "lose", pace: "steady" });
    expect(t.dailyDeltaKcal).toBe(-550); // 0.5 kg/wk * 7700 / 7 = 550
    expect(t.goalCalories).toBe(2209); // 2759 - 550
    expect(t.estWeeklyChangeKg).toBeCloseTo(-0.5, 1); // -550*7/7700
    expect(t.macros.proteinG).toBe(160); // 2.0 g/kg
    expect(t.macros.fatG).toBe(64); // 0.8 g/kg
    // carbs = (2209 - 640 - 576)/4 = 993/4 = 248.25 → 248
    expect(t.macros.carbsG).toBe(248);
  });
  it("never goes below the safe calorie floor", () => {
    const t = computeTargets({ sex: "female", age: 25, heightCm: 155, weightKg: 48, activity: "sedentary", goal: "lose", focus: "nutrition", pace: "aggressive" });
    expect(t.goalCalories).toBeGreaterThanOrEqual(1200);
    expect(t.warnings.some((w) => /floor/i.test(w))).toBe(true);
  });
  it("gain applies a surplus", () => {
    const t = computeTargets({ ...base, goal: "gain", pace: "steady" });
    expect(t.dailyDeltaKcal).toBeGreaterThan(0);
    expect(t.goalCalories).toBeGreaterThan(t.maintenanceCalories);
  });
  it("estimates ETA to a target weight", () => {
    const t = computeTargets({ ...base, goal: "lose", pace: "steady", targetWeightKg: 75 });
    expect(t.etaWeeks).toBeGreaterThan(0);
  });
  it("computes BMI + healthy range", () => {
    const t = computeTargets(base);
    expect(t.bmi).toBeCloseTo(24.7, 1);
    expect(t.bmiCategory).toBe("Healthy");
    expect(t.healthyWeightRangeKg[0]).toBeLessThan(t.healthyWeightRangeKg[1]);
  });
});

describe("helpers", () => {
  it("bmiCategory thresholds", () => {
    expect(bmiCategory(17)).toBe("Underweight");
    expect(bmiCategory(22)).toBe("Healthy");
    expect(bmiCategory(27)).toBe("Overweight");
    expect(bmiCategory(32)).toBe("Obese");
  });
  it("imperial conversion", () => {
    const { heightCm, weightKg } = toMetric(70, 176);
    expect(heightCm).toBeCloseTo(177.8, 1);
    expect(weightKg).toBeCloseTo(79.8, 1);
  });
});
