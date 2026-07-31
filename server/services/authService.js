import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { hashToken, newToken } from "../lib/tokens.js";

/**
 * Passwordless authentication. Requesting a link and logging in are the same flow:
 * possession of an inbox at an approved university domain *is* the credential, which is
 * exactly the rule the spec states ("prijavljuje se koristeći isključivo službenu
 * univerzitetsku e-mail adresu").
 */

/** Carries a stable `code` so controllers can map to a status and a translation key. */
export class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AuthError";
    this.code = code;
  }
}

export function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * True when the address sits on an approved domain, or on a subdomain of one when
 * subdomains are enabled (faculty addresses such as ime@pf.ucg.ac.me).
 */
export function isAllowedStudentEmail(email) {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at === -1 || at === normalized.length - 1) return false;
  const domain = normalized.slice(at + 1);

  return config.studentEmailDomains.some((allowed) =>
    config.allowEmailSubdomains
      ? domain === allowed || domain.endsWith(`.${allowed}`)
      : domain === allowed
  );
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    indexNumber: row.index_number,
    locale: row.locale,
    isActive: row.is_active,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export async function findUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, email, role, index_number, locale, is_active, created_at, last_login_at
       FROM users WHERE LOWER(email) = $1`,
    [normalizeEmail(email)]
  );
  return mapUser(rows[0]);
}

export async function findUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, email, role, index_number, locale, is_active, created_at, last_login_at
       FROM users WHERE id = $1`,
    [id]
  );
  return mapUser(rows[0]);
}

/**
 * Issue a single-use login link.
 *
 * Domain enforcement applies only when the account does not exist yet: an operator
 * account created by the bootstrap script may legitimately live on any domain, but a
 * brand-new self-service signup must come from the university.
 *
 * @returns {Promise<{token: string, expiresAt: Date, user: object|null}>} raw token —
 *   the caller e-mails it and must not persist it.
 */
export async function issueMagicLink({ email, indexNumber, ip }) {
  const normalized = normalizeEmail(email);
  if (!normalized || !normalized.includes("@")) {
    throw new AuthError("invalid_email", "A valid e-mail address is required.");
  }

  const existing = await findUserByEmail(normalized);

  if (!existing && !isAllowedStudentEmail(normalized)) {
    throw new AuthError(
      "domain_not_allowed",
      `Registration is restricted to ${config.studentEmailDomains.join(", ")} addresses.`
    );
  }
  if (existing && !existing.isActive) {
    throw new AuthError("account_disabled", "This account has been deactivated.");
  }

  const trimmedIndex = String(indexNumber ?? "").trim() || null;
  if (!existing && config.requireIndexNumber && !trimmedIndex) {
    throw new AuthError("index_number_required", "Broj indeksa is required to register.");
  }

  // Rate limit per address so the endpoint cannot be used to flood a student's inbox.
  const { rows: recent } = await pool.query(
    `SELECT COUNT(*)::int AS c
       FROM login_tokens
      WHERE LOWER(email) = $1
        AND created_at > NOW() - ($2 || ' minutes')::interval`,
    [normalized, String(config.magicLinkWindowMinutes)]
  );
  if ((recent[0]?.c ?? 0) >= config.magicLinkMaxPerWindow) {
    throw new AuthError(
      "rate_limited",
      "Too many login links requested. Please wait a few minutes and try again."
    );
  }

  const token = newToken();
  const { rows } = await pool.query(
    `INSERT INTO login_tokens (token_hash, email, index_number, expires_at, request_ip)
     VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::interval, $5)
     RETURNING expires_at`,
    [
      hashToken(token),
      normalized,
      trimmedIndex,
      String(config.magicLinkTtlMinutes),
      ip ?? null,
    ]
  );

  return { token, expiresAt: rows[0].expires_at, user: existing };
}

/**
 * Redeem a login link and return the account it belongs to, creating a student account
 * on first use. The token is burned atomically, so a link cannot be replayed even if two
 * requests arrive at once.
 */
