import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: "me@x.com" } } }) }));
const updates: unknown[] = [];
vi.mock("@/lib/dataClient", () => ({
  dataList: async () => ({ remote: true, rows: [{ id: "g1", title: "Run", category: "Health", target: 100, current: 10, unit: "km", created_at: "" }] }),
  dataInsert: async () => true,
  dataDelete: async () => true,
  dataUpdate: async (_e: string, id: string, patch: unknown) => { updates.push({ id, patch }); return true; },
}));

import { useLocalGoals } from "@/hooks/useLocalGoals";

describe("goal progress", () => {
  it("saves every quick +/- step to the database", async () => {
    const { result } = renderHook(() => useLocalGoals());
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await Promise.all([result.current.adjust("g1", 5), result.current.adjust("g1", 5), result.current.adjust("g1", 5)]);
    });
    expect(updates).toEqual([{ id: "g1", patch: { current: 15 } }, { id: "g1", patch: { current: 20 } }, { id: "g1", patch: { current: 25 } }]);
    expect(result.current.goals[0].current).toBe(25);
  });
});
