import path from "path";
import dotenv from "dotenv";
import { pool } from "./pool.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

const rows = [
  ["Contract Law — Cases & Materials", "Law", "1st", 12.5],
  ["Criminal Procedure Reader", "Law", "2nd", 15.0],
  ["EU Law Compendium", "Law", "3rd", 18.75],
  ["Microeconomics Workbook", "Economics", "1st", 9.99],
  ["Macroeconomics Lecture Notes", "Economics", "2nd", 11.5],
  ["Econometrics Problem Sets", "Economics", "Master", 22.0],
  ["Statics & Dynamics Summary", "Engineering", "1st", 14.25],
  ["Thermodynamics Essentials", "Engineering", "2nd", 16.5],
  ["Signals & Systems — Selected Chapters", "Engineering", "3rd", 19.0],
  ["Machine Design Handbook (excerpts)", "Engineering", "4th", 21.5],
  ["Anatomy Atlas — Selected Plates", "Medicine", "1st", 24.0],
  ["Pathology Core Notes", "Medicine", "3rd", 26.5],
  ["Modern Fiction Anthology", "Arts", "2nd", 8.5],
  ["Philosophy Reader", "Arts", "Master", 13.0],
  ["Organic Chemistry Lab Manual", "Sciences", "2nd", 17.25],
  ["Statistics for Scientists", "Sciences", "3rd", 12.0],
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query(
      "TRUNCATE TABLE orders, literature RESTART IDENTITY CASCADE"
    );

    const insert =
      "INSERT INTO literature (name, faculty, year, price) VALUES ($1, $2, $3, $4)";
    for (const [name, faculty, year, price] of rows) {
      await client.query(insert, [name, faculty, year, price]);
    }
    console.log(`Seeded ${rows.length} literature items.`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
