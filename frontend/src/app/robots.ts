import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Served at /robots.txt. Allows crawling of public marketing/legal pages,
// disallows the auth-gated app surface (which is useless to index and just
// bleeds crawl budget), and points crawlers at the sitemap.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/auth/",
          "/dashboard",
          "/apps",
          "/tasks",
          "/job-agent",
          "/kolab",
          "/plans",
          "/generations",
          "/agents",
          "/assistant",
          "/capture",
          "/activity",
          "/knowledge",
          "/finance",
          "/notes",
          "/goals",
          "/tools",
          "/capabilities",
          "/audit",
          "/settings",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
