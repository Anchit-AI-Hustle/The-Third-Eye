// Sync from the iPhone app without picking anything: the native DeviceSync
// plugin (ios/App/App/AppDelegate.swift) reads the photo library and one folder
// the person grants once; contacts go through the Contacts plugin.

export interface DevicePhoto { id: string; takenAt: string; width: number; height: number; lat?: number; lon?: number; favorite: boolean; thumb: string }
export interface FolderFile { path: string; size: number; modified: string }

export interface DeviceSyncPlugin {
  photoAccess(): Promise<{ status: "full" | "limited" | "denied" }>;
  listPhotos(o: { after?: string; before?: string; limit: number }): Promise<{ photos: DevicePhoto[] }>;
  chooseFolder(): Promise<{ name: string }>;
  folderStatus(): Promise<{ name?: string }>;
  listFolderFiles(): Promise<{ files: FolderFile[] }>;
  readFolderFile(o: { path: string }): Promise<{ data: string }>;
}

export interface SyncStore { get(k: string): string | null; set(k: string, v: string): void }

export const localStore: SyncStore = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode: sync again next time */ } },
};

export function deviceSyncPlugin(): DeviceSyncPlugin | null {
  const cap = (window as { Capacitor?: { getPlatform?: () => string; Plugins?: { DeviceSync?: DeviceSyncPlugin } } }).Capacitor;
  return cap?.getPlatform?.() === "ios" ? cap.Plugins?.DeviceSync ?? null : null;
}

const PHOTOS_AFTER = "te_photos_after";
const FIRST_RUN_PHOTOS = 300;
const PHOTOS_PER_RUN = 1000;

export async function syncPhotos(
  p: DeviceSyncPlugin,
  save: (rows: Record<string, unknown>[]) => Promise<boolean>,
  store: SyncStore,
  { batch = 25 } = {},
): Promise<number> {
  if ((await p.photoAccess()).status === "denied") return 0;
  const toRow = (x: DevicePhoto) => ({ id: x.id, taken_at: x.takenAt, width: x.width, height: x.height, lat: x.lat ?? null, lon: x.lon ?? null, favorite: x.favorite, thumb: x.thumb });
  let after = store.get(PHOTOS_AFTER);
  let count = 0;

  if (!after) {
    let before: string | undefined;
    let newest: string | null = null;
    while (count < FIRST_RUN_PHOTOS) {
      const { photos } = await p.listPhotos({ before, limit: batch });
      if (!photos.length || !(await save(photos.map(toRow)))) break;
      newest ??= photos[0].takenAt;
      before = photos[photos.length - 1].takenAt;
      count += photos.length;
    }
    if (newest) store.set(PHOTOS_AFTER, newest);
    return count;
  }

  while (count < PHOTOS_PER_RUN) {
    const { photos } = await p.listPhotos({ after, limit: batch });
    if (!photos.length || !(await save(photos.map(toRow)))) break;
    after = photos[photos.length - 1].takenAt;
    store.set(PHOTOS_AFTER, after);
    count += photos.length;
  }
  return count;
}

const FOLDER_SEEN = "te_folder_seen";
const READABLE = /\.(txt|md|markdown|csv|json|pdf|docx|rtf|log|html|xml|yaml|yml)$/i;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILES_PER_RUN = 25;

export async function syncFolder(
  p: DeviceSyncPlugin,
  add: (files: File[]) => Promise<number>,
  store: SyncStore,
): Promise<number> {
  if (!(await p.folderStatus()).name) return 0;
  const seen: Record<string, string> = JSON.parse(store.get(FOLDER_SEEN) ?? "{}");
  const { files } = await p.listFolderFiles();
  const fresh = files
    .filter((f) => READABLE.test(f.path) && f.size <= MAX_FILE_BYTES && seen[f.path] !== f.modified)
    .slice(0, FILES_PER_RUN);
  if (!fresh.length) return 0;

  const read: File[] = [];
  for (const f of fresh) {
    const data = await p.readFolderFile({ path: f.path }).then((r) => r.data, () => null);
    if (data === null) continue;
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    read.push(new File([bytes], f.path.split("/").pop()!, { lastModified: Date.parse(f.modified) }));
  }
  const added = read.length ? await add(read) : 0;
  for (const f of fresh) seen[f.path] = f.modified;
  store.set(FOLDER_SEEN, JSON.stringify(seen));
  return added;
}

const LAST_AUTO = "te_device_sync_at";
const AUTO_EVERY_MS = 10 * 60_000;

export function autoSyncDue(store: SyncStore, now = Date.now()): boolean {
  const last = Number(store.get(LAST_AUTO) ?? 0);
  if (now - last < AUTO_EVERY_MS) return false;
  store.set(LAST_AUTO, String(now));
  return true;
}
