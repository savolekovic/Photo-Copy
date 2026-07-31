import { body, validationResult } from "express-validator";
import { config } from "../config.js";
import { LOCALES } from "../lib/i18n.js";
import { sessionCookieOptions } from "../middleware/authMiddleware.js";
import { pool } from "../db/pool.js";
import {
  AuthError,
  consumeMagicLink,
  createSession,
  destroySession,
  issueMagicLink,
} from "../services/authService.js";
import { sendMagicLinkEmail } from "../services/emailService.js";

/** AuthError.code -> HTTP status. The code itself is returned so the client can translate. */
const STATUS_BY_CODE = {
  invalid_email: 400,
  domain_not_allowed: 400,
  index_number_required: 400,
  invalid_token: 400,
  account_disabled: 403,
  rate_limited: 429,
};

function sendAuthError(res, err) {
  return res
    .status(STATUS_BY_CODE[err.code] ?? 400)
    .json({ error: err.message, code: err.code });
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    indexNumber: user.indexNumber,
    locale: user.locale,
  };
}

export const requestLinkValidators = [
  body("email").isString().trim().isLength({ min: 3, max: 254 }),
  body("indexNumber")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 40 })
    .withMessage("Broj indeksa is too long"),
];

/**
 * POST /api/auth/request-link
 * Issues a one-time login link and e-mails it. Also the registration entry point:
 * a first-time address on an approved university domain creates the account on click.
 */
export async function requestLink(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, indexNumber } = req.body;
    const { token, expiresAt, user } = await issueMagicLink({
      email,
      indexNumber,
      ip: req.ip,
    });

    const url = `${config.clientUrl.replace(/\/$/, "")}/prijava/potvrda?token=${encodeURIComponent(token)}`;

    let emailSent = false;
    let emailError = null;
    try {
      const result = await sendMagicLinkEmail({
        to: email,
        url,
        locale: user?.locale ?? config.defaultLocale,
      });
      emailSent = result.sent === true;
      if (!emailSent) {
        // Printed to the server console only, never returned in the response body:
        // an endpoint that hands back login links would be an account-takeover hole.
        console.log(`[auth] SMTP unavailable. Login link for ${email}:\n  ${url}`);
      }
    } catch (mailErr) {
      console.error("[auth] Failed to send login link:", mailErr.message);
      console.log(`[auth] Login link for ${email}:\n  ${url}`);
      emailError = "delivery_failed";
    }

    return res.status(202).json({
      ok: true,
      emailSent,
      expiresAt,
      ...(emailError ? { emailError } : {}),
    });
  } catch (err) {
    if (err instanceof AuthError) return sendAuthError(res, err);
    return next(err);
  }
}

export const verifyValidators = [
  body("token").isString().trim().isLength({ min: 10, max: 400 }),
];

/**
 * POST /api/auth/verify
 * Redeems the token from the e-mailed link and starts a session.
 *
 * This is a POST driven by the client page rather than a GET on the link itself, because
 * mail clients and link scanners routinely pre-fetch URLs — a GET would let a scanner burn
 * the single-use token before the student ever clicked it.
 */
export async function verifyLink(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const user = await consumeMagicLink(req.body.token);
    const sessionToken = await createSession(user.id, req.get("user-agent"));

    res.cookie(
      config.sessionCookieName,
      sessionToken,
      sessionCookieOptions(config.sessionTtlDays * 24 * 60 * 60 * 1000)
    );

    return res.json({ user: publicUser(user) });
  } catch (err) {
    if (err instanceof AuthError) return sendAuthError(res, err);
    return next(err);
  }
}

/** POST /api/auth/logout — destroys the server-side session, then clears the cookie. */
export async function logout(req, res, next) {
  try {
    await destroySession(req.sessionToken);
    res.clearCookie(config.sessionCookieName, sessionCookieOptions());
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

/** GET /api/auth/me — current account, or `null` when anonymous (not a 401). */
export async function me(req, res) {
  return res.json({ user: req.user ? publicUser(req.user) : null });
}

export const updateMeValidators = [
  body("locale").optional({ values: "falsy" }).isIn(LOCALES),
];

/**
 * PATCH /api/auth/me — persists the language preference so e-mails match the language
 * the student actually uses in the app.
 */
export async function updateMe(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { locale } = req.body;
    if (!locale) {
      return res.json({ user: publicUser(req.user) });
    }

    const { rows } = await pool.query(
      `UPDATE users SET locale = $1 WHERE id = $2
       RETURNING id, email, role, index_number, locale`,
      [locale, req.user.id]
    );
    const r = rows[0];
    return res.json({
      user: {
        id: r.id,
        email: r.email,
        role: r.role,
        indexNumber: r.index_number,
        locale: r.locale,
      },
    });
  } catch (err) {
    return next(err);
  }
}