export async function consumeMagicLink(rawToken) {
  if (!rawToken) throw new AuthError("invalid_token", "Login link is missing.");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Single conditional UPDATE: whoever flips consumed_at first owns the token.
    const { rows: tokenRows } = await client.query(
      `UPDATE login_tokens
          SET consumed_at = NOW()
        WHERE token_hash = $1
          AND consumed_at IS NULL
          AND expires_at > NOW()
        RETURNING email, index_number`,
      [hashToken(rawToken)]
    );
    if (tokenRows.length === 0) {
      await client.query("ROLLBACK");
      throw new AuthError(
        "invalid_token",
        "This login link is invalid, already used, or expired."
      );
    }

    const email = normalizeEmail(tokenRows[0].email);
    const tokenIndex = tokenRows[0].index_number;

    const { rows: found } = await client.query(
      `SELECT id, email, role, index_number, locale, is_active, created_at, last_login_at
         FROM users WHERE LOWER(email) = $1 FOR UPDATE`,
      [email]
    );

    let user = mapUser(found[0]);

    if (!user) {
      // First login doubles as registration. Guard the domain again here: the policy
      // could have changed between the link being sent and it being clicked.
      if (!isAllowedStudentEmail(email)) {
        await client.query("ROLLBACK");
        throw new AuthError(
          "domain_not_allowed",
          "Registration is restricted to university addresses."
        );
      }
      const { rows: created } = await client.query(
        `INSERT INTO users (email, role, index_number, locale, last_login_at)
         VALUES ($1, 'student', $2, $3, NOW())
         RETURNING id, email, role, index_number, locale, is_active, created_at, last_login_at`,
        [email, tokenIndex, config.defaultLocale]
      );
      user = mapUser(created[0]);
    } else {
      if (!user.isActive) {
        await client.query("ROLLBACK");
        throw new AuthError("account_disabled", "This account has been deactivated.");
      }
      // Backfill an index number supplied on a later request if the account lacks one.
      const { rows: updated } = await client.query(
        `UPDATE users
            SET last_login_at = NOW(),
                index_number = COALESCE(index_number, $2)
          WHERE id = $1
        RETURNING id, email, role, index_number, locale, is_active, created_at, last_login_at`,
        [user.id, tokenIndex]
      );
      user = mapUser(updated[0]);
    }

    await client.query("COMMIT");
    return user;
  } catch (err) {
    // ROLLBACK already issued on the handled paths above; this covers unexpected errors.
    if (!(err instanceof AuthError)) {
      await client.query("ROLLBACK").catch(() => {});
    }
    throw err;
  } finally {
    client.release();
  }
}

/** @returns {Promise<string>} raw session token to be set as an httpOnly cookie. */
export async function createSession(userId, userAgent) {
  const token = newToken();
  await pool.query(
    `INSERT INTO sessions (id, user_id, expires_at, user_agent)
     VALUES ($1, $2, NOW() + ($3 || ' days')::interval, $4)`,
    [
      hashToken(token),
      userId,
      String(config.sessionTtlDays),
      (userAgent ?? "").slice(0, 400) || null,
    ]
  );
  return token;
}

/** Resolve a cookie value to its account, or null when absent/expired/disabled. */
export async function getSessionUser(rawToken) {
  if (!rawToken) return null;
  const { rows } = await pool.query(
    `UPDATE sessions
        SET last_seen_at = NOW()
      WHERE id = $1 AND expires_at > NOW()
      RETURNING user_id`,
    [hashToken(rawToken)]
  );
  if (rows.length === 0) return null;

  const user = await findUserById(rows[0].user_id);
  if (!user || !user.isActive) return null;
  return user;
}

export async function destroySession(rawToken) {
  if (!rawToken) return;
  await pool.query(`DELETE FROM sessions WHERE id = $1`, [hashToken(rawToken)]);
}

/** Housekeeping for expired sessions and login tokens. Safe to call at any time. */
export async function purgeExpiredAuthRows() {
  const s = await pool.query(`DELETE FROM sessions WHERE expires_at < NOW()`);
  const t = await pool.query(
    `DELETE FROM login_tokens
      WHERE expires_at < NOW() - INTERVAL '7 days'
         OR consumed_at < NOW() - INTERVAL '7 days'`
  );
  return { sessions: s.rowCount, loginTokens: t.rowCount };
}
