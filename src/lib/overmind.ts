import { OvermindClient } from "@overmind-lab/trace-sdk";
import { OpenAI } from "openai";

let initialized = false;

export const ensureOvermindTracing = () => {
  if (initialized || !process.env.OVERMIND_API_KEY) return;
  initialized = true;

  const client = new OvermindClient({
    apiKey: process.env.OVERMIND_API_KEY,
    appName: "invoice-agent",
  });

  client.initTracing({
    enableBatching: false,
    enabledProviders: { openai: OpenAI },
  });
};
