import "@testing-library/jest-dom/vitest";

// jsdom replaces globalThis.AbortController/AbortSignal while leaving Node's
// native undici Request in place, causing `new Request(url, { signal })` to
// reject jsdom's AbortSignal. Preserve non-native signals on Request instances.
const NativeRequest = globalThis.Request;
class CompatRequest extends NativeRequest {
  private _compatSignal?: AbortSignal;
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const { signal: customSignal, ...rest } = init ?? {};
    super(input, rest);
    if (customSignal) this._compatSignal = customSignal;
  }
  override get signal(): AbortSignal {
    return this._compatSignal ?? super.signal;
  }
}
globalThis.Request = CompatRequest;

class MockStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
  [name: string]: any;
}

const mockLocalStorage = new MockStorage();
const mockSessionStorage = new MockStorage();

Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  configurable: true,
  writable: true,
});
Object.defineProperty(globalThis, "sessionStorage", {
  value: mockSessionStorage,
  configurable: true,
  writable: true,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: mockLocalStorage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "sessionStorage", {
    value: mockSessionStorage,
    configurable: true,
    writable: true,
  });
}


