import { afterEach, describe, expect, it, vi } from "vitest";
import { matchesTestCode } from "@/lib/testUnlock";

afterEach(() => vi.unstubAllEnvs());

describe("test unlock code (server only)", () => {
  it("is off when no code is configured", () => {
    vi.stubEnv("TEST_UNLOCK_CODE", "");
    vi.stubEnv("NEXT_PUBLIC_TEST_UNLOCK_CODE", "");
    expect(matchesTestCode("")).toBe(false);
    expect(matchesTestCode("anything")).toBe(false);
  });

  it("matches the server-only code, ignoring surrounding whitespace", () => {
    vi.stubEnv("TEST_UNLOCK_CODE", "s3cret");
    expect(matchesTestCode("  s3cret ")).toBe(true);
    expect(matchesTestCode("wrong")).toBe(false);
    expect(matchesTestCode("   ")).toBe(false);
  });

  it("still reads the old variable name until it is renamed", () => {
    vi.stubEnv("TEST_UNLOCK_CODE", "");
    vi.stubEnv("NEXT_PUBLIC_TEST_UNLOCK_CODE", "old");
    expect(matchesTestCode("old")).toBe(true);
  });

  it("is never referenced by browser code", async () => {
    const { readdirSync, readFileSync, statSync } = await import("fs");
    const { join } = await import("path");
    const hits: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) { if (f !== "__tests__" && f !== "api") walk(p); continue; }
        if (!/\.(tsx?|jsx?)$/.test(f) || p.endsWith("testUnlock.ts")) continue;
        if (/TEST_UNLOCK_CODE/.test(readFileSync(p, "utf8"))) hits.push(p);
      }
    };
    walk(join(__dirname, "..", ".."));
    expect(hits).toEqual([]);
  });
});
