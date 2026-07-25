/** @type {import('next').NextConfig} */

// Baseline security headers, applied to every route. The CSP is sent in
// Report-Only mode first so it can be validated against real traffic without
// breaking the app (external portfolio scripts/styles, Google, Supabase,
// Stripe, etc.); flip it to an enforcing `Content-Security-Policy` header once
// the violation reports are clean.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  // Next.js needs inline/eval; the portfolio assets + Stripe load externally.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://anchit-tandon.com https://js.stripe.com https://*.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline' https://anchit-tandon.com https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https: wss:",
  "frame-src 'self' https://js.stripe.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // Voice needs the mic; vision needs the camera; some tools use geo/payment.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), payment=(self)" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
];

const nextConfig = {
  // standalone only for Docker; Vercel manages its own output
  ...(process.env.VERCEL ? {} : { output: "standalone" }),
  images: {
    domains: ["lh3.googleusercontent.com", "avatars.githubusercontent.com"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: `${process.env.BACKEND_URL || "http://backend:8000"}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
