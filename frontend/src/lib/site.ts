// Canonical production origin + provider verification tokens, in one place so
// layout metadata, robots.ts, and sitemap.ts all agree.
//
// Sourced from Vercel env in prod; falls back to the live domain so absolute
// URLs (canonical, OG, sitemap) stay correct even if the env var is missing.
export const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://the-third-eye.anchit-tandon.com";

// Verification tokens are public-by-design (they render in HTML for anyone to
// read), so NEXT_PUBLIC_ vars are appropriate. Each is inert until set —
// undefined values render no meta tag at all.
export const GOOGLE_SITE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
export const FB_DOMAIN_VERIFICATION = process.env.NEXT_PUBLIC_FB_DOMAIN_VERIFICATION;
export const BING_SITE_VERIFICATION = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION;
