import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));

import { TaskAutopilot, setAutopilotOff } from "@/components/tasks/TaskAutopilot";

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
let calls: { url: string; body: any }[] = [];
let tasks: Record<string, unknown>[] = [];

beforeEach(() => {
  localStorage.clear();
  calls = [];
  tasks = [
    { id: "old", title: "Old", status: "todo", created_at: "2026-10-01T00:00:00Z" },
    { id: "mine", title: "Follow-up", status: "todo", created_at: "2026-10-17T05:00:00Z", source_type: "Autopilot" },
    { id: "new", title: "Plan trip", status: "todo", created_at: "2026-10-17T06:00:00Z" },
  ];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, body });
    if (url.startsWith("/api/data/tasks")) return new Response(JSON.stringify({ rows: tasks }));
    if (url === "/api/tasks/autopilot") {
      if (body.action === "claim") return new Response(JSON.stringify({ claimed: true, task: { id: body.taskId, title: "Plan trip" } }));
      return new Response(JSON.stringify({ status: "done" }));
    }
    if (url === "/api/chat") return new Response(sse([
      ["checklist", { steps: [{ id: 1, title: "Itinerary", status: "active" }] }],
      ["text", { text: "Saved the itinerary." }],
      ["done", { stop_reason: "end_turn", sideEffects: [{ type: "file", data: { filename: "Goa.html" } }], checklist: [{ id: 1, title: "Itinerary", status: "done", evidence: "file saved" }] }],
    ]));
    return new Response("{}");
  }));
});
afterEach(() => vi.unstubAllGlobals());

describe("task autopilot runner", () => {
  it("works every open task, each in its own run, but never its own follow-ups", async () => {
    render(<TaskAutopilot />);
    await waitFor(() => expect(calls.filter((c) => c.body?.action === "finish")).toHaveLength(2));
    const claims = calls.filter((c) => c.body?.action === "claim").map((c) => c.body.taskId).sort();
    expect(claims).toEqual(["new", "old"]);
    const chats = calls.filter((c) => c.url === "/api/chat");
    expect(chats).toHaveLength(2);
    for (const c of chats) expect(c.body.history).toEqual([]);
    const finish = calls.find((c) => c.body?.action === "finish")!;
    expect(finish.body.run).toMatchObject({ text: "Saved the itinerary.", stopReason: "end_turn", checklist: [{ status: "done", evidence: "file saved" }] });
    expect(finish.body.effects).toEqual([{ type: "file", data: { filename: "Goa.html" } }]);
  });

  it("runs as the agent the user selected, and says who did it", async () => {
    localStorage.setItem("jarvis_active_agent", "athena");
    tasks = [{ id: "new", title: "Plan trip", status: "todo", created_at: "2026-10-17T06:00:00Z" }];
    render(<TaskAutopilot />);
    await waitFor(() => expect(calls.some((c) => c.body?.action === "finish")).toBe(true));
    const chat = calls.find((c) => c.url === "/api/chat")!;
    expect(chat.body).toMatchObject({ agentId: "athena", agentName: "ATHENA" });
    expect(chat.body.agentPersona).toContain("ATHENA");
    expect(calls.find((c) => c.body?.action === "finish")!.body.agentName).toBe("ATHENA");
  });

  it("retries a task left running by a tab that closed, but not one still being worked", async () => {
    const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
    tasks = [
      { id: "busy", title: "Busy", status: "todo", created_at: "2026-10-17T06:00:00Z", autopilot_status: "running", autopilot_at: ago(2) },
      { id: "stuck", title: "Stuck", status: "todo", created_at: "2026-10-17T06:00:00Z", autopilot_status: "running", autopilot_at: ago(30) },
    ];
    render(<TaskAutopilot />);
    await waitFor(() => expect(calls.some((c) => c.body?.action === "claim")).toBe(true));
    expect(calls.filter((c) => c.body?.action === "claim").map((c) => c.body.taskId)).toEqual(["stuck"]);
  });

  it("does nothing on its own when switched off", async () => {
    setAutopilotOff(true);
    render(<TaskAutopilot />);
    await new Promise((r) => setTimeout(r, 50));
    expect(calls.filter((c) => c.url === "/api/tasks/autopilot")).toEqual([]);
  });
});
