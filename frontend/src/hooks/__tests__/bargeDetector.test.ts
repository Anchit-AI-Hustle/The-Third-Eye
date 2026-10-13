import { describe, expect, it } from "vitest";
import { createBargeDetector } from "@/hooks/useVoice";

// ~60 frames a second, as the requestAnimationFrame loop runs.
function run(det: ReturnType<typeof createBargeDetector>, clock: { t: number }, peak: number, ms: number): boolean {
  let barged = false;
  for (let end = clock.t + ms; clock.t < end; clock.t += 16) barged = det.check(peak) || barged;
  return barged;
}

describe("talking over the assistant", () => {
  it("never stops the assistant for its own voice coming back through the speakers", () => {
    const clock = { t: 0 };
    const det = createBargeDetector(() => clock.t);
    expect(run(det, clock, 0.3, 600)).toBe(false);
    for (let i = 0; i < 20; i++) expect(run(det, clock, i % 2 ? 0.34 : 0.22, 200)).toBe(false);
  });

  it("stops it when the user speaks clearly over the echo", () => {
    const clock = { t: 0 };
    const det = createBargeDetector(() => clock.t);
    run(det, clock, 0.3, 1000);
    expect(run(det, clock, 0.7, 400)).toBe(true);
  });

  it("ignores a short knock or click", () => {
    const clock = { t: 0 };
    const det = createBargeDetector(() => clock.t);
    run(det, clock, 0.05, 1000);
    expect(run(det, clock, 0.9, 80)).toBe(false);
  });

  it("does not let the user cut in during the first moment while it learns the echo", () => {
    const clock = { t: 0 };
    const det = createBargeDetector(() => clock.t);
    expect(run(det, clock, 0.8, 400)).toBe(false);
  });

  it("still hears a normal voice when the speakers are quiet (headphones)", () => {
    const clock = { t: 0 };
    const det = createBargeDetector(() => clock.t);
    run(det, clock, 0.01, 1000);
    expect(run(det, clock, 0.2, 400)).toBe(true);
  });

  it("starts learning afresh for the next reply", () => {
    const clock = { t: 0 };
    const det = createBargeDetector(() => clock.t);
    run(det, clock, 0.3, 1000);
    det.reset();
    expect(run(det, clock, 0.7, 300)).toBe(false);
  });
});

describe("transcripts of the assistant's own words", () => {
  it("are recognised as echo even when the recognizer mangles a few words", async () => {
    const { isEchoOf } = await import("@/hooks/useVoice");
    const said = "Good evening. You have three open tasks, and the Q3 report is due on Friday.";
    expect(isEchoOf("you have three open tasks and the q3 report is due friday", said)).toBe(true);
    expect(isEchoOf("the Q three report is due on Friday", said)).toBe(true);
  });

  it("let the user's own reply through, even one that reuses a word or two", async () => {
    const { isEchoOf } = await import("@/hooks/useVoice");
    const said = "You have three open tasks, and the Q3 report is due on Friday.";
    expect(isEchoOf("move the report to Monday", said)).toBe(false);
    expect(isEchoOf("stop", said)).toBe(false);
    expect(isEchoOf("yes", "Should I send it? Say yes or no.")).toBe(false);
  });
});
