import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Served at /sitemap.xml. Only lists publicly-indexable pages — the rest of the
// app is auth-gated and intentionally excluded (see robots.ts). Keep this in
// sync when a new public marketing/legal page is added.
export default function sitemap(): MetadataRoute.Sitemap {
  const routes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/upgrade", priority: 0.7, changeFrequency: "monthly" },
    { path: "/privacy_policy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/terms_of_service", priority: 0.3, changeFrequency: "yearly" },
  ];

  return routes.map(({ path, priority, changeFrequency }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency,
    priority,
  }));
}
