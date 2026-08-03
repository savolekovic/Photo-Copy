/**
 * Import the client's real catalogue from a Windows `tree /F` dump (stablo.txt).
 *
 *   npm run import:stablo --workspace=server -- ~/Downloads/stablo.txt
 *   npm run import:stablo --workspace=server -- ~/Downloads/stablo.txt --dry-run
 *   npm run import:stablo --workspace=server -- ~/Downloads/stablo.txt --map=faculties.json
 *
 * Idempotent: faculties, programmes, subjects and materials are matched by name and
 * reused, so re-running after an edit tops up rather than duplicating. Existing orders are
 * never touched.
 *
 * Decisions confirmed with the client:
 *  - The language centre becomes a faculty whose programmes are the languages.
 *  - Material type is inferred from the filename (see TYPE_RULES).
 *  - Prices are not in the file, so everything imports at 0.00 for the operator to fill in.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { pool } from "../db/pool.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

/**
 * Programme -> faculty. The tree names a faculty only for "Ekonomija FMEFB", so the rest
 * cannot be derived and must be stated here. Anything missing is reported and skipped
 * rather than guessed.
 *
 * Keys are the top-level folder names exactly as they appear in the file.
 */
const FACULTY_OF = {
  // "Ekonomija FMEFB": "Fakultet za međunarodnu ekonomiju, finansije i biznis",
  // "PMB": "…",
  // "Politehnika": "…",
  // "Geodezija": "…",
  // "Primijenjena matematika": "…",
  // "Matematika": "…",
  // "HS": "…",
  // "Psihologija": "…",
  // "Sportski menadzment": "…",
  // "Filoloski": "…",
  // "FU": "…",
  // "FKT": "…",
  // "Prehrambena tehnologija": "…",
  // "FDM": "…",
  // "FIST": "…",
  // "Vatel": "…",
};

/** The language-centre branch is modelled as a faculty, not a programme. */
const LANGUAGE_CENTRE_FOLDER = "Jezici -CFL";
const LANGUAGE_CENTRE_FACULTY = "Centar za strane jezike";
/** Materials sitting directly in the CFL root, with no language folder. */
const LANGUAGE_CENTRE_FALLBACK_PROGRAMME = "Ostali jezici";
/** CFL has no study years; everything lands here. */
const LANGUAGE_CENTRE_YEAR = "1";

/** First match wins. Checked against the lower-cased filename. */
const TYPE_RULES = [
  [/skript|praktikum|hrestomatij|zbirka zadataka|radna sveska|workbook|ejercicios/i, "skripta"],
  [/prezentacij|vjezbe|vežbe|handout|observation|uputstv|formul|atlas|audio|\.mp3$/i, "ostali_materijal"],
];

function inferType(filename) {
  for (const [re, type] of TYPE_RULES) if (re.test(filename)) return type;
  return "knjiga";
}

/** Map the file's 21 inconsistent level-2 labels onto our study_years codes. */
function yearCode(label) {
  if (!label) return null;
  const l = label.toLowerCase();
  const m = l.match(/^\s*([1-4])\s*[. ]?\s*god/);
  if (m) return m[1];
  if (/^\s*([1-4])\s*$/.test(l)) return l.trim();
  if (l.includes("maste")) return "master"; // covers the "masteer" typo
  if (/\bdr\b|dr\.|doktor/.test(l)) return "doktorske";
  return null;
}

/** Parse `tree /F`: every file belongs to the most recently declared directory. */
function parseTree(text) {
  const stack = {};
  const records = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    if (!raw.trim() || /^[A-Z]:\\/.test(raw)) continue;
    const m = raw.match(/[├└]───/);
    if (m) {
      const depth = Math.floor(m.index / 4);
      stack[depth] = raw.slice(m.index + m[0].length).trim();
      for (const k of Object.keys(stack)) if (Number(k) > depth) delete stack[k];
    } else {
      const name = raw.replace(/[│]/g, "").trim();
      if (!name) continue;
      const levels = Object.keys(stack)
        .map(Number)
        .sort((a, b) => a - b)
        .map((k) => stack[k]);
      records.push({ levels, file: name });
    }
  }
  return records;
}

