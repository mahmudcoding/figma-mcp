import pino from "pino";
import type { AppConfig } from "./config.js";

export function createLogger(config: AppConfig) {
  return pino(
    {
      level: config.logLevel,
      redact: {
        paths: [
          "pluginAuthToken",
          "*.authToken"
        ],
        censor: "[redacted]"
      }
    },
    pino.destination(2)
  );
}
