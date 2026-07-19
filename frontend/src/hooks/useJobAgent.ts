"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { dataList, dataInsert, dataUpdate, dataDelete } from "@/lib/dataClient";
import type { CandidateFact, CareerProfile, NormalizedJob } from "@/lib/jobAgent/types";

// Single source of truth for the client: career profile, verified fact vault,
// saved jobs, and applications. Persists through the per-user data API when
// Supabase is configured, and falls back to localStorage otherwise — mirroring
// the pattern used by useLocalTasks so Job Agent works offline/unconfigured.

const K = {
  profile: "te_ja_profile_v1",
  facts: "te_ja_facts_v1",
  saved: "te_ja_saved_v1",
  apps: "te_ja_apps_v1",
};

function ls<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
}
function lsSet(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* noop */ } }

export interface SavedJobRow { id: string; job_id: string; job_json: NormalizedJob; state: "saved" | "dismissed"; notes?: string; created_at: string; }
export interface ApplicationRow {
  id: string; job_id: string; job_json?: NormalizedJob; status: string; match_score?: number;
  submitted_resume_id?: string; submitted_cover_letter_id?: string; submission_url?: string;
  notes?: string; follow_up_at?: string; created_at: string; updated_at: string;
}

export function useJobAgent() {
  const { data: session } = useSession();
  const userId = session?.user?.email ?? null;
  const [profile, setProfileState] = useState<CareerProfile>({});
  const [facts, setFacts] = useState<CandidateFact[]>([]);
  const [saved, setSaved] = useState<SavedJobRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [ready, setReady] = useState(false);
  const remote = useRef(false);

  const load = useCallback(() => {
    let cancelled = false;
    setReady(false);
    Promise.all([
      dataList<{ id: string; profile_json?: CareerProfile }>("job_agent_profiles"),
      dataList<CandidateFact & { value_json?: unknown }>("candidate_facts"),
      dataList<SavedJobRow>("saved_jobs"),
      dataList<ApplicationRow>("applications"),
    ]).then(([p, f, s, a]) => {
      if (cancelled) return;
      remote.current = p.remote;
      if (p.remote) {
        setProfileState((p.rows[0] as any)?.profile_json ?? {});
        setFacts(f.rows.map((r: any) => ({ ...r, value: r.value_json ?? r.value })) as CandidateFact[]);
        setSaved(s.rows);
        setApplications(a.rows);
      } else {
        setProfileState(ls<CareerProfile>(K.profile, {}));
        setFacts(ls<CandidateFact[]>(K.facts, []));
        setSaved(ls<SavedJobRow[]>(K.saved, []));
        setApplications(ls<ApplicationRow[]>(K.apps, []));
      }
      setReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => load(), [userId, load]);

  const saveProfile = useCallback(async (next: CareerProfile) => {
    setProfileState(next);
    if (remote.current) {
      const row = { id: `japrofile_${userId}`, profile_json: next, headline: next.headline, summary: next.summary, updated_at: new Date().toISOString() };
      // upsert-ish: try update then insert
      const ok = await dataUpdate("job_agent_profiles", row.id, row);
      if (!ok) await dataInsert("job_agent_profiles", row);
    } else lsSet(K.profile, next);
  }, [userId]);

  const addFacts = useCallback(async (incoming: CandidateFact[]) => {
    setFacts((prev) => {
      const next = [...incoming, ...prev];
      if (!remote.current) lsSet(K.facts, next);
      return next;
    });
    if (remote.current) await dataInsert("candidate_facts", incoming.map((f) => ({ ...f, value_json: f.value })));
  }, []);

  const updateFact = useCallback(async (id: string, patch: Partial<CandidateFact>) => {
    setFacts((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, ...patch, updatedAt: new Date().toISOString() } : f));
      if (!remote.current) lsSet(K.facts, next);
      return next;
    });
    if (remote.current) await dataUpdate("candidate_facts", id, { ...patch, value_json: patch.value, updated_at: new Date().toISOString() });
  }, []);

  const removeFact = useCallback(async (id: string) => {
    setFacts((prev) => { const next = prev.filter((f) => f.id !== id); if (!remote.current) lsSet(K.facts, next); return next; });
    if (remote.current) await dataDelete("candidate_facts", id);
  }, []);

  const setJobState = useCallback(async (job: NormalizedJob, state: "saved" | "dismissed") => {
    const existing = saved.find((s) => s.job_id === job.id);
    if (existing) {
      setSaved((prev) => { const next = prev.map((s) => (s.job_id === job.id ? { ...s, state } : s)); if (!remote.current) lsSet(K.saved, next); return next; });
      if (remote.current) await dataUpdate("saved_jobs", existing.id, { state });
      return;
    }
    const row: SavedJobRow = { id: `sj_${Date.now().toString(36)}`, job_id: job.id, job_json: job, state, created_at: new Date().toISOString() };
    setSaved((prev) => { const next = [row, ...prev]; if (!remote.current) lsSet(K.saved, next); return next; });
    if (remote.current) await dataInsert("saved_jobs", row);
  }, [saved]);

  const upsertApplication = useCallback(async (row: ApplicationRow) => {
    const existing = applications.find((a) => a.job_id === row.job_id);
    if (existing) {
      const merged = { ...existing, ...row, id: existing.id, updated_at: new Date().toISOString() };
      setApplications((prev) => { const next = prev.map((a) => (a.id === existing.id ? merged : a)); if (!remote.current) lsSet(K.apps, next); return next; });
      if (remote.current) await dataUpdate("applications", existing.id, { ...row, updated_at: merged.updated_at });
      return merged;
    }
    setApplications((prev) => { const next = [row, ...prev]; if (!remote.current) lsSet(K.apps, next); return next; });
    if (remote.current) await dataInsert("applications", row);
    return row;
  }, [applications]);

  const updateApplication = useCallback(async (id: string, patch: Partial<ApplicationRow>) => {
    setApplications((prev) => { const next = prev.map((a) => (a.id === id ? { ...a, ...patch, updated_at: new Date().toISOString() } : a)); if (!remote.current) lsSet(K.apps, next); return next; });
    if (remote.current) await dataUpdate("applications", id, { ...patch, updated_at: new Date().toISOString() });
  }, []);

  return {
    ready, remote: remote.current, profile, facts, saved, applications,
    saveProfile, addFacts, updateFact, removeFact, setJobState, upsertApplication, updateApplication, reload: load,
  };
}

export function profileCompleteness(p: CareerProfile, facts: CandidateFact[]): number {
  let score = 0;
  const checks = [p.fullName, p.headline, p.email, p.summary, p.city || p.country, p.targetRoles?.length, p.workAuthorization, facts.length >= 3];
  for (const c of checks) if (c) score += 1;
  return Math.round((score / checks.length) * 100);
}
