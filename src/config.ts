import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  githubWebhookSecret: required("GITHUB_WEBHOOK_SECRET"),
  devinLabel: process.env.DEVIN_LABEL ?? "devin",
  databaseUrl: required("DATABASE_URL"),

  // Devin v3 API
  devinApiKey: required("DEVIN_API_KEY"),
  devinOrgId: required("DEVIN_ORG_ID"),
  devinApiBaseUrl: process.env.DEVIN_API_BASE_URL ?? "https://api.devin.ai",

  // Worker
  workerIntervalMs: Number(process.env.WORKER_INTERVAL_MS ?? 15000),
  maxConcurrentSessions: Number(process.env.MAX_CONCURRENT_SESSIONS ?? 3),
};
