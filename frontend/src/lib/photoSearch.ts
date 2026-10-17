import type { Db } from "@/lib/db";

// The assistant's view of photos the iPhone app synced (device_photos).

export interface PhotoQuery { from?: string; to?: string; place?: string; favorite?: boolean; limit?: number }
export interface FoundPhoto { id: string; taken_at: string; url: string }
type Place = { name: string; lat: number; lon: number };

export async function openMeteoGeocode(name: string): Promise<Place | null> {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1`).catch(() => null);
  const hit = res?.ok ? (await res.json()).results?.[0] : null;
  return hit ? { name: hit.name, lat: hit.latitude, lon: hit.longitude } : null;
}

const NEAR_DEGREES = 0.5;

export async function searchPhotos(
  db: Db,
  email: string,
  q: PhotoQuery,
  geocode: (name: string) => Promise<Place | null> = openMeteoGeocode,
): Promise<{ result: string; photos: FoundPhoto[] }> {
  const want = Math.min(Math.max(q.limit ?? 12, 1), 24);
  const place = q.place ? await geocode(q.place) : null;
  if (q.place && !place) return { result: `Couldn't find a place called "${q.place}".`, photos: [] };

  let query = db.from("device_photos").select("id,taken_at,lat,lon,favorite").eq("user_id", email);
  if (q.from) query = query.gte("taken_at", new Date(`${q.from.slice(0, 10)}T00:00:00Z`).toISOString());
  if (q.to) query = query.lte("taken_at", new Date(`${q.to.slice(0, 10)}T23:59:59.999Z`).toISOString());
  if (q.favorite) query = query.eq("favorite", true);
  const { data, error } = await query.order("taken_at", { ascending: false }).limit(place ? 1000 : want);
  if (error) return { result: "Couldn't read your synced photos right now.", photos: [] };

  const rows = (data ?? []) as { id: string; taken_at: string; lat: number | null; lon: number | null }[];
  const near = place
    ? rows.filter((r) => r.lat !== null && r.lon !== null && Math.abs(r.lat - place.lat) <= NEAR_DEGREES && Math.abs(r.lon - place.lon) <= NEAR_DEGREES)
    : rows;
  const photos = near.slice(0, want).map((r) => ({ id: r.id, taken_at: r.taken_at, url: `/api/photos/thumb?id=${encodeURIComponent(r.id)}` }));
  if (!photos.length) {
    return { result: "No synced photos match. Photos sync from The Third Eye iPhone app (Settings > Device Sync > Sync All Photos).", photos };
  }
  const span = `${photos[photos.length - 1].taken_at.slice(0, 10)} to ${photos[0].taken_at.slice(0, 10)}`;
  return { result: `Found ${photos.length} photo${photos.length === 1 ? "" : "s"}${place ? ` near ${place.name}` : ""}, ${span}. They are shown above.`, photos };
}
