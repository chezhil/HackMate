import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HackMate",
    short_name: "HackMate",
    description: "Find hackathons, understand their rules and track every entry.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff4d6",
    theme_color: "#fff4d6",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
    ],
  };
}
