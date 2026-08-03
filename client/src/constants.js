/**
 * Faculties and study years are no longer listed here: they are administrable data served
 * by the API. Anything that needs them fetches them.
 */

/** Mirrors server/lib/statuses.js — keep the two in step. */
export const ORDER_STATUSES = [
  "nova",
  "u_pripremi",
  "spremno",
  "preuzeto",
  "otkazano",
];

/** Mirrors the materials_type_check constraint in migrations/004. */
export const MATERIAL_TYPES = ["knjiga", "skripta", "ostali_materijal"];

/**
 * Shown in the sign-in hint only. The server holds the authoritative list
 * (STUDENT_EMAIL_DOMAINS) and is what actually enforces the restriction.
 */
export const STUDENT_EMAIL_DOMAINS =
  import.meta.env.VITE_STUDENT_EMAIL_DOMAINS || "udg.edu.me";

/** Where each role lands after signing in. */
export const HOME_BY_ROLE = {
  student: "/",
  operator: "/narudzbine",
};
