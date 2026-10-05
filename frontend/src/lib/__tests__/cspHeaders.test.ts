import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const nextConfig = require("../../../next.config.js") as {
  headers: () => Promise<Array<{ headers: Array<{ key: string; value: string }> }>>;
};

describe("CSP", () => {
  it("lets the Google sign-in form follow the OAuth redirect", async () => {
    const headers = await nextConfig.headers();
    const csp = headers[0]?.headers.find((h) => h.key === "Content-Security-Policy-Report-Only")?.value ?? "";
    expect(csp).toContain("form-action 'self' https://accounts.google.com");
    expect(csp.includes("form-action 'self';")).toBe(false);
  });
});
