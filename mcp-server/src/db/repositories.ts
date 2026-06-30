import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface AuditLogInput {
  command: string;
  payload: unknown;
  result: unknown;
  success: boolean;
}

export class AuditRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public write(input: AuditLogInput): void {
    this.db
      .prepare(
        `
        INSERT INTO audit_logs (id, command, payload, result, success)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(
        crypto.randomUUID(),
        input.command,
        JSON.stringify(input.payload),
        JSON.stringify(input.result),
        input.success ? 1 : 0
      );
  }
}
