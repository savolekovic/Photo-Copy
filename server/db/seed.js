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

/**
 * PLACEHOLDER catalogue — three packs per faculty, every (faculty, year) gets all three.
 * None of this is real: titles and prices are invented until the client supplies the
 * actual literature list. Titles are in Montenegrin because they are stored verbatim in
 * the database and shown as-is; unlike interface strings they cannot be translated at
 * render time, so a bilingual catalogue would need a per-title translation column.
 */
const PACKS = {
  Law: [
    "Zbirka slučajeva i materijala",
    "Zakoni i komentari",
    "Skripta sa seminara",
  ],
  Economics: [
    "Predavanja i zadaci",
    "Radna knjiga za vježbe",
    "Priprema za ispit",
  ],
  Engineering: [
    "Zbirka predavanja",
    "Zadaci sa rješenjima",
    "Formule i ključna poglavlja",
  ],
  Medicine: [
    "Klinička čitanka (izabrana poglavlja)",
    "Atlas i dijagrami",
    "Skripta za ispit",
  ],
  Arts: [
    "Čitanka primarnih tekstova",
    "Kritika i kontekst",
    "Eseji i seminarske bilješke",
  ],
  Sciences: [
    "Predavanja i slajdovi",
    "Laboratorijski praktikum",
    "Zbirka zadataka sa rješenjima",
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
        // The title alone. Appending the faculty/year codes would bake untranslated
        // English ("… · Law · 1st") into a stored value, and they are already separate
        // columns rendered with localized labels.
        packTitle,
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
