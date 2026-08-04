import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "googleapis",
    "google-auth-library",
  ],
};

export default nextConfig;
