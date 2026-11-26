import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { loadEnvConfig } from "@next/env";

const execute = promisify(execFile);

// Import replaces the database. Preserve the complete local database around
// those tests, including tables the application's JSON backup omits.
export class DatabaseSnapshot {
  constructor(readonly path: string) {}

  private environment() {
    loadEnvConfig(process.cwd());
    const url = new URL(process.env.DATABASE_URL!);
    return {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port,
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: url.pathname.slice(1),
    };
  }

  async save() {
    await execute("pg_dump", ["--format=custom", "--file", this.path], { env: this.environment() });
  }

  async restore() {
    await execute("pg_restore", ["--clean", "--if-exists", "--no-owner", "--dbname", this.environment().PGDATABASE, this.path], { env: this.environment() });
  }
}
