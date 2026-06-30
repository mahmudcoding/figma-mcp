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
  FIGMA_CLIENT_ID: OptionalNonEmptyString,
  FIGMA_CLIENT_SECRET: OptionalNonEmptyString,
  OAUTH_REDIRECT_URI: z.string().url().default("http://127.0.0.1:3333/auth/callback"),
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().positive().default(3333),
  DATABASE_PATH: z.string().default(".data/figma-mcp.sqlite"),
  LOG_LEVEL: z.string().default("info"),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  ENCRYPTION_KEY: OptionalNonEmptyString,
  SERVER_SHARED_SECRET: OptionalNonEmptyString,
  PLUGIN_AUTH_TOKEN: OptionalNonEmptyString
});

export interface AppConfig {
  readonly figmaClientId: string | undefined;
  readonly figmaClientSecret: string | undefined;
  readonly oauthRedirectUri: string;
  readonly host: string;
  readonly port: number;
  readonly databasePath: string;
  readonly logLevel: string;
  readonly requestTimeoutMs: number;
  readonly encryptionKey: Buffer;
  readonly serverSharedSecret: string;
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

function encryptionKeyFromConfig(value: string | undefined, dataDir: string): Buffer {
  const raw = value ?? readOrCreateSecret(path.join(dataDir, "encryption.key"), 32);
  const maybeHex = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : undefined;

  if (maybeHex && maybeHex.length === 32) {
    return maybeHex;
  }

  const maybeBase64 = Buffer.from(raw, "base64");
  if (maybeBase64.length === 32) {
    return maybeBase64;
  }

  return crypto.createHash("sha256").update(raw).digest();
}

export function loadConfig(): AppConfig {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }

  const dataDir = ensureDataDir();
  const env = parsed.data;

  return {
    figmaClientId: env.FIGMA_CLIENT_ID,
    figmaClientSecret: env.FIGMA_CLIENT_SECRET,
    oauthRedirectUri: env.OAUTH_REDIRECT_URI,
    host: env.HOST,
    port: env.PORT,
    databasePath: path.resolve(PROJECT_ROOT, env.DATABASE_PATH),
    logLevel: env.LOG_LEVEL,
    requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    encryptionKey: encryptionKeyFromConfig(env.ENCRYPTION_KEY, dataDir),
    serverSharedSecret:
      env.SERVER_SHARED_SECRET ?? readOrCreateSecret(path.join(dataDir, "server-shared-secret"), 32),
    pluginAuthToken:
      env.PLUGIN_AUTH_TOKEN ?? readOrCreateSecret(path.join(dataDir, "plugin-auth-token"), 32),
    dataDir
  };
}
