import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Allow large static files in public/
  // engine.wasm is 100MB - Render handles this fine
};

export default nextConfig;
