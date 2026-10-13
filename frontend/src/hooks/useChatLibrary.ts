"use client";

import { useCallback, useEffect, useState } from "react";
import { dataDelete, dataInsert, dataList } from "@/lib/dataClient";
import type { Attachment } from "@/lib/attachments";

// Saved Assistant chats and projects. Server-backed through /api/data when the
// database is configured; otherwise kept in this browser's localStorage.

export interface ChatSummary { id: string; title: string; project_id: string | null; updated_at: string }
export interface SavedChat<M = unknown, H = unknown> extends ChatSummary { messages: M[]; history: H[] }
export type ProjectFile = Attachment & { size: number };
export interface Project { id: string; name: string; instructions: string; files: ProjectFile[]; updated_at: string }

const LOCAL_CHATS = "te_chats_v1";
const LOCAL_PROJECTS = "te_projects_v1";
const MAX_LOCAL_CHATS = 50;

function readLocal<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]") as T[]; } catch { return []; }
}
function writeLocal(key: string, rows: unknown[]) {
  try { localStorage.setItem(key, JSON.stringify(rows)); } catch { /* quota — keep what's in memory */ }
}
/** A chat saved while a reply was streaming reopens finished: no spinner, no empty bubble. */
export function settleMessages<M extends { content: string; streaming?: boolean }>(messages: M[]): M[] {
  return messages
    .filter((m) => !(m.streaming && !m.content.trim()))
    .map((m) => {
      if (!m.streaming) return m;
      const { streaming: _done, ...rest } = m;
      return rest as M;
    });
}

const byRecent = <T extends { updated_at: string }>(a: T, b: T) => b.updated_at.localeCompare(a.updated_at);
const summary = ({ id, title, project_id, updated_at }: SavedChat): ChatSummary => ({ id, title, project_id, updated_at });

export function useChatLibrary() {
  const [remote, setRemote] = useState<boolean | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let alive = true;
    Promise.all([dataList<ChatSummary>("conversations"), dataList<Project>("projects")]).then(([c, p]) => {
      if (!alive) return;
      setRemote(c.remote);
      if (c.remote) { setChats(c.rows); setProjects(p.rows); }
      else {
        setChats(readLocal<SavedChat>(LOCAL_CHATS).map(summary).sort(byRecent));
        setProjects(readLocal<Project>(LOCAL_PROJECTS).sort(byRecent));
      }
    });
    return () => { alive = false; };
  }, []);

  const openChat = useCallback(async <M, H>(id: string): Promise<SavedChat<M, H> | null> => {
    if (remote) {
      const res = await fetch(`/api/data/conversations?id=${encodeURIComponent(id)}`).catch(() => null);
      const json = res?.ok ? await res.json().catch(() => null) : null;
      return (json?.rows?.[0] as SavedChat<M, H>) ?? null;
    }
    return (readLocal<SavedChat<M, H>>(LOCAL_CHATS).find((c) => c.id === id)) ?? null;
  }, [remote]);

  const saveChat = useCallback(async (chat: SavedChat) => {
    setChats((cur) => [summary(chat), ...cur.filter((c) => c.id !== chat.id)]);
    if (remote) { await dataInsert("conversations", chat); return; }
    writeLocal(LOCAL_CHATS, [chat, ...readLocal<SavedChat>(LOCAL_CHATS).filter((c) => c.id !== chat.id)].slice(0, MAX_LOCAL_CHATS));
  }, [remote]);

  const renameChat = useCallback(async (id: string, title: string) => {
    setChats((cur) => cur.map((c) => (c.id === id ? { ...c, title } : c)));
    if (remote) {
      await fetch("/api/data/conversations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, patch: { title } }) }).catch(() => null);
      return;
    }
    writeLocal(LOCAL_CHATS, readLocal<SavedChat>(LOCAL_CHATS).map((c) => (c.id === id ? { ...c, title } : c)));
  }, [remote]);

  const deleteChat = useCallback(async (id: string) => {
    setChats((cur) => cur.filter((c) => c.id !== id));
    if (remote) { await dataDelete("conversations", id); return; }
    writeLocal(LOCAL_CHATS, readLocal<SavedChat>(LOCAL_CHATS).filter((c) => c.id !== id));
  }, [remote]);

  const saveProject = useCallback(async (project: Project) => {
    setProjects((cur) => [project, ...cur.filter((p) => p.id !== project.id)]);
    if (remote) { await dataInsert("projects", project); return; }
    writeLocal(LOCAL_PROJECTS, [project, ...readLocal<Project>(LOCAL_PROJECTS).filter((p) => p.id !== project.id)]);
  }, [remote]);

  const deleteProject = useCallback(async (id: string) => {
    setProjects((cur) => cur.filter((p) => p.id !== id));
    setChats((cur) => cur.map((c) => (c.project_id === id ? { ...c, project_id: null } : c)));
    if (remote) {
      await dataDelete("projects", id);
      return;
    }
    writeLocal(LOCAL_PROJECTS, readLocal<Project>(LOCAL_PROJECTS).filter((p) => p.id !== id));
    writeLocal(LOCAL_CHATS, readLocal<SavedChat>(LOCAL_CHATS).map((c) => (c.project_id === id ? { ...c, project_id: null } : c)));
  }, [remote]);

  return { ready: remote !== null, chats, projects, openChat, saveChat, renameChat, deleteChat, saveProject, deleteProject };
}
