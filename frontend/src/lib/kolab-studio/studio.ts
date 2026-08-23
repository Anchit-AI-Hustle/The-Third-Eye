// web/lib/studio.ts
// SERVER-side Creator Studio reads (RLS-scoped to the signed-in user). Mutations go through
// the /api/studio/* routes which additionally enforce the feature gate.
import "server-only";
import { supabaseServer } from "./supabaseServer";

export interface Pillar {
  id: string;
  name: string;
  role: string | null;
  color: string | null;
  sort_order: number;
}
export interface PlanItem {
  id: string;
  pillar_id: string | null;
  format: string | null;
  asset_type: "video" | "carousel" | "photo" | "loop" | null;
  date: string | null;
  time: string | null;
  hook: string | null;
  caption: string | null;
  status: "to_shoot" | "shot" | "edited" | "scheduled" | "posted";
  done: boolean;
  notes: string | null;
}
export interface Deal {
  id: string;
  brand: string | null;
  emoji: string | null;
  product: string | null;
  category: string | null;
  code: string | null;
  discount: string | null;
  price: string | null;
  affiliate_url: string | null;
  active: boolean;
}
export interface ScheduledPost {
  id: string;
  title: string | null;
  scheduled_at: string | null;
  channels: string[] | null;
  publish_status: "queued" | "publishing" | "published" | "failed";
}
export interface Channel {
  id: string;
  platform: "instagram" | "youtube" | "facebook" | "tiktok" | "google";
  handle: string | null;
  connected: boolean;
}

export async function getPillars(): Promise<Pillar[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("content_pillars")
    .select("id, name, role, color, sort_order")
    .order("sort_order", { ascending: true });
  return (data as Pillar[] | null) ?? [];
}

export async function getPlan(): Promise<PlanItem[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("content_plan")
    .select("id, pillar_id, format, asset_type, date, time, hook, caption, status, done, notes")
    .order("date", { ascending: true, nullsFirst: false });
  return (data as PlanItem[] | null) ?? [];
}

export async function getDeals(): Promise<Deal[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("deals")
    .select("id, brand, emoji, product, category, code, discount, price, affiliate_url, active")
    .order("created_at", { ascending: false });
  return (data as Deal[] | null) ?? [];
}

export async function getSchedule(): Promise<ScheduledPost[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("scheduled_posts")
    .select("id, title, scheduled_at, channels, publish_status")
    .order("scheduled_at", { ascending: true, nullsFirst: false });
  return (data as ScheduledPost[] | null) ?? [];
}

export async function getChannels(): Promise<Channel[]> {
  const supabase = await supabaseServer();
  const { data } = await supabase
    .from("channels")
    .select("id, platform, handle, connected");
  return (data as Channel[] | null) ?? [];
}
