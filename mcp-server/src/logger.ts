import pino from "pino";
import type { AppConfig } from "./config.js";

export function createLogger(config: AppConfig) {
  return pino(
    {
      level: config.logLevel,
      redact: {
        paths: [
          "figmaClientSecret",
          "pluginAuthToken",
          "serverSharedSecret",
          "*.access_token",
          "*.refresh_token",
          "*.encrypted_access_token",
          "*.encrypted_refresh_token"
        ],
        censor: "[redacted]"
      }
    },
    pino.destination(2)
  );
}
