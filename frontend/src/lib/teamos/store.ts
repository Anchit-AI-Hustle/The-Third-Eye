"use client";

import { useCallback, useEffect, useState } from "react";
import { vaultGet, vaultSet } from "@/lib/deviceVault";
import { VERTICAL_COLORS, type Goal, type Objective, type Project, type TeamState, type Vertical } from "./types";

// Device-vault store for Team OS. Synchronous localStorage under one key; a hook
// exposes CRUD and keeps a React snapshot in sync (incl. cross-tab).

const APP = "teamos";
const KEY = "state";

function seed(): TeamState {
  return { verticals: [], projects: [], objectives: [], goals: [] };
}

function read(): TeamState {
  const s = vaultGet<TeamState>(APP, KEY, seed());
  return { verticals: s.verticals ?? [], projects: s.projects ?? [], objectives: s.objectives ?? [], goals: s.goals ?? [] };
}
function write(s: TeamState) { vaultSet(APP, KEY, s); }

// Non-crypto id (Math.random is unavailable in some sandboxes but fine in the
// browser); counter suffix avoids collisions within a burst.
let _seq = 0;
function id(prefix: string): string {
  _seq += 1;
  const rand = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36);
  return `${prefix}_${rand}${_seq}`;
}

export function useTeamOS() {
  const [state, setState] = useState<TeamState>(seed());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => { setState(read()); }, []);

  useEffect(() => {
    refresh();
    setReady(true);
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refresh]);

  const commit = useCallback((next: TeamState) => { write(next); setState(next); }, []);

  // ── Verticals ──
  const addVertical = useCallback((name: string) => {
    setState((s) => {
      const v: Vertical = { id: id("vert"), name: name.trim(), color: VERTICAL_COLORS[s.verticals.length % VERTICAL_COLORS.length] };
      const next = { ...s, verticals: [...s.verticals, v] };
      write(next); return next;
    });
  }, []);
  const removeVertical = useCallback((vid: string) => {
    setState((s) => {
      const next = { ...s, verticals: s.verticals.filter((v) => v.id !== vid), projects: s.projects.filter((p) => p.verticalId !== vid) };
      write(next); return next;
    });
  }, []);

  // ── Projects ──
  const upsertProject = useCallback((p: Omit<Project, "id" | "updatedAt"> & { id?: string }) => {
    setState((s) => {
      const now = new Date().toISOString();
      let next: TeamState;
      if (p.id) {
        next = { ...s, projects: s.projects.map((x) => (x.id === p.id ? { ...x, ...p, id: p.id, updatedAt: now } as Project : x)) };
      } else {
        const proj: Project = { ...p, id: id("proj"), updatedAt: now } as Project;
        next = { ...s, projects: [...s.projects, proj] };
      }
      write(next); return next;
    });
  }, []);
  const removeProject = useCallback((pid: string) => {
    setState((s) => { const next = { ...s, projects: s.projects.filter((p) => p.id !== pid) }; write(next); return next; });
  }, []);

  // ── Objectives (OKRs) ──
  const upsertObjective = useCallback((o: Omit<Objective, "id"> & { id?: string }) => {
    setState((s) => {
      let next: TeamState;
      if (o.id) next = { ...s, objectives: s.objectives.map((x) => (x.id === o.id ? { ...(o as Objective), id: o.id } : x)) };
      else next = { ...s, objectives: [...s.objectives, { ...(o as Objective), id: id("obj") }] };
      write(next); return next;
    });
  }, []);
  const removeObjective = useCallback((oid: string) => {
    setState((s) => { const next = { ...s, objectives: s.objectives.filter((o) => o.id !== oid) }; write(next); return next; });
  }, []);

  // ── Goals (roadmap ladder) ──
  const upsertGoal = useCallback((g: Omit<Goal, "id"> & { id?: string }) => {
    setState((s) => {
      let next: TeamState;
      if (g.id) next = { ...s, goals: s.goals.map((x) => (x.id === g.id ? { ...(g as Goal), id: g.id } : x)) };
      else next = { ...s, goals: [...s.goals, { ...(g as Goal), id: id("goal") }] };
      write(next); return next;
    });
  }, []);
  const removeGoal = useCallback((gid: string) => {
    setState((s) => { const next = { ...s, goals: s.goals.filter((g) => g.id !== gid) }; write(next); return next; });
  }, []);

  const importState = useCallback((incoming: Partial<TeamState>) => {
    commit({ ...seed(), ...incoming });
  }, [commit]);

  return {
    ready, state,
    addVertical, removeVertical,
    upsertProject, removeProject,
    upsertObjective, removeObjective,
    upsertGoal, removeGoal,
    importState, refresh,
    newId: id,
  };
}
