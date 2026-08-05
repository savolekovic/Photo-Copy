/**
 * Issue a login link for an existing account and print it, instead of e-mailing it.
 *
 *   npm run issue:link --workspace=server -- <email> [days] [clientUrl]
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

const { rows: user } = await pool.query(
  `SELECT id, role FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
if (user.length === 0) {
  console.error(`No account for ${email} — create it first.`);
  process.exit(1);
}

const token = newToken();
const { rows } = await pool.query(
  `INSERT INTO login_tokens (token_hash, email, expires_at)
   VALUES ($1, $2, NOW() + ($3 || ' days')::interval)
   RETURNING expires_at`,
  [hashToken(token), email.toLowerCase(), String(days)]
);
console.log(`${clientUrl.replace(/\/$/, "")}/prijava/potvrda?token=${encodeURIComponent(token)}`);
console.error(`  (${user[0].role}, valid until ${rows[0].expires_at.toISOString()})`);
await pool.end();
