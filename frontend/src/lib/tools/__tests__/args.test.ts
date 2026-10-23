import { describe, expect, it } from "vitest";
import { checkArgs, parseToolArgs } from "@/lib/tools/args";

const decl = {
  name: "manage_tasks",
  parameters: {
    type: "OBJECT",
    properties: {
      action: { type: "STRING", enum: ["create", "update"] },
      title: { type: "STRING" },
      count: { type: "NUMBER" },
    },
    required: ["action"],
  },
};

describe("tool argument checks", () => {
  it("rejects arguments that are not a JSON object", () => {
    expect(parseToolArgs('{"action":"create"').error).toMatch(/not valid JSON/);
    expect(parseToolArgs("[1,2]").error).toMatch(/object/);
    expect(parseToolArgs("").args).toEqual({});
    expect(parseToolArgs('{"action":"create"}')).toEqual({ args: { action: "create" } });
  });

  it("names a missing required argument", () => {
    expect(checkArgs(decl, { title: "x" })).toMatch(/missing required argument "action"/);
    expect(checkArgs(decl, { action: "" })).toMatch(/missing required argument "action"/);
  });

  it("rejects a value outside the allowed list", () => {
    expect(checkArgs(decl, { action: "purge" })).toMatch(/"action" must be one of create, update/);
  });

  it("rejects a non-numeric number", () => {
    expect(checkArgs(decl, { action: "create", count: "lots" })).toMatch(/"count" must be a number/);
    expect(checkArgs(decl, { action: "create", count: "3" })).toBeNull();
  });

  it("accepts what an MCP JSON schema allows", () => {
    const mcp = { name: "x", parameters: { type: "object", properties: { level: { type: "integer", enum: [1, 2] }, query: { type: "string" } }, required: ["query"] } };
    expect(checkArgs(mcp, { level: 1, query: "" })).toBeNull();
    expect(checkArgs(mcp, { level: 3, query: "a" })).toMatch(/"level" must be one of 1, 2/);
  });

  it("passes valid arguments and tools it has no schema for", () => {
    expect(checkArgs(decl, { action: "update", title: "x" })).toBeNull();
    expect(checkArgs(undefined, { anything: 1 })).toBeNull();
  });
});
