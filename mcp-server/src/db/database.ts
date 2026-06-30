import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export class Database {
  public readonly connection: DatabaseSync;

  public constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
    this.connection = new DatabaseSync(databasePath);
    this.connection.exec("PRAGMA foreign_keys = ON;");
  }

  public migrate(): void {
    const schemaPath = path.resolve(import.meta.dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf8");
    this.connection.exec(schema);
  }

  public close(): void {
    this.connection.close();
  }
}
