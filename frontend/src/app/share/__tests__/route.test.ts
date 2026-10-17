// @vitest-environment node
import { describe, expect, it } from "vitest";
import { GET } from "@/app/share/route";

describe("/share, where phones send shared text and links", () => {
  it("opens the assistant with the shared content", async () => {
    const res = await GET(new Request("https://app.test/share?title=Hi&url=https%3A%2F%2Fexample.com"));
    expect(res.status).toBe(303);
    const to = new URL(res.headers.get("location")!);
    expect(to.pathname).toBe("/assistant");
    expect(to.searchParams.get("ask")).toMatch(/Hi\nhttps:\/\/example.com$/);
  });

  it("just opens the assistant when nothing came through", async () => {
    const res = await GET(new Request("https://app.test/share"));
    expect(res.headers.get("location")).toBe("https://app.test/assistant");
  });
});
