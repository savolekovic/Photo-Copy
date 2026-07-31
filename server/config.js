/**
 * Central runtime configuration. Every value the client asked to be "definisano"
 * (accepted e-mail domains, pickup deadline, reminder cadence) is overridable via
 * environment variables so the policy can change without a code edit.
 */

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isNaN(n) || n <= 0 ? fallback : n;
}

function boolFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "true" || raw === "1";
}

/**
 * Domains a student may register from. Subdomains are accepted too, because faculties
 * at Univerzitet Crne Gore issue addresses like ime@pf.ucg.ac.me alongside @ucg.ac.me.
 */
export const STUDENT_EMAIL_DOMAINS = (
  process.env.STUDENT_EMAIL_DOMAINS || "ucg.ac.me"
)
  .split(",")
  .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
  .filter(Boolean);

export const config = {
  /** Absolute origin the magic link should point at. */
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",

  studentEmailDomains: STUDENT_EMAIL_DOMAINS,
  /** When true, ime@pf.ucg.ac.me is accepted for the domain ucg.ac.me. */
  allowEmailSubdomains: boolFromEnv("STUDENT_EMAIL_ALLOW_SUBDOMAINS", true),

  /** Magic-link validity. Short by design — the link is a bearer credential. */
  magicLinkTtlMinutes: intFromEnv("MAGIC_LINK_TTL_MINUTES", 15),
  /** How many links one address may request inside the window below. */
  magicLinkMaxPerWindow: intFromEnv("MAGIC_LINK_MAX_PER_WINDOW", 5),
  magicLinkWindowMinutes: intFromEnv("MAGIC_LINK_WINDOW_MINUTES", 15),

  /** Session lifetime. Long, because there is no password to re-enter. */
  sessionTtlDays: intFromEnv("SESSION_TTL_DAYS", 30),
  sessionCookieName: process.env.SESSION_COOKIE_NAME || "photocopy_sid",
  /** Secure cookies require HTTPS; off by default so local http://localhost works. */
  cookieSecure: boolFromEnv("COOKIE_SECURE", process.env.NODE_ENV === "production"),

  /** Days after an order is marked `spremno` before it expires unclaimed. */
  pickupDeadlineDays: intFromEnv("PICKUP_DEADLINE_DAYS", 7),
  /** Minimum gap between pickup reminders. */
  reminderIntervalHours: intFromEnv("REMINDER_INTERVAL_HOURS", 24),

  /**
   * Whether a student must supply a broj indeksa on first login.
   * Kept as a flag because the client has not finally confirmed which student
   * details the operator needs at the counter.
   */
  requireIndexNumber: boolFromEnv("REQUIRE_INDEX_NUMBER", true),

  defaultLocale: process.env.DEFAULT_LOCALE || "sr-ME",
};
