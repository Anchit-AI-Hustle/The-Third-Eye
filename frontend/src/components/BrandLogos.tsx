// Real brand marks for third-party integrations, so cards show the actual
// service logo (Gmail, Google Calendar, Google) instead of a generic glyph.

export function GmailLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="Gmail">
      <path fill="#4285F4" d="M6 38V14l18 13.5L42 14v24a2 2 0 0 1-2 2h-6V22l-10 7.5L14 22v18H8a2 2 0 0 1-2-2z" />
      <path fill="#34A853" d="M6 38V14l2-1.5 16 12 16-12L42 14v0-.5A2.5 2.5 0 0 0 39.5 11a2.5 2.5 0 0 0-1.5.5L24 22 10 11.5A2.5 2.5 0 0 0 8.5 11 2.5 2.5 0 0 0 6 13.5V38z" opacity=".0" />
      <path fill="#EA4335" d="M6 13.5A2.5 2.5 0 0 1 10 11.5L24 22 8 34V14z" />
      <path fill="#FBBC04" d="M42 13.5A2.5 2.5 0 0 0 38 11.5L24 22l16 12V14z" />
      <path fill="#C5221F" d="M6 13.5V14l18 13.5L42 14v-.5A2.5 2.5 0 0 0 38 11.5L24 22 10 11.5A2.5 2.5 0 0 0 6 13.5z" opacity=".0" />
      <path fill="#fff" d="M14 22v18h20V22l-10 7.5z" opacity=".0" />
    </svg>
  );
}

export function GoogleCalendarLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-label="Google Calendar">
      <rect x="10" y="10" width="28" height="28" rx="3" fill="#fff" />
      <path fill="#4285F4" d="M34 10h4a4 4 0 0 1 4 4v4h-8z" />
      <path fill="#EA4335" d="M42 34a4 4 0 0 1-4 4h-4v-8h8z" />
      <path fill="#34A853" d="M6 34a4 4 0 0 0 4 4h4v-8H6z" />
      <path fill="#FBBC04" d="M6 14a4 4 0 0 1 4-4h4v8H6z" />
      <path fill="#188038" d="M6 18h8v12H6z" />
      <path fill="#1967D2" d="M34 18h8v12h-8z" />
      <rect x="14" y="10" width="20" height="8" fill="#4285F4" opacity=".0" />
      <text x="24" y="30" fontSize="14" fontFamily="Arial, sans-serif" fontWeight="bold" fill="#4285F4" textAnchor="middle">31</text>
    </svg>
  );
}

export function GoogleLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-label="Google">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  );
}

export const BRAND_LOGOS: Record<string, (p: { size?: number }) => JSX.Element> = {
  gmail: GmailLogo,
  gcal: GoogleCalendarLogo,
  google: GoogleLogo,
};
