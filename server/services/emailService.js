import nodemailer from "nodemailer";
import { config } from "../config.js";
import { facultyLabel, formatMoney, resolveLocale, t, yearLabel } from "../lib/i18n.js";

/**
 * All outbound mail. Every template shares one document shell so the five message types
 * (login link, order confirmation, admin notification, ready-for-pickup, reminder) stay
 * visually consistent, and every one is localized via the student's stored locale.
 */

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    ...(process.env.SMTP_REQUIRE_TLS === "true" && port === 587
      ? { requireTLS: true }
      : {}),
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(iso, locale) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(resolveLocale(locale), {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return String(iso);
  }
}

/** Single detail row — table-based for email clients */
function detailRow(label, value) {
  const v =
    value === undefined || value === null || value === "" ? "—" : String(value);
  return `<tr>
    <td style="padding:14px 0;border-bottom:1px solid #eef2f6;vertical-align:top;width:38%;">
      <span style="font-size:13px;font-weight:600;color:#64748b;letter-spacing:0.02em;">${escapeHtml(label)}</span>
    </td>
    <td style="padding:14px 0 14px 16px;border-bottom:1px solid #eef2f6;vertical-align:top;">
      <span style="font-size:15px;line-height:1.45;color:#0f172a;">${escapeHtml(v)}</span>
    </td>
  </tr>`;
}

