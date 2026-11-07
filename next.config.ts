import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every screen is per-user and per-workspace, so pages render dynamically.
  cacheComponents: false,
  serverExternalPackages: ["@electric-sql/pglite"],
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
