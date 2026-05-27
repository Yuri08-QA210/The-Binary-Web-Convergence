import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DO NOT use output: "standalone" - it causes React hydration issues on Render.com
  // Using `next start` directly works reliably
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // engine.wasm is generated at build time by scripts/pad-binary.mjs
  // and served from public/ as a static file
};

export default nextConfig;
