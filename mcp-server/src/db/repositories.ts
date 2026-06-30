import crypto from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

export interface UserRecord {
  id: string;
  email: string;
  created_at: string;
}

export interface TokenRecord {
  user_id: string;
  encrypted_access_token: string;
  encrypted_refresh_token: string;
  expires_at: string;
  updated_at: string;
}

export interface AuditLogInput {
  command: string;
  payload: unknown;
  result: unknown;
  success: boolean;
}

export class UserRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public upsertByEmail(email: string): UserRecord {
    const existing = this.db
      .prepare("SELECT id, email, created_at FROM users WHERE email = ?")
      .get(email) as UserRecord | undefined;

    if (existing) {
      return existing;
    }

    const id = crypto.randomUUID();
    this.db.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(id, email);
    return this.db.prepare("SELECT id, email, created_at FROM users WHERE id = ?").get(id) as unknown as UserRecord;
  }

  public first(): UserRecord | undefined {
    return this.db.prepare("SELECT id, email, created_at FROM users ORDER BY created_at ASC LIMIT 1").get() as
      | UserRecord
      | undefined;
  }
}

export class TokenRepository {
  public constructor(private readonly db: DatabaseSync) {}

  public save(record: Omit<TokenRecord, "updated_at">): void {
    this.db
      .prepare(
        `
        INSERT INTO figma_tokens (
          user_id,
          encrypted_access_token,
          encrypted_refresh_token,
          expires_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id) DO UPDATE SET
          encrypted_access_token = excluded.encrypted_access_token,
          encrypted_refresh_token = excluded.encrypted_refresh_token,
          expires_at = excluded.expires_at,
          updated_at = datetime('now')
      `
      )
      .run(
        record.user_id,
        record.encrypted_access_token,
        record.encrypted_refresh_token,
        record.expires_at
      );
  }

  public findByUserId(userId: string): TokenRecord | undefined {
    return this.db
      .prepare("SELECT * FROM figma_tokens WHERE user_id = ?")
      .get(userId) as TokenRecord | undefined;
  }
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
