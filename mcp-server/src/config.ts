import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../..");
dotenv.config({ path: path.join(PROJECT_ROOT, ".env"), quiet: true });

const OptionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional()
);

const EnvSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_PATH: z.string().default(".data/figma-mcp.sqlite"),
  LOG_LEVEL: z.string().default("info"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  PLUGIN_AUTH_TOKEN: OptionalNonEmptyString
});

export interface AppConfig {
  readonly host: string;
  readonly port: number;
  readonly databasePath: string;
  readonly logLevel: string;
  readonly requestTimeoutMs: number;
  readonly pluginAuthToken: string;
  readonly dataDir: string;
}

function ensureDataDir(): string {
  const dataDir = path.join(PROJECT_ROOT, ".data");
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  return dataDir;
}

function readOrCreateSecret(filePath: string, byteLength = 32): string {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf8").trim();
  }

  const secret = crypto.randomBytes(byteLength).toString("base64url");
  fs.writeFileSync(filePath, `${secret}\n`, { mode: 0o600 });
  return secret;
}

export function loadConfig(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }

  const dataDir = ensureDataDir();
  const env = parsed.data;

  return {
    host: env.HOST,
    port: env.PORT,
    databasePath: path.resolve(PROJECT_ROOT, env.DATABASE_PATH),
    logLevel: env.LOG_LEVEL,
    requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    pluginAuthToken:
      env.PLUGIN_AUTH_TOKEN ?? readOrCreateSecret(path.join(dataDir, "plugin-auth-token"), 32),
    dataDir
  };
}
