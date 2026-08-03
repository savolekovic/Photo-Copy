import path from "path";
import dotenv from "dotenv";
import { pool } from "./pool.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

/**
 * PLACEHOLDER catalogue for local development.
 *
 * None of this is the client's real data: faculty names, programmes, titles and prices are
 * all invented, pending the real roster. Everything here is editable through the operator's
 * Administracija screens, so this only exists to give a fresh database something to show.
 *
 * Titles are Montenegrin because they are stored verbatim and rendered as-is — unlike
 * interface strings they cannot be translated at render time.
 */

/** faculty name -> [programme names]. The old model had no programmes; one each will do. */
const FACULTIES = [
  { name: "Pravni fakultet", short: "PF", programmes: ["Pravo"] },
  { name: "Ekonomski fakultet", short: "EF", programmes: ["Ekonomija"] },
  { name: "Elektrotehnički fakultet", short: "ETF", programmes: ["Elektrotehnika"] },
  { name: "Medicinski fakultet", short: "MF", programmes: ["Medicina"] },
  { name: "Filozofski fakultet", short: "FF", programmes: ["Filozofija"] },
  { name: "Prirodno-matematički fakultet", short: "PMF", programmes: ["Matematika"] },
];

/**
 * Three materials per programme, one of each type the spec names. Each is placed in every
 * study year, which is the point of the placements table: one entry, many slots.
 */
const MATERIALS_BY_PROGRAMME = {
  Pravo: [
    { title: "Zbirka slučajeva i materijala", type: "knjiga", price: 13.0 },
    { title: "Zakoni i komentari", type: "skripta", price: 9.5 },
    { title: "Skripta sa seminara", type: "ostali_materijal", price: 6.0 },
  ],
  Ekonomija: [
    { title: "Predavanja i zadaci", type: "knjiga", price: 11.0 },
    { title: "Radna knjiga za vježbe", type: "skripta", price: 8.0 },
    { title: "Priprema za ispit", type: "ostali_materijal", price: 5.5 },
  ],
  Elektrotehnika: [
    { title: "Zbirka predavanja", type: "knjiga", price: 16.0 },
    { title: "Zadaci sa rješenjima", type: "skripta", price: 10.5 },
    { title: "Formule i ključna poglavlja", type: "ostali_materijal", price: 4.5 },
  ],
  Medicina: [
    { title: "Klinička čitanka (izabrana poglavlja)", type: "knjiga", price: 23.0 },
    { title: "Atlas i dijagrami", type: "skripta", price: 14.0 },
    { title: "Skripta za ispit", type: "ostali_materijal", price: 7.5 },
  ],
  Filozofija: [
    { title: "Čitanka primarnih tekstova", type: "knjiga", price: 9.0 },
    { title: "Kritika i kontekst", type: "skripta", price: 7.0 },
    { title: "Eseji i seminarske bilješke", type: "ostali_materijal", price: 5.0 },
  ],
  Matematika: [
    { title: "Predavanja i slajdovi", type: "knjiga", price: 14.0 },
    { title: "Laboratorijski praktikum", type: "skripta", price: 9.0 },
    { title: "Zbirka zadataka sa rješenjima", type: "ostali_materijal", price: 6.5 },
  ],
};

/** One example subject, to prove the optional level works end to end. */
const EXAMPLE_SUBJECTS = [
  { programme: "Pravo", yearCode: "3", name: "Građansko procesno pravo" },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Orders are included deliberately: they reference materials, so the catalogue cannot
    // be replaced without them. User accounts are left alone, so the operator survives.
    await client.query(`
      TRUNCATE TABLE orders, material_placements, subjects, materials,
                     study_programmes, faculties
      RESTART IDENTITY CASCADE`);

    const { rows: years } = await client.query(
      `SELECT id, code FROM study_years ORDER BY sort_order`
    );
    if (years.length === 0) {
      throw new Error(
        "study_years is empty — run `npm run db:setup` first so migration 004 populates it."
      );
    }
    const yearByCode = Object.fromEntries(years.map((y) => [y.code, y.id]));

    let materialCount = 0;
    let placementCount = 0;
    const programmeIds = {};

    for (const [i, fac] of FACULTIES.entries()) {
      const { rows: fr } = await client.query(
        `INSERT INTO faculties (name, short_name, sort_order) VALUES ($1, $2, $3)
         RETURNING id`,
        [fac.name, fac.short, (i + 1) * 10]
      );
      const facultyId = fr[0].id;

      for (const [j, prog] of fac.programmes.entries()) {
        const { rows: pr } = await client.query(
          `INSERT INTO study_programmes (faculty_id, name, sort_order) VALUES ($1, $2, $3)
           RETURNING id`,
          [facultyId, prog, (j + 1) * 10]
        );
        const programmeId = pr[0].id;
        programmeIds[prog] = programmeId;

        for (const mat of MATERIALS_BY_PROGRAMME[prog] ?? []) {
          const { rows: mr } = await client.query(
            `INSERT INTO materials (title, material_type, price) VALUES ($1, $2, $3)
             RETURNING id`,
            [mat.title, mat.type, mat.price]
          );
          materialCount += 1;

          // Placed in every year — one material, many placements.
          for (const y of years) {
            await client.query(
              `INSERT INTO material_placements (material_id, programme_id, study_year_id)
               VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
              [mr[0].id, programmeId, y.id]
            );
            placementCount += 1;
          }
        }
      }
    }

    let subjectCount = 0;
    for (const s of EXAMPLE_SUBJECTS) {
      const programmeId = programmeIds[s.programme];
      const yearId = yearByCode[s.yearCode];
      if (!programmeId || !yearId) continue;
      const { rows: sr } = await client.query(
        `INSERT INTO subjects (programme_id, study_year_id, name) VALUES ($1, $2, $3)
         RETURNING id`,
        [programmeId, yearId, s.name]
      );
      subjectCount += 1;

      // Attach that programme+year's materials to the subject as well, so the optional
      // level has something under it.
      await client.query(
        // $1 is cast explicitly: in an INSERT ... SELECT, Postgres cannot infer a bare
        // parameter's type from the target column and falls back to text.
        `INSERT INTO material_placements (material_id, programme_id, study_year_id, subject_id)
         SELECT DISTINCT p.material_id, p.programme_id, p.study_year_id, $1::integer
           FROM material_placements p
          WHERE p.programme_id = $2 AND p.study_year_id = $3 AND p.subject_id IS NULL
         ON CONFLICT DO NOTHING`,
        [sr[0].id, programmeId, yearId]
      );
    }

    await client.query("COMMIT");
    console.log(
      `Seeded ${FACULTIES.length} faculties, ${Object.keys(programmeIds).length} programmes, ` +
        `${years.length} study years, ${subjectCount} subject(s), ` +
        `${materialCount} materials, ${placementCount} placements.`
    );
    console.log("All of it is placeholder data — replace via Administracija.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
