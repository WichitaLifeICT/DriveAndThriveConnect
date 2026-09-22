import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Driver applications upload two documents of up to 8 MB each
      bodySizeLimit: "20mb",
    },
  },
};

export default nextConfig;
