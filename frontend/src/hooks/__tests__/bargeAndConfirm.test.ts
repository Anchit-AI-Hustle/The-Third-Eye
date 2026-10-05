import { describe, expect, it } from "vitest";
import { bargeDecision, recorderMime } from "../useVoice";
import { classifyVoiceConfirm } from "../useAgentConfirm";

describe("bargeDecision", () => {
  it("does not treat the start of the agent's own voice as an interruption", () => {
    expect(bargeDecision({ suppressed: true, peak: 0.3, floor: 0.05, quietForMs: 80, loudForMs: 80 })).toBe("learn");
    expect(bargeDecision({ suppressed: true, peak: 0.2, floor: 0.18, quietForMs: 900, loudForMs: 600 })).toBe("wait");
  });

  it("barges only when a louder sound holds after the agent has been speaking", () => {
    expect(bargeDecision({ suppressed: true, peak: 0.7, floor: 0.15, quietForMs: 900, loudForMs: 520 })).toBe("barge");
    expect(bargeDecision({ suppressed: true, peak: 0.7, floor: 0.15, quietForMs: 900, loudForMs: 100 })).toBe("wait");
  });

  it("still hears the user once the agent is quiet", () => {
    expect(bargeDecision({ suppressed: false, peak: 0.03, floor: 0, quietForMs: 0, loudForMs: 0 })).toBe("speak");
    expect(bargeDecision({ suppressed: false, peak: 0, floor: 0, quietForMs: 0, loudForMs: 0 })).toBe("idle");
  });
});

describe("recorderMime", () => {
  it("asks an iPhone for an mp4 or aac file the speech API can read", () => {
    expect(recorderMime(true)).toMatch(/mp4|aac|webm/);
  });
});

describe("classifyVoiceConfirm", () => {
  it("accepts a short yes and refuses a new request that merely starts with yes", () => {
    expect(classifyVoiceConfirm("yes please")).toBe("confirm");
    expect(classifyVoiceConfirm("go ahead")).toBe("confirm");
    expect(classifyVoiceConfirm("don't")).toBe("cancel");
    expect(classifyVoiceConfirm("yes and also remind me to call the bank tomorrow morning")).toBe(null);
  });
});
