/**
 * Issue a login link for an existing account and print it, instead of e-mailing it.
 *
 *   npm run issue:link --workspace=server -- <email> [days] [clientUrl] [indexNumber]
 *
 * With an index number for an address that has no account yet, redemption creates the
 * student account — the same one-step signup the e-mailed flow performs, since
 * login_tokens carries the index number for exactly that purpose.
 *
 * Useful whenever e-mail cannot be relied on — an unverified SMTP sender, a reviewer whose
 * inbox filters the message, or a demo behind a tunnel. The link is a bearer credential, so
 * send it over a channel you trust and remember it signs the holder in as that account.
 *
 * Uses the app's own token primitives, so nothing about the auth contract is duplicated:
 * only the SHA-256 digest is stored, exactly as the normal flow does.
 */
import path from "path";
import dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });
const { pool } = await import("../db/pool.js");
const { newToken, hashToken } = await import("../lib/tokens.js");
const { config } = await import("../config.js");

const email = process.argv[2];
const days = Number(process.argv[3] ?? 7);
// Falls back to the configured CLIENT_URL, which is what the e-mailed links use.
const clientUrl = process.argv[4] ?? config.clientUrl;
if (!email) {
  console.error("\nusage: npm run issue:link --workspace=server -- <email> [days] [clientUrl]\n");
  process.exit(1);
}

const indexNumber = process.argv[5] ?? null;

const { rows: user } = await pool.query(
  `SELECT id, role FROM users WHERE LOWER(email) = LOWER($1)`, [email]);

if (user.length === 0 && !indexNumber) {
  console.error(
    `\nNo account for ${email}.\n` +
      `Pass an index number as the 4th argument to create a student on first login,\n` +
      `or use \`npm run create:operator\` for staff.\n`
  );
  process.exit(1);
}

const { isAllowedStudentEmail } = await import("../services/authService.js");
if (user.length === 0 && !isAllowedStudentEmail(email)) {
  console.error(
    `\n${email} is not on an accepted student domain ` +
      `(${config.studentEmailDomains.join(", ")}), so redeeming the link would be refused.\n` +
      `Add the domain to STUDENT_EMAIL_DOMAINS or use an address that is allowed.\n`
  );
  process.exit(1);
}

const token = newToken();
const { rows } = await pool.query(
  `INSERT INTO login_tokens (token_hash, email, index_number, expires_at)
   VALUES ($1, $2, $3, NOW() + ($4 || ' days')::interval)
   RETURNING expires_at`,
  [hashToken(token), email.toLowerCase(), indexNumber, String(days)]
);
console.log(`${clientUrl.replace(/\/$/, "")}/prijava/potvrda?token=${encodeURIComponent(token)}`);
console.error(
  `  (${user.length ? user[0].role : "new student, broj indeksa " + indexNumber}` +
    `, valid until ${rows[0].expires_at.toISOString()})`
);
// Easy to burn by accident: opening it to "check it works" is exactly what consumes it.
console.error(
  "  WARNING: single-use. Do not open it yourself — the first click consumes it and the\n" +
    "  recipient will be told the link was already used. Re-run this command for a new one."
);
await pool.end();
