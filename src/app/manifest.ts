import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bendline — Journeyman Plumber Prep",
    short_name: "Bendline",
    description:
      "Offline-capable PWA for journeyman plumber licensing exam prep with adaptive code drills and isometric pipe-drawing lab.",
    start_url: "/",
    display: "standalone",
    background_color: "rgb(10, 14, 20)",
    theme_color: "rgb(10, 14, 20)",
    icons: [
      {
        src: "/icons/bendline-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
