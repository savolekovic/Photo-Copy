import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { pool } from "./pool.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "migrations");

const LEDGER = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`;

/** Numbered .sql files, applied in filename order. */
function migrationFiles() {
  if (!fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

async function setup() {
  const client = await pool.connect();
  try {
    // Base tables. Idempotent (CREATE TABLE IF NOT EXISTS), so it runs on every setup.
    await client.query(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));
    await client.query(LEDGER);

    const { rows } = await client.query("SELECT filename FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.filename));

    let count = 0;
    for (const file of migrationFiles()) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      // One transaction per migration: a failure leaves the ledger untouched, so the
      // same file is retried on the next run instead of being half-applied.
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file]
        );
        await client.query("COMMIT");
        console.log(`  applied ${file}`);
        count += 1;
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} failed: ${err.message}`);
      }
    }

    console.log(
      count === 0
        ? "Database schema up to date; no new migrations."
        : `Database schema applied (${count} migration${count === 1 ? "" : "s"}).`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
