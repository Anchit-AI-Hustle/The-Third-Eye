// Pages that are public or have their own chrome. Every other route keeps the
// app sidebar, including ones that never had a route layout of their own.
const BARE: RegExp[] = [
  /^\/$/,
  /^\/auth(?:\/|$)/,
  /^\/calculators(?:\/|$)/,
  /^\/privacy_policy(?:\/|$)/,
  /^\/terms_of_service(?:\/|$)/,
  /^\/kolab-store(?:\/|$)/,
];

export function showsAppShell(pathname: string): boolean {
  return !BARE.some((re) => re.test(pathname));
}

const ASSISTANT_MAIN =
  "flex-1 min-w-0 overflow-hidden flex flex-col pt-[env(safe-area-inset-top)] lg:pt-0 pb-[calc(4rem_+_env(safe-area-inset-bottom))] lg:pb-0";

export function mainClassFor(pathname: string): string | undefined {
  if (pathname === "/assistant" || pathname.startsWith("/assistant/")) return ASSISTANT_MAIN;
  return undefined;
}
