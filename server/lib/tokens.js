import crypto from "crypto";

/**
 * Bearer credentials (magic links, session cookies) are generated here and stored
 * only as SHA-256 digests. A leaked database therefore cannot be replayed into a
 * login, and lookups stay a single indexed equality check.
 */

/** 32 bytes of CSPRNG output, URL-safe so it can sit in a query string unescaped. */
export function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

/**
 * Constant-time comparison of two hex digests. Used where a value is compared in
 * application code rather than by the database.
 */
export function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), "hex");
  const bufB = Buffer.from(String(b), "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
