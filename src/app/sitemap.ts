import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://127.0.0.1:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/accuracy", "/legal/terms", "/legal/privacy"].map((path) => ({
    url: `${BASE_URL}${path}`,
  }));
}
