import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "googleapis",
    "google-auth-library",
    "@opentelemetry/sdk-trace-node",
    "@opentelemetry/exporter-trace-otlp-proto",
  ],
};

export default nextConfig;
