import { afterEach, describe, expect, it, vi } from "vitest";
import { checkEnv, ENV_SCHEMA, validateEnv } from "@/lib/env";

const GOOD = {
  NEXTAUTH_SECRET: "s3cret-value-1234567890",
  DATABASE_URL: "postgres://u:pw-secret@db.example.com:5432/app?sslmode=verify-full",
  TOKEN_ENCRYPTION_KEY: "enc-secret-value",
  GROQ_API_KEY: "gsk_secret_value",
};

afterEach(() => vi.restoreAllMocks());

describe("env schema", () => {
  it("lists every var once, each as required or optional with what it powers", () => {
    const names = ENV_SCHEMA.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
    for (const v of ENV_SCHEMA) expect(v.purpose.length).toBeGreaterThan(5);
    expect(ENV_SCHEMA.filter((v) => v.required).map((v) => v.name)).toEqual(["NEXTAUTH_SECRET", "DATABASE_URL", "TOKEN_ENCRYPTION_KEY"]);
  });

  it("passes a complete environment", () => {
    expect(validateEnv(GOOD)).toMatchObject({ missingRequired: [], invalid: [], noLlm: false });
  });

  it("reports missing required vars, malformed values and no AI provider", () => {
    const r = validateEnv({ NEXTAUTH_SECRET: "x", DATABASE_URL: "mysql://nope", NEXTAUTH_URL: "not a url" });
    expect(r.missingRequired).toEqual(["TOKEN_ENCRYPTION_KEY"]);
    expect(r.invalid.map((i) => i.name)).toEqual(["DATABASE_URL", "NEXTAUTH_URL"]);
    expect(r.noLlm).toBe(true);
  });

  it("treats blank and whitespace-only values as missing", () => {
    expect(validateEnv({ ...GOOD, TOKEN_ENCRYPTION_KEY: "  \u200b " }).missingRequired).toEqual(["TOKEN_ENCRYPTION_KEY"]);
  });
});

describe("checkEnv at boot", () => {
  it("throws in production when a required var is missing, naming it but never a value", () => {
    const env = { ...GOOD, DATABASE_URL: "" };
    expect(() => checkEnv(env, { production: true })).toThrow(/DATABASE_URL/);
    try { checkEnv(env, { production: true }); } catch (e) {
      expect(String(e)).not.toMatch(/s3cret|gsk_secret|enc-secret/);
    }
  });

  it("throws in production when a required value is malformed", () => {
    expect(() => checkEnv({ ...GOOD, DATABASE_URL: "nope" }, { production: true })).toThrow(/DATABASE_URL/);
  });

  it("only logs an error outside production", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => checkEnv({}, { production: false })).not.toThrow();
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/NEXTAUTH_SECRET.*DATABASE_URL.*TOKEN_ENCRYPTION_KEY/));
  });

  it("degrades with one warning listing missing optional vars and what stops working", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    checkEnv(GOOD, { production: true });
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0][0]);
    expect(line).toMatch(/CRON_SECRET \(/);
    expect(line).not.toMatch(/GROQ_API_KEY/);
    expect(line).not.toMatch(/s3cret|gsk_secret|enc-secret|pw-secret/);
  });

  it("warns loudly when no AI provider key is set, without failing boot", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { GROQ_API_KEY: _, ...noKey } = GOOD;
    expect(() => checkEnv(noKey, { production: true })).not.toThrow();
    expect(warn.mock.calls.flat().join(" ")).toMatch(/No AI provider key/);
  });
});

describe("instrumentation register", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails a production server boot without a required var", async () => {
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { register } = await import("@/instrumentation");
    expect(() => register()).toThrow(/DATABASE_URL/);
  });

  it("skips the edge runtime and the build phase", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DATABASE_URL", "");
    const { register } = await import("@/instrumentation");
    vi.stubEnv("NEXT_RUNTIME", "edge");
    expect(() => register()).not.toThrow();
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(() => register()).not.toThrow();
  });
});
