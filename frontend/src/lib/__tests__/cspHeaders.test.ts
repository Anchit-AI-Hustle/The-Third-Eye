import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const nextConfig = require("../../../next.config.js") as {
  headers: () => Promise<Array<{ headers: Array<{ key: string; value: string }> }>>;
};

describe("CSP", () => {
  it("lets forms post only to this origin, now that sign-in has no Google step", async () => {
    const headers = await nextConfig.headers();
    const csp = headers[0]?.headers.find((h) => h.key === "Content-Security-Policy-Report-Only")?.value ?? "";
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("accounts.google.com");
  });
});
