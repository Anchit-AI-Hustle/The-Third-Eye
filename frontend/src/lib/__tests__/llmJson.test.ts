import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseLlmJson, validItems } from "@/lib/llmJson";

describe("parseLlmJson", () => {
  it("parses clean JSON without marking it repaired", () => {
    expect(parseLlmJson('{"a":1}')).toEqual({ value: { a: 1 }, repaired: false });
  });

  it("reads JSON out of a code fence or surrounding prose", () => {
    expect(parseLlmJson('Here you go:\n```json\n{"a":[1,2]}\n```').value).toEqual({ a: [1, 2] });
    expect(parseLlmJson('Sure! {"a":"x"} Hope that helps {smile}').value).toEqual({ a: "x" });
  });

  it("drops trailing commas", () => {
    expect(parseLlmJson('{"a":[1,2,],"b":{"c":3,},}')).toEqual({ value: { a: [1, 2], b: { c: 3 } }, repaired: true });
  });

  it("salvages complete items from output cut off mid-array (Expected ',' or ']')", () => {
    const cut = '{"summary":"Worked on ads","task_updates":[{"task_id":"t1","update":"done"},{"task_id":"t2","upd';
    expect(parseLlmJson(cut)).toEqual({ value: { summary: "Worked on ads", task_updates: [{ task_id: "t1", update: "done" }] }, repaired: true });
  });

  it("salvages output cut off inside a string", () => {
    expect(parseLlmJson('{"a":1,"b":"half a sent').value).toEqual({ a: 1 });
  });

  it("keeps braces and brackets inside strings intact", () => {
    expect(parseLlmJson('{"a":"x } ] {","b":[1').value).toEqual({ a: "x } ] {", b: [] });
  });

  it("throws a clear reason when there is no JSON at all", () => {
    expect(() => parseLlmJson("I cannot help with that.")).toThrow(/no JSON object/);
  });
});

describe("validItems", () => {
  const Task = z.object({ title: z.string().min(1) });
  it("keeps items that match the schema and counts the rest", () => {
    expect(validItems([{ title: "a" }, { title: "" }, "x", { nope: 1 }], Task)).toEqual({ items: [{ title: "a" }], dropped: 3 });
  });
  it("treats a non-array as empty", () => {
    expect(validItems("oops", Task)).toEqual({ items: [], dropped: 0 });
  });
});
