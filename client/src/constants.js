export const FACULTIES = [
  "Law",
  "Economics",
  "Engineering",
  "Medicine",
  "Arts",
  "Sciences",
];

export const YEARS = ["1st", "2nd", "3rd", "4th", "Master"];

/** Mirrors server/lib/statuses.js — keep the two in step. */
export const ORDER_STATUSES = [
  "nova",
  "u_pripremi",
  "spremno",
  "preuzeto",
  "otkazano",
];

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
