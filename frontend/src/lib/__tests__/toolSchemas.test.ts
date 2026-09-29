import { describe, expect, it } from "vitest";

import { geminiTools } from "@/lib/tools/schemas";
import { toGstSlab } from "@/lib/calculators/formulas";

// THE FAILURE THIS PINS. manage_expenses declared gst_rate as
// `{ type: "NUMBER", enum: [0, 5, 12, 18, 28, 40] }`. Gemini accepts `enum` only
// on STRING properties, and it does not ignore a numeric one — it rejects the
// ENTIRE tool list with a 400. So every chat request lost every tool, the route
// fell through to its no-tools degraded mode, and the assistant told the user its
// "tool-calling connection is temporarily down" on every single message. One
// property on one tool, and nothing in the code looked wrong.
//
// So this walks every declaration, at every depth, and fails on any `enum` that
// is not on a STRING — whichever tool it is added to next.

type Schema = { type?: string; enum?: unknown[]; properties?: Record<string, Schema>; items?: Schema };
type Decl = { name: string; parameters?: Schema };

function offenders(schema: Schema | undefined, path: string, out: string[]) {
  if (!schema) return;
  if (schema.enum !== undefined) {
    if (schema.type !== "STRING") out.push(`${path} — enum on a ${schema.type ?? "untyped"} property`);
    else if (!schema.enum.every((v) => typeof v === "string")) out.push(`${path} — non-string value in a STRING enum`);
  }
  for (const [k, v] of Object.entries(schema.properties ?? {})) offenders(v, `${path}.${k}`, out);
  if (schema.items) offenders(schema.items, `${path}[]`, out);
}

describe("tool declarations Gemini will accept", () => {
  const decls: Decl[] = geminiTools.flatMap(
    (t: { functionDeclarations: unknown[] }) => t.functionDeclarations as Decl[],
  );

  it("declares at least the tools the assistant depends on", () => {
    // Guards the walk below against passing because it walked nothing.
    expect(decls.length).toBeGreaterThan(10);
    expect(decls.map((d: Decl) => d.name)).toContain("manage_expenses");
  });

  it("puts enum only on STRING properties, with only string values", () => {
    const out: string[] = [];
    for (const d of decls) offenders(d.parameters, d.name, out);
    expect(out).toEqual([]);
  });
});

describe("toGstSlab", () => {
  it("keeps a real slab", () => {
    for (const r of [0, 5, 12, 18, 28, 40]) expect(toGstSlab(r)).toBe(r);
  });

  it("accepts a slab the model sent as a string", () => {
    expect(toGstSlab("18")).toBe(18);
  });

  it("drops anything that is not a slab rather than storing a wrong rate", () => {
    expect(toGstSlab(15)).toBe(0);
    expect(toGstSlab("18%")).toBe(0);
    expect(toGstSlab(18.0001)).toBe(0);
    expect(toGstSlab(undefined)).toBe(0);
  });
});
