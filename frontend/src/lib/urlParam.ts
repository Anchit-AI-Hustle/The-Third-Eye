/** Reads a one-time query value (a deep link from a notification or another page) and drops it from the URL. */
export function takeUrlParam(name: string): string | null {
  const url = new URL(window.location.href);
  const value = url.searchParams.get(name);
  if (value === null) return null;
  url.searchParams.delete(name);
  window.history.replaceState(null, "", url.pathname + url.search);
  return value;
}
