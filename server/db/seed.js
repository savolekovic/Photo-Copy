import path from "path";
import dotenv from "dotenv";
import { pool } from "./pool.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

/** Keep in sync with client `constants.js` */
const FACULTIES = [
  "Law",
  "Economics",
  "Engineering",
  "Medicine",
  "Arts",
  "Sciences",
];

const YEARS = ["1st", "2nd", "3rd", "4th", "Master"];

/** Three distinct packs per faculty — each (faculty, year) gets all three */
const PACKS = {
  Law: [
    "Cases & Materials Reader",
    "Statutes & Commentary Pack",
    "Seminar Notes & Outlines",
  ],
  Economics: [
    "Lecture Notes & Problems",
    "Tutorial Workbook",
    "Exam Prep Summary",
  ],
  Engineering: [
    "Core Lecture Compendium",
    "Problem Sets & Solutions",
    "Formula Sheet & Key Chapters",
  ],
  Medicine: [
    "Clinical Reader (selected chapters)",
    "Atlas & Diagram Pack",
    "OSCE / Exam Review Notes",
  ],
  Arts: [
    "Primary Texts Reader",
    "Criticism & Context Pack",
    "Essay & Seminar Notes",
  ],
  Sciences: [
    "Lecture Notes & Slides",
    "Lab Manual & Exercises",
    "Problem Book & Solutions",
  ],
};

function priceFor(faculty, year, packIndex) {
  const base =
    {
      Law: 13,
      Economics: 11,
      Engineering: 16,
      Medicine: 23,
      Arts: 9,
      Sciences: 14,
    }[faculty] ?? 12;
  const yearBump = { "1st": 0, "2nd": 0.5, "3rd": 1, "4th": 1.25, Master: 2 }[year] ?? 0;
  const packBump = packIndex * 0.75;
  return Math.round((base + yearBump + packBump) * 100) / 100;
}

const rows = [];
for (const faculty of FACULTIES) {
  const packs = PACKS[faculty];
  for (const year of YEARS) {
    packs.forEach((packTitle, i) => {
      rows.push([
        `${packTitle} · ${faculty} · ${year}`,
        faculty,
        year,
        priceFor(faculty, year, i),
      ]);
    });
  }
}

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
    console.log(`Seeded ${rows.length} literature items (${FACULTIES.length}×${YEARS.length}×3).`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
