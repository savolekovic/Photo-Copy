import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { pool } from "./pool.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function setup() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const migratePath = path.join(__dirname, "migrate_status.sql");
  const sql = fs.readFileSync(schemaPath, "utf8");
  const migrateSql = fs.readFileSync(migratePath, "utf8");
  const client = await pool.connect();
  try {
    await client.query(sql);
    await client.query(migrateSql);
    console.log("Database schema applied.");
  } finally {
    client.release();
    await pool.end();
  }
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
