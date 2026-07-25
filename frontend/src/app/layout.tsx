import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Inter } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";
import {
  SITE_URL,
  GOOGLE_SITE_VERIFICATION,
  FB_DOMAIN_VERIFICATION,
  BING_SITE_VERIFICATION,
} from "@/lib/site";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const PORTFOLIO_ASSETS = "https://anchit-tandon.com/assets";

// Build the verification block, omitting any token that isn't set so we never
// ship an empty <meta content=""> (which some crawlers treat as a failed claim).
const verificationOther: Record<string, string> = {};
if (BING_SITE_VERIFICATION) verificationOther["msvalidate.01"] = BING_SITE_VERIFICATION;
if (FB_DOMAIN_VERIFICATION) verificationOther["facebook-domain-verification"] = FB_DOMAIN_VERIFICATION;

const verification: NonNullable<Metadata["verification"]> = {};
if (GOOGLE_SITE_VERIFICATION) verification.google = GOOGLE_SITE_VERIFICATION;
if (Object.keys(verificationOther).length) verification.other = verificationOther;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "The Third Eye",
  description: "Your Personal AI Operating System",
  manifest: "/manifest.json",
  alternates: { canonical: "/" },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Third Eye",
  },
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "The Third Eye",
    title: "The Third Eye",
    description: "Your Personal AI Operating System",
  },
  // Search Console / Bing / Meta domain verification. Populated from env at
  // build/render time; safe to commit while empty.
  verification,
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Allow pinch-zoom for accessibility (Lighthouse best-practice: never set
  // user-scalable=no / maximum-scale < 5 — it blocks low-vision users).
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#050505",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Shared portfolio navigation + project-level SkillTree / prompt library. */}
        <link rel="stylesheet" href={`${PORTFOLIO_ASSETS}/app-skill-map.css`} />
        <link rel="stylesheet" href={`${PORTFOLIO_ASSETS}/project-playbooks.css`} />
      </head>
      <body
        className={`${inter.variable} ${GeistSans.variable} ${GeistMono.variable} bg-background-base text-text-primary font-sans antialiased`}
      >
        <Providers>{children}</Providers>
        <Script src={`${PORTFOLIO_ASSETS}/app-skill-map.js`} strategy="afterInteractive" />
        <Script src={`${PORTFOLIO_ASSETS}/project-playbooks.js`} strategy="afterInteractive" />
        <script
          dangerouslySetInnerHTML={{
            // Register after load so it never competes with first paint / hydration.
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').then(function(reg){reg.addEventListener('updatefound',function(){var nw=reg.installing;if(nw)nw.addEventListener('statechange',function(){if(nw.state==='installed'&&navigator.serviceWorker.controller)nw.postMessage('SKIP_WAITING')})})});var refreshing=false;navigator.serviceWorker.addEventListener('controllerchange',function(){if(refreshing)return;refreshing=true;window.location.reload()})})}`,
          }}
        />
      </body>
    </html>
  );
}
