import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server binds on the container IP; browsers hit 127.0.0.1 which Next
  // treats as cross-origin and blocks /_next/hmr (and breaks client hydration).
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
