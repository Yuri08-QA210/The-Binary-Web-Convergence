import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // engine.wasm is generated at build time by scripts/pad-binary.mjs
  // and served from public/ as a static file
};

export default nextConfig;
