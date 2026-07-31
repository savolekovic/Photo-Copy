/**
 * Bootstrap an operator account.
 *
 * Operators cannot self-register — the signup path only ever creates students — so the
 * first operator has to be created out of band:
 *
 *   npm run create:operator --workspace=server -- operater@ucg.ac.me
 *
 * The account has no password. The operator signs in with the same magic link as everyone
 * else, and the university-domain restriction does not apply to an address that already
 * exists, so staff addresses on any domain work.
 */
import path from "path";
import dotenv from "dotenv";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { LOCALES } from "../lib/i18n.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

function usage(message) {
  if (message) console.error(`\nError: ${message}`);
  console.error(`
Usage:
  npm run create:operator --workspace=server -- <email> [locale]

Arguments:
  email    Operator's e-mail address. Any domain is accepted.
  locale   Optional interface/e-mail language: ${LOCALES.join(" | ")} (default ${config.defaultLocale}).

Examples:
  npm run create:operator --workspace=server -- operater@ucg.ac.me
  npm run create:operator --workspace=server -- shop@example.com en
`);
  process.exit(1);
}

async function main() {
  const [emailArg, localeArg] = process.argv.slice(2);

  if (!emailArg) usage("an e-mail address is required");

  const email = String(emailArg).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    usage(`"${emailArg}" is not a valid e-mail address`);
  }

  const locale = localeArg ? String(localeArg).trim() : config.defaultLocale;
  if (!LOCALES.includes(locale)) {
    usage(`locale must be one of ${LOCALES.join(", ")}`);
  }

  const client = await pool.connect();
  try {
    const { rows: existing } = await client.query(
      `SELECT id, email, role, is_active FROM users WHERE LOWER(email) = $1`,
      [email]
    );

    if (existing.length > 0) {
      const user = existing[0];
      if (user.role === "operator") {
        // Idempotent: re-running reactivates rather than failing, which is what you want
        // if the account was disabled.
        await client.query(
          `UPDATE users SET is_active = TRUE, locale = $2 WHERE id = $1`,
          [user.id, locale]
        );
        console.log(`Operator ${user.email} already exists (id ${user.id}) — reactivated.`);
        return;
      }

      // Promoting a student would silently give them every other student's data.
      console.error(
        `\nRefusing to change roles: ${user.email} already exists as a "${user.role}".\n` +
          `Promote deliberately with SQL if that is really intended:\n` +
          `  UPDATE users SET role = 'operator' WHERE id = ${user.id};\n`
      );
      process.exitCode = 1;
      return;
    }

    const { rows } = await client.query(
      `INSERT INTO users (email, role, locale)
       VALUES ($1, 'operator', $2)
       RETURNING id, email, role, locale`,
      [email, locale]
    );
    const user = rows[0];
    console.log(
      `Created operator:\n  id      ${user.id}\n  email   ${user.email}\n  locale  ${user.locale}\n\n` +
        `Sign in at ${config.clientUrl}/prijava — a one-time login link will be e-mailed.`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
