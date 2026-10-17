import { describe, expect, it } from "vitest";
import { dealCreateSchema, safeHref } from "@/lib/kolab-studio/validation";

describe("links on public Kolab pages", () => {
  it("refuses a javascript: link as a deal's shop link", () => {
    expect(dealCreateSchema.safeParse({ brand: "X", affiliate_url: "javascript:alert(document.cookie)" }).success).toBe(false);
    expect(dealCreateSchema.safeParse({ brand: "X", affiliate_url: "https://shop.example.com/p" }).success).toBe(true);
  });

  it("renders only web links, so one stored before this check cannot run", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref(" https://x.com ")).toBe("https://x.com");
    expect(safeHref("")).toBeUndefined();
  });
});
