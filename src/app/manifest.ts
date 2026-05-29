import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pegels",
    short_name: "Pegels",
    description: "Calm spending analysis for Swedish consumers.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0b12",
    theme_color: "#0a0b12",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
