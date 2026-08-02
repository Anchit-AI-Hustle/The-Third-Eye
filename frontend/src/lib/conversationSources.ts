// The per-conversation allow-list that gates tracker ingestion.
//
// Two distinct operations, and keeping them separate is the whole point:
//
//   discover() — called on every poll. Records conversations the connected account
//     can see, so the picker has something to list. Must NEVER change `included`:
//     a re-poll that reset it would silently un-watch the user's chats. So this is
//     insert-if-absent (ignoreDuplicates), not a true upsert.
//
//   included() — called by the ingest loop. Returns only what the user opted into.
//     An empty result means ingest nothing, which is the correct behaviour for a
//     freshly-connected account: discover first, let the user choose, then ingest.
//
// The cached label/link travel onto tasks.source_detail / tasks.source_link so a
// tracker row can name the chat it came from.

import type { Sb } from "@/lib/cron";
import type { ConnectorId } from "@/lib/connectors";

export interface DiscoveredConversation {
  conversationId: string;
  label: string | null;
  link: string | null;
  isGroup?: boolean;
}

export interface WatchedConversation {
  conversationId: string;
  label: string | null;
  link: string | null;
}

/**
 * Record conversations the account can see. Existing rows are left untouched so a
 * poll can never flip a user's selection. Returns how many were newly discovered.
 */
export async function discoverConversations(
  sb: Sb,
  userId: string,
  connector: ConnectorId,
  convs: DiscoveredConversation[],
): Promise<{ discovered: number }> {
  if (!convs.length) return { discovered: 0 };

  const rows = convs.map((c) => ({
    user_id: userId,
    connector,
    conversation_id: c.conversationId,
    label: c.label,
    link: c.link,
    is_group: c.isGroup ?? false,
  }));

  // ignoreDuplicates: insert-if-absent. A plain upsert would reset `included`.
  const { data, error } = await sb
    .from("conversation_sources")
    .upsert(rows, { onConflict: "user_id,connector,conversation_id", ignoreDuplicates: true })
    .select("conversation_id");

  if (error) return { discovered: 0 };
  return { discovered: data?.length ?? 0 };
}

/** The conversations the user opted into for this connector. */
export async function includedConversations(
  sb: Sb,
  userId: string,
  connector: ConnectorId,
): Promise<WatchedConversation[]> {
  const { data, error } = await sb
    .from("conversation_sources")
    .select("conversation_id, label, link")
    .eq("user_id", userId)
    .eq("connector", connector)
    .eq("included", true);

  if (error) return [];
  type Row = { conversation_id: string; label: string | null; link: string | null };
  return ((data as Row[] | null) ?? []).map((r) => ({
    conversationId: r.conversation_id,
    label: r.label,
    link: r.link,
  }));
}

/** Everything discovered for this connector, for the picker UI. */
export async function listConversations(
  sb: Sb,
  userId: string,
  connector: ConnectorId,
): Promise<
  { conversationId: string; label: string | null; link: string | null; isGroup: boolean; included: boolean }[]
> {
  const { data, error } = await sb
    .from("conversation_sources")
    .select("conversation_id, label, link, is_group, included")
    .eq("user_id", userId)
    .eq("connector", connector)
    .order("label", { ascending: true, nullsFirst: false });

  if (error) return [];
  type Row = {
    conversation_id: string; label: string | null; link: string | null;
    is_group: boolean | null; included: boolean | null;
  };
  return ((data as Row[] | null) ?? []).map((r) => ({
    conversationId: r.conversation_id,
    label: r.label,
    link: r.link,
    isGroup: !!r.is_group,
    included: !!r.included,
  }));
}

/** The picker's write path: watch or un-watch specific conversations. */
export async function setIncluded(
  sb: Sb,
  userId: string,
  connector: ConnectorId,
  conversationIds: string[],
  included: boolean,
): Promise<{ updated: number }> {
  if (!conversationIds.length) return { updated: 0 };

  const { data, error } = await sb
    .from("conversation_sources")
    .update({ included, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("connector", connector)
    .in("conversation_id", conversationIds)
    .select("conversation_id");

  if (error) return { updated: 0 };
  return { updated: data?.length ?? 0 };
}
