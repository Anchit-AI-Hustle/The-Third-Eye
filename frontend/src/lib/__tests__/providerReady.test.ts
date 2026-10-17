import { describe, expect, it } from "vitest";
import { systemStatus } from "@/lib/providerReady";

describe("is the assistant switched on", () => {
  it("yes with only a free Groq key", () => expect(systemStatus({ GROQ_API_KEY: "gsk_x" }).ai).toBe(true));
  it("no with no provider key at all", () => expect(systemStatus({ DATABASE_URL: "postgres://x" }).ai).toBe(false));
});
