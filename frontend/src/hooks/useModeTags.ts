"use client";

import { useState, useEffect, useCallback } from "react";
import type { ModeId } from "./useMode";

// Mode-scoping as a client-side tag overlay (ported from Mirror, where every
// knowledge item carried a `mode`). Rather than add a `mode` column to every
// Supabase table — which would need a migration and could break inserts until
// applied — we keep a lightweight itemId → mode map in localStorage. It works
// identically for local and cloud-backed data, and legacy/untagged items are
// treated as belonging to ALL modes, so nothing ever disappears from a view.

const LS_KEY = "te_mode_tags_v1";
export const MODE_TAGS_EVENT = "te:mode-tags-change";

type TagMap = Record<string, ModeId>;

function load(): TagMap {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "{}"); } catch { return {}; }
}

function persist(map: TagMap) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LS_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent(MODE_TAGS_EVENT));
}

/**
 * Filter a list to the active mode. Untagged items are always included, so
 * data created before mode-scoping (or created via the assistant/voice) stays
 * visible. Pass `showAll` to bypass filtering entirely.
 */
export function filterByMode<T extends { id: string }>(
  items: T[],
  tags: TagMap,
  modeId: ModeId,
  showAll: boolean,
): T[] {
  if (showAll) return items;
  return items.filter((it) => {
    const t = tags[it.id];
    return t === undefined || t === modeId;
  });
}

export function useModeTags() {
  const [tags, setTags] = useState<TagMap>(() => load());

  useEffect(() => {
    const sync = () => setTags(load());
    const onStorage = (e: StorageEvent) => { if (e.key === LS_KEY) sync(); };
    window.addEventListener(MODE_TAGS_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(MODE_TAGS_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const tagItem = useCallback((id: string, mode: ModeId) => {
    setTags((prev) => {
      const next = { ...prev, [id]: mode };
      persist(next);
      return next;
    });
  }, []);

  const clearTag = useCallback((id: string) => {
    setTags((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      persist(next);
      return next;
    });
  }, []);

  const tagOf = useCallback((id: string): ModeId | undefined => tags[id], [tags]);

  return { tags, tagItem, clearTag, tagOf };
}
