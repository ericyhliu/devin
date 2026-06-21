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
};
