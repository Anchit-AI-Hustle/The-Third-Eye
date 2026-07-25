// On-device audio storage for the Life Log, backed by IndexedDB.
//
// localStorage can't hold hours of audio (a few MB quota), so recorded segments
// live in IndexedDB (hundreds of MB available) keyed by segment id. Transcript /
// events / diary metadata live in localStorage (see store.ts). This keeps audio
// durable across reloads without needing cloud blob storage.

const DB_NAME = "te_lifelog";
const STORE = "audio";
const VERSION = 1;

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no indexedDB")); return; }
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putAudio(id: string, blob: Blob): Promise<boolean> {
  try {
    const db = await idb();
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
    return true;
  } catch { return false; }
}

export async function getAudio(id: string): Promise<Blob | null> {
  try {
    const db = await idb();
    const blob = await new Promise<Blob | null>((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(id);
      r.onsuccess = () => res((r.result as Blob) ?? null);
      r.onerror = () => rej(r.error);
    });
    db.close();
    return blob;
  } catch { return null; }
}

export async function deleteAudio(ids: string[]): Promise<void> {
  try {
    const db = await idb();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, "readwrite");
      for (const id of ids) tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
    db.close();
  } catch { /* noop */ }
}
