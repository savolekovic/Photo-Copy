import { config } from "../config.js";
import { getSessionUser } from "../services/authService.js";

/**
 * Session handling. The cookie is read directly from the header rather than pulling in
 * cookie-parser — one small function against zero extra dependency.
 */
function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}

export function getSessionToken(req) {
  return readCookie(req, config.sessionCookieName);
}

/**
 * Resolves the session into `req.user` when one is present, without rejecting anonymous
 * requests. Mounted globally so every handler can read `req.user`.
 */
export async function attachUser(req, _res, next) {
  try {
    req.sessionToken = getSessionToken(req);
    req.user = req.sessionToken ? await getSessionUser(req.sessionToken) : null;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required", code: "unauthenticated" });
  }
  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res
        .status(401)
        .json({ error: "Authentication required", code: "unauthenticated" });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: "Forbidden", code: "wrong_role" });
    }
    return next();
  };
}

export const requireOperator = requireRole("operator");
export const requireStudent = requireRole("student");

/** Cookie attributes shared by login and logout so the two always agree. */
export function sessionCookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    path: "/",
    ...(maxAgeMs === undefined ? {} : { maxAge: maxAgeMs }),
  };
}
