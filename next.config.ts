import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A second dev server (e.g. port 3001) needs its own build folder; Next allows one server per folder.
  distDir: process.env.HACKMATE_DIST_DIR || ".next",
  // A self-contained server (.next/standalone) for the Docker image: only the files the app needs.
  output: "standalone",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
