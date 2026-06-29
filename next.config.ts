import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Generates .next/standalone — a self-contained bundle for production Docker images.
  // Has no effect on `next dev`.
  output: "standalone",
};

export default nextConfig;