/** Renders the ordered lines as a small table. Quantity is shown only when above one. */
function itemsHtml(items, locale) {
  if (!items || items.length === 0) return "";
  const rows = items
    .map((it) => {
      const qty = it.quantity ?? 1;
      const line = formatMoney(locale, (it.unitPrice ?? 0) * qty);
      const name = qty > 1 ? `${it.title} × ${qty}` : it.title;
      return `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #eef2f6;vertical-align:top;">
          <span style="font-size:14px;line-height:1.45;color:#0f172a;">${escapeHtml(name)}</span>
        </td>
        <td align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid #eef2f6;vertical-align:top;white-space:nowrap;">
          <span style="font-size:14px;color:#0f172a;">${escapeHtml(line)}</span>
        </td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px;">${rows}</table>`;
}

function orderSummaryHtml({
  when,
  faculty,
  year,
  items,
  price,
  email,
  phone,
  locale,
}) {
  const priceStr = formatMoney(locale, price);
  const phoneDisplay =
    phone && String(phone).trim() ? String(phone) : t(locale, "label.notProvided");

  const rows =
    detailRow(t(locale, "label.placed"), when) +
    detailRow(t(locale, "label.faculty"), facultyLabel(locale, faculty)) +
    detailRow(t(locale, "label.year"), yearLabel(locale, year)) +
    detailRow(t(locale, "label.email"), email) +
    detailRow(t(locale, "label.phone"), phoneDisplay);

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px;">
    ${rows}
  </table>
  <p style="margin:14px 0 4px;font-size:13px;font-weight:600;color:#64748b;letter-spacing:0.02em;">${escapeHtml(t(locale, "label.items"))}</p>
  ${itemsHtml(items, locale)}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
    <tr>
      <td style="padding:18px 20px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="font-size:13px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;">${escapeHtml(t(locale, "label.total"))}</td>
            <td align="right" style="font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.02em;">${escapeHtml(priceStr)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>`;
}

/** Big call-to-action button, used by the login link mail. */
function buttonHtml(label, url, accentColor) {
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:4px 0 18px;">
    <tr>
      <td align="center" style="border-radius:12px;background:${accentColor};">
        <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:12px;">${escapeHtml(label)}</a>
      </td>
    </tr>
  </table>`;
}

function noticeHtml(text) {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fffbeb;border:1px solid #fde68a;border-radius:10px;margin:0 0 18px;">
    <tr>
      <td style="padding:14px 18px;font-size:14px;line-height:1.5;color:#78350f;">${escapeHtml(text)}</td>
    </tr>
  </table>`;
}

function buildEmailDocument({
  preheader,
  accentColor,
  badgeText,
  title,
  intro,
  summaryInner,
  footerNote,
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#e8edf3;-webkit-font-smoothing:antialiased;">
  <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#e8edf3;">
    <tr>
      <td align="center" style="padding:36px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;border-collapse:collapse;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);border:1px solid #e2e8f0;">
          <tr>
            <td style="height:5px;background:${accentColor};line-height:5px;font-size:0;">&nbsp;</td>
          </tr>
          <tr>
            <td style="padding:28px 32px 8px;">
              <span style="display:inline-block;padding:6px 12px;background:#f1f5f9;border-radius:999px;font-size:13px;font-weight:600;color:#475569;letter-spacing:0.02em;">${escapeHtml(badgeText)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 32px 8px;">
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#0f172a;letter-spacing:-0.03em;line-height:1.25;">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 22px;">
              <p style="margin:0;font-size:15px;line-height:1.55;color:#64748b;">${escapeHtml(intro)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              ${summaryInner}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 26px;background:#fafbfc;border-top:1px solid #eef2f6;">
              <p style="margin:0;font-size:12px;line-height:1.5;color:#94a3b8;text-align:center;">${escapeHtml(footerNote)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const ACCENT = {
  neutral: "#0f172a",
  success: "#047857",
  warning: "#b45309",
  info: "#1d4ed8",
};

function resolveFrom() {
  return process.env.SMTP_FROM?.trim() || process.env.SMTP_USER;
}

function adminRecipient() {
  return process.env.ADMIN_EMAIL || null;
}

/**
 * Single send path for every template.
 * @returns {Promise<{sent: boolean, reason?: string}>} Never throws for a missing SMTP
 *   configuration — callers treat undelivered mail as non-fatal, because losing an e-mail
 *   must not lose the order or the status change that triggered it.
 */
async function deliver({ to, subject, text, html, label }) {
  const transport = createTransport();
  const from = resolveFrom();

  if (!transport || !from) {
    console.warn(
      `[email] SMTP not configured; skipped "${label}" to ${to}. Set SMTP_HOST, SMTP_USER, SMTP_PASS.`
    );
    return { sent: false, reason: "smtp_not_configured" };
  }
  if (!to) {
    console.warn(`[email] No recipient for "${label}"; skipped.`);
    return { sent: false, reason: "no_recipient" };
  }

  const result = await transport.sendMail({ from, to, subject, text, html });

  // A 250 from the relay only means it accepted the handover. Check the per-recipient
  // outcome too: a message can be accepted at the SMTP level and still have every
  // recipient rejected, which previously logged as an unqualified success.
  const accepted = result.accepted ?? [];
  const rejected = result.rejected ?? [];

  if (rejected.length > 0) {
    console.warn(
      `[email] ${label}: relay rejected ${rejected.join(", ")} — ${result.response ?? "no response"}`
    );
  }
  if (accepted.length === 0) {
    console.error(`[email] ${label} to ${to} was accepted by nobody; treating as unsent.`);
    return { sent: false, reason: "all_recipients_rejected" };
  }

  console.log(
    `[email] ${label} accepted for ${accepted.join(", ")} — ${result.response ?? result.messageId}`
  );
  return { sent: true };
}

/* ------------------------------------------------------------------ auth ---- */

/**
 * Login link. Deliberately contains no order or personal detail beyond the address
 * itself, since an e-mail may sit in an unattended inbox.
 */
export async function sendMagicLinkEmail({ to, url, locale }) {
  const minutes = config.magicLinkTtlMinutes;
  const intro = t(locale, "magicLink.intro", { minutes });

  const inner =
    buttonHtml(t(locale, "magicLink.button"), url, ACCENT.neutral) +
    `<p style="margin:0;font-size:13px;line-height:1.5;color:#94a3b8;">${escapeHtml(
      t(locale, "magicLink.fallback")
    )}</p>
     <p style="margin:6px 0 0;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${escapeHtml(
       url
     )}" style="color:#1d4ed8;">${escapeHtml(url)}</a></p>`;

  const text = [
    t(locale, "magicLink.title"),
    "",
    intro,
    "",
    url,
    "",
    t(locale, "magicLink.footer"),
  ].join("\n");

  return deliver({
    to,
    subject: t(locale, "magicLink.subject"),
    text,
    html: buildEmailDocument({
      preheader: t(locale, "magicLink.subject"),
      accentColor: ACCENT.neutral,
      badgeText: t(locale, "magicLink.badge"),
      title: t(locale, "magicLink.title"),
      intro,
      summaryInner: inner,
      footerNote: t(locale, "magicLink.footer"),
    }),
    label: "Login link",
  });
}

/* ----------------------------------------------------------------- orders ---- */

function summaryTextLines(locale, { when, faculty, year, items, price }) {
  const lines = (items ?? []).map((it) => {
    const qty = it.quantity ?? 1;
    const money = formatMoney(locale, (it.unitPrice ?? 0) * qty);
    return `  - ${it.title}${qty > 1 ? ` x ${qty}` : ""}  ${money}`;
  });
  return [
    `${t(locale, "label.placed")}: ${when}`,
    `${t(locale, "label.faculty")}: ${facultyLabel(locale, faculty)}`,
    `${t(locale, "label.year")}: ${yearLabel(locale, year)}`,
    `${t(locale, "label.items")}:`,
    ...lines,
    `${t(locale, "label.total")}: ${formatMoney(locale, price)}`,
  ];
}

/**
 * Order confirmation to the student plus the operator notification.
 * Reported per-recipient so a failure to reach the operator never hides a successful
 * student confirmation (and vice versa).
 */
export async function sendOrderConfirmationEmails({
  orderId,
  createdAt,
  faculty,
  year,
  items,
  price,
  email,
  phone,
  locale,
}) {
  const studentLocale = resolveLocale(locale);
  const when = formatWhen(createdAt, studentLocale);
  const summary = { when, faculty, year, items, price, email, phone };

  const studentHtml = buildEmailDocument({
    preheader: t(studentLocale, "confirm.subject", { id: orderId }),
    accentColor: ACCENT.success,
    badgeText: t(studentLocale, "confirm.badge", { id: orderId }),
    title: t(studentLocale, "confirm.title"),
    intro: t(studentLocale, "confirm.intro"),
    summaryInner: orderSummaryHtml({ ...summary, locale: studentLocale }),
    footerNote: t(studentLocale, "confirm.footer"),
  });

  const studentResult = await deliver({
    to: email,
    subject: t(studentLocale, "confirm.subject", { id: orderId }),
    text: [
      t(studentLocale, "confirm.title"),
      "",
      t(studentLocale, "confirm.intro"),
      "",
      ...summaryTextLines(studentLocale, summary),
    ].join("\n"),
    html: studentHtml,
    label: "Order confirmation",
  });

  // The operator notification always uses the default locale: it goes to staff, not to
  // the student whose preference we stored.
  const adminLocale = config.defaultLocale;
  const adminTo = adminRecipient();
  let adminResult = { sent: false, reason: "no_recipient" };
  if (adminTo) {
    adminResult = await deliver({
      to: adminTo,
      subject: t(adminLocale, "admin.subject", { id: orderId }),
      text: [
        t(adminLocale, "admin.title"),
        "",
        ...summaryTextLines(adminLocale, summary),
        `${t(adminLocale, "label.email")}: ${email}`,
        `${t(adminLocale, "label.phone")}: ${phone || t(adminLocale, "label.notProvided")}`,
      ].join("\n"),
      html: buildEmailDocument({
        preheader: t(adminLocale, "admin.subject", { id: orderId }),
        accentColor: ACCENT.neutral,
        badgeText: t(adminLocale, "admin.badge", { id: orderId }),
        title: t(adminLocale, "admin.title"),
        intro: t(adminLocale, "admin.intro"),
        summaryInner: orderSummaryHtml({ ...summary, locale: adminLocale }),
        footerNote: t(adminLocale, "admin.footer"),
      }),
      label: "Admin notification",
    });
  }

  return { sent: studentResult.sent, student: studentResult, admin: adminResult };
}

/**
 * Sent the moment an operator marks an order `spremno` — the automatic notification the
 * spec requires ("obavještenje kada je materijal spreman za preuzimanje").
 */
export async function sendOrderReadyEmail({
  orderId,
  createdAt,
  faculty,
  year,
  items,
  price,
  email,
  phone,
  pickupDeadline,
  locale,
}) {
  const loc = resolveLocale(locale);
  const when = formatWhen(createdAt, loc);
  const deadlineStr = pickupDeadline ? formatWhen(pickupDeadline, loc) : null;
  const deadlineLine = deadlineStr
    ? t(loc, "ready.deadline", { date: deadlineStr })
    : null;

  const inner =
    (deadlineLine ? noticeHtml(deadlineLine) : "") +
    orderSummaryHtml({
      when,
      faculty,
      year,
      items,
      price,
      email,
      phone,
      locale: loc,
    });

  return deliver({
    to: email,
    subject: t(loc, "ready.subject", { id: orderId }),
    text: [
      t(loc, "ready.title"),
      "",
      t(loc, "ready.intro"),
      ...(deadlineLine ? ["", deadlineLine] : []),
      "",
      ...summaryTextLines(loc, { when, faculty, year, items, price }),
    ].join("\n"),
    html: buildEmailDocument({
      preheader: t(loc, "ready.subject", { id: orderId }),
      accentColor: ACCENT.success,
      badgeText: t(loc, "ready.badge", { id: orderId }),
      title: t(loc, "ready.title"),
      intro: t(loc, "ready.intro"),
      summaryInner: inner,
      footerNote: t(loc, "ready.footer"),
    }),
    label: "Ready for pickup",
  });
}

/** Recurring nudge while an order sits in `spremno`. */
export async function sendPickupReminderEmail({
  orderId,
  items,
  email,
  pickupDeadline,
  locale,
}) {
  const loc = resolveLocale(locale);
  const deadlineStr = pickupDeadline ? formatWhen(pickupDeadline, loc) : null;
  const deadlineLine = deadlineStr
    ? t(loc, "reminder.deadline", { date: deadlineStr })
    : null;

  const inner =
    (deadlineLine ? noticeHtml(deadlineLine) : "") +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
       ${detailRow(t(loc, "label.order"), `#${orderId}`)}
     </table>
     ${itemsHtml(items, loc)}`;

  return deliver({
    to: email,
    subject: t(loc, "reminder.subject", { id: orderId }),
    text: [
      t(loc, "reminder.title"),
      "",
      t(loc, "reminder.intro"),
      ...(deadlineLine ? ["", deadlineLine] : []),
      "",
      ...(items ?? []).map((it) => `  - ${it.title}`),
    ].join("\n"),
    html: buildEmailDocument({
      preheader: t(loc, "reminder.subject", { id: orderId }),
      accentColor: ACCENT.warning,
      badgeText: t(loc, "reminder.badge", { id: orderId }),
      title: t(loc, "reminder.title"),
      intro: t(loc, "reminder.intro"),
      summaryInner: inner,
      footerNote: t(loc, "reminder.footer"),
    }),
    label: "Pickup reminder",
  });
}

/** Final message when the pickup deadline lapses without collection. */
export async function sendPickupExpiredEmail({
  orderId,
  items,
  email,
  locale,
}) {
  const loc = resolveLocale(locale);
  const inner = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
       ${detailRow(t(loc, "label.order"), `#${orderId}`)}
     </table>
     ${itemsHtml(items, loc)}`;

  return deliver({
    to: email,
    subject: t(loc, "expired.subject", { id: orderId }),
    text: [t(loc, "expired.title"), "", t(loc, "expired.intro")].join("\n"),
    html: buildEmailDocument({
      preheader: t(loc, "expired.subject", { id: orderId }),
      accentColor: ACCENT.warning,
      badgeText: t(loc, "expired.badge", { id: orderId }),
      title: t(loc, "expired.title"),
      intro: t(loc, "expired.intro"),
      summaryInner: inner,
      footerNote: t(loc, "expired.footer"),
    }),
    label: "Pickup expired",
  });
}
