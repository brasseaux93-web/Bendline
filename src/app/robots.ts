import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/accuracy", "/legal/"],
        disallow: ["/api/", "/admin", "/account", "/auth", "/onboarding", "/offline"],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
