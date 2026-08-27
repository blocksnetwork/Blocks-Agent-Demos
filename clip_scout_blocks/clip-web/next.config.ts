import path from "node:path";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app is nested inside the agent it calls, and the agent has its own
  // lockfile. Without this, Next.js walks up and picks the agent directory as
  // the workspace root.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
