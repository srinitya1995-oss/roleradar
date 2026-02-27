import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          "**/node_modules/**",
          "**/.git/**",
          "**/.next/**",
          "**/scripts/**",
          "**/docs/**",
          "**/*.md",
        ],
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

export default nextConfig;
