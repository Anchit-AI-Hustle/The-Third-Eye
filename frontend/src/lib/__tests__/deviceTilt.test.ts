import { describe, expect, it } from "vitest";
import { tiltFromOrientation } from "@/lib/deviceTilt";

describe("tiltFromOrientation", () => {
  const base = { beta: 45, gamma: 0 };
  it("is level at the angle the phone was first held", () => {
    expect(tiltFromOrientation(45, 0, base)).toEqual({ x: 0, y: 0 });
  });
  it("leans with the phone, within -0.5..0.5", () => {
    const t = tiltFromOrientation(50, 7.5, base);
    expect(t.x).toBeCloseTo(0.25);
    expect(t.y).toBeCloseTo(0.1667, 3);
    const far = tiltFromOrientation(170, -80, base);
    expect(far).toEqual({ x: -0.5, y: 0.5 });
  });
});
