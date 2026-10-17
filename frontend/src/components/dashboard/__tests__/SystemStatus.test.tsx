import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SystemStatusText } from "@/components/dashboard/DashboardClient";

const health = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body))));
afterEach(() => vi.unstubAllGlobals());

describe("dashboard status line", () => {
  it("says the assistant is offline when no AI provider answers", async () => {
    health({ llm_available: false, llm: { status: "down", providers: {} }, services: {} });
    render(<SystemStatusText />);
    expect(await screen.findByText("ASSISTANT OFFLINE")).toBeInTheDocument();
  });

  it("says when it is running on backup providers", async () => {
    health({ llm_available: true, llm: { status: "degraded", providers: { groq: "quota", gemini: "ok" } }, services: {} });
    render(<SystemStatusText />);
    expect(await screen.findByText("RUNNING ON BACKUP AI")).toBeInTheDocument();
  });

  it("only claims everything is operational when the server says so", async () => {
    health({ llm_available: true, llm: { status: "ok", providers: { groq: "ok" } }, services: {} });
    render(<SystemStatusText />);
    expect(await screen.findByText("ALL SYSTEMS OPERATIONAL")).toBeInTheDocument();
  });
});
