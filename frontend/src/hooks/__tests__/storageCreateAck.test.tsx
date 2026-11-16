import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { email: "synthetic@example.test" } } }) }));
vi.mock("@/lib/dataClient", () => ({ dataList: async () => ({ remote: true, rows: [] }), dataInsert: async () => false, dataUpdate: async () => false, dataDelete: async () => false }));
import { useLocalTasks } from "@/hooks/useLocalTasks";
import { useLocalNotes } from "@/hooks/useLocalNotes";
import { useLocalGoals } from "@/hooks/useLocalGoals";
import { useLocalExpenses } from "@/hooks/useLocalExpenses";
describe("unconfirmed create writes", () => {
 it("does not return an optimistic id as proof of saving", async () => {
  const t=renderHook(()=>useLocalTasks()), n=renderHook(()=>useLocalNotes()), g=renderHook(()=>useLocalGoals()), e=renderHook(()=>useLocalExpenses());
  await waitFor(()=>expect(t.result.current.ready && n.result.current.ready && g.result.current.ready && e.result.current.ready).toBe(true));
  await act(async()=>{
   expect(await t.result.current.create({title:"Synthetic",status:"todo",priority:"medium"})).toBeNull();
   expect(await n.result.current.create("Synthetic")).toBeNull();
   expect(await g.result.current.add({title:"Synthetic",category:"Personal",target:1,current:0,unit:"x"})).toBeNull();
   expect(await e.result.current.add({amount:1,category:"Other"})).toBeNull();
  });
 });
});
