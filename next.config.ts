import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    "pdf-parse",
    "googleapis",
    "google-auth-library",
    "@opentelemetry/sdk-trace-base",
    "@opentelemetry/context-async-hooks",
    "@opentelemetry/exporter-trace-otlp-proto",
    "@opentelemetry/resources",
    "@opentelemetry/semantic-conventions",
  ],
};

export default nextConfig;