function stripExtension(filename) {
  return filename.replace(/\.(pdf|docx?|mp3|zip|pptx?)$/i, "").trim();
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const mapArg = args.find((a) => a.startsWith("--map="));
  const file = args.find((a) => !a.startsWith("--"));

  // The mapping can come from a JSON file instead of editing FACULTY_OF, so the client's
  // list can be dropped in without touching code.
  if (mapArg) {
    const mapPath = mapArg.slice("--map=".length);
    if (!fs.existsSync(mapPath)) {
      console.error(`\nMapping file not found: ${mapPath}\n`);
      process.exit(1);
    }
    Object.assign(FACULTY_OF, JSON.parse(fs.readFileSync(mapPath, "utf8")));
  }

  if (!file) {
    console.error("\nUsage: npm run import:stablo --workspace=server -- <tree.txt> [--dry-run]\n");
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`\nFile not found: ${file}\n`);
    process.exit(1);
  }

  const records = parseTree(fs.readFileSync(file, "utf8"));
  const topLevels = [...new Set(records.map((r) => r.levels[0]))];

  // Refuse to guess. Every programme must have a stated faculty before anything is written.
  const unmapped = topLevels.filter(
    (t) => t !== LANGUAGE_CENTRE_FOLDER && !FACULTY_OF[t]
  );
  if (unmapped.length > 0) {
    console.error(
      `\nFACULTY_OF is missing ${unmapped.length} of ${topLevels.length} top-level folders.\n` +
        `The tree does not say which faculty these belong to, so they cannot be imported\n` +
        `without guessing. Add them to FACULTY_OF in ${path.basename(import.meta.url)}:\n`
    );
    for (const t of unmapped) console.error(`  "${t}": "",`);
    console.error("");
    process.exit(1);
  }

  /** Rows to write: one per (programme, year, subject?, material). */
  const planned = [];
  const skipped = [];

  for (const { levels, file: filename } of records) {
    const top = levels[0];
    const isCFL = top === LANGUAGE_CENTRE_FOLDER;

    const faculty = isCFL ? LANGUAGE_CENTRE_FACULTY : FACULTY_OF[top];
    const programme = isCFL
      ? levels[1] ?? LANGUAGE_CENTRE_FALLBACK_PROGRAMME
      : top;
    const code = isCFL ? LANGUAGE_CENTRE_YEAR : yearCode(levels[1]);
    // For CFL the level-2 folder is the language (already the programme), so a level-3
    // folder is a subject; for degree programmes level 3 is the subject.
    const subject = isCFL ? levels[2] ?? null : levels[2] ?? null;

    if (!code) {
      skipped.push({ filename, reason: `unrecognised year "${levels[1] ?? "-"}"`, top });
      continue;
    }

    planned.push({
      faculty,
      programme,
      yearCode: code,
      subject,
      title: stripExtension(filename),
      materialType: inferType(filename),
      isAudio: /\.mp3$/i.test(filename),
    });
  }

  const distinctTitles = new Set(planned.map((p) => p.title));
  const audioCount = planned.filter((p) => p.isAudio).length;

  console.log(`\nParsed ${records.length} files from ${path.basename(file)}`);
  console.log(`  faculties           ${new Set(planned.map((p) => p.faculty)).size}`);
  console.log(`  programmes          ${new Set(planned.map((p) => `${p.faculty}/${p.programme}`)).size}`);
  console.log(`  subjects            ${new Set(planned.filter((p) => p.subject).map((p) => `${p.programme}/${p.yearCode}/${p.subject}`)).size}`);
  console.log(`  distinct materials  ${distinctTitles.size}  (${planned.length} placements)`);
  const byType = planned.reduce((acc, p) => ((acc[p.materialType] = (acc[p.materialType] ?? 0) + 1), acc), {});
  console.log(`  inferred types      ${JSON.stringify(byType)}`);
  if (audioCount) {
    console.log(
      `\n  NOTE: ${audioCount} audio file(s) included. A copy shop cannot photocopy audio —\n` +
        `  deactivate them in Administracija if they should not be orderable.`
    );
  }
  if (skipped.length) {
    console.log(`\n  SKIPPED ${skipped.length} file(s) whose folder is not a study year:`);
    for (const s of skipped.slice(0, 10)) console.log(`    ${s.top} :: ${s.filename} — ${s.reason}`);
    if (skipped.length > 10) console.log(`    …and ${skipped.length - 10} more`);
  }

  if (dryRun) {
    console.log("\n--dry-run: nothing written.\n");
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: yearRows } = await client.query(`SELECT id, code FROM study_years`);
    const yearId = Object.fromEntries(yearRows.map((y) => [y.code, y.id]));

    const facultyId = {};
    const programmeId = {};
    const subjectId = {};
    const materialId = {};
    let placements = 0;

    /** Insert-or-fetch by name, so a re-run reuses what is already there. */
    async function upsert(sql, params, cacheKey, cache) {
      if (cache[cacheKey] !== undefined) return cache[cacheKey];
      const { rows } = await client.query(sql, params);
      cache[cacheKey] = rows[0].id;
      return rows[0].id;
    }

    for (const p of planned) {
      const fid = await upsert(
        `INSERT INTO faculties (name) VALUES ($1)
         ON CONFLICT (LOWER(name)) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [p.faculty],
        p.faculty,
        facultyId
      );

      const progKey = `${fid}/${p.programme}`;
      const pid = await upsert(
        `INSERT INTO study_programmes (faculty_id, name) VALUES ($1, $2)
         ON CONFLICT (faculty_id, LOWER(name)) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        [fid, p.programme],
        progKey,
        programmeId
      );

      const yid = yearId[p.yearCode];
      if (!yid) {
        throw new Error(`study_years has no code "${p.yearCode}" — run db:setup first.`);
      }

      let sid = null;
      if (p.subject) {
        const subjKey = `${pid}/${yid}/${p.subject}`;
        sid = await upsert(
          `INSERT INTO subjects (programme_id, study_year_id, name) VALUES ($1, $2, $3)
           ON CONFLICT (programme_id, study_year_id, LOWER(name)) DO UPDATE SET updated_at = NOW()
           RETURNING id`,
          [pid, yid, p.subject],
          subjKey,
          subjectId
        );
      }

      // Deduplicated by title: a material shared across programmes exists once and simply
      // gains another placement, which is the point of the placements table.
      let mid = materialId[p.title];
      if (mid === undefined) {
        const { rows: existing } = await client.query(
          `SELECT id FROM materials WHERE LOWER(title) = LOWER($1) LIMIT 1`,
          [p.title]
        );
        if (existing.length > 0) {
          mid = existing[0].id;
        } else {
          const { rows } = await client.query(
            `INSERT INTO materials (title, material_type, price) VALUES ($1, $2, 0)
             RETURNING id`,
            [p.title, p.materialType]
          );
          mid = rows[0].id;
        }
        materialId[p.title] = mid;
      }

      const { rowCount } = await client.query(
        `INSERT INTO material_placements (material_id, programme_id, study_year_id, subject_id)
         VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
        [mid, pid, yid, sid]
      );
      placements += rowCount;
    }

    await client.query("COMMIT");
    console.log(
      `\nImported: ${Object.keys(facultyId).length} faculties, ` +
        `${Object.keys(programmeId).length} programmes, ` +
        `${Object.keys(subjectId).length} subjects, ` +
        `${Object.keys(materialId).length} materials, ${placements} new placements.`
    );
    console.log("Every price is 0.00 — set them in Administracija.\n");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
