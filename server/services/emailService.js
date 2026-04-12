import nodemailer from "nodemailer";

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
    // Optional: set SMTP_REQUIRE_TLS=true if your provider needs it (Brevo usually works without)
    ...(process.env.SMTP_REQUIRE_TLS === "true" && port === 587
      ? { requireTLS: true }
      : {}),
  });
}

export async function sendOrderEmails({
  faculty,
  year,
  literatureName,
  price,
  email,
  phone,
}) {
  const transport = createTransport();
  const rawFrom = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER;
  const from = rawFrom;
  const adminTo = process.env.ADMIN_EMAIL || "savolekovic15@gmail.com";

  if (from) {
    console.log("[email] Envelope From:", from);
  }

  const adminText = [
    "New photocopy order",
    "",
    `Faculty: ${faculty}`,
    `Year: ${year}`,
    `Literature: ${literatureName}`,
    `Price: ${Number(price).toFixed(2)}`,
    `User email: ${email}`,
    `Phone: ${phone || "(not provided)"}`,
  ].join("\n");

  const userText = [
    "Thank you for your order.",
    "",
    "Order summary:",
    `- Faculty: ${faculty}`,
    `- Year: ${year}`,
    `- Literature: ${literatureName}`,
    `- Total: ${Number(price).toFixed(2)}`,
    "",
    "We will process your request shortly.",
  ].join("\n");

  if (!transport || !from) {
    console.warn(
      "[email] SMTP not configured; skipping email send. Set SMTP_HOST, SMTP_USER, SMTP_PASS."
    );
    return { sent: false, reason: "smtp_not_configured" };
  }

  try {
    const adminResult = await transport.sendMail({
      from,
      to: adminTo,
      subject: "New Photocopy Order",
      text: adminText,
    });
    console.log("[email] Admin notification sent", adminResult.messageId);

    const userResult = await transport.sendMail({
      from,
      to: email,
      subject: "Order Confirmation",
      text: userText,
    });
    console.log("[email] User confirmation sent", userResult.messageId);

    return { sent: true };
  } catch (err) {
    const detail =
      err.response ||
      err.message ||
      (err.code ? `code ${err.code}` : String(err));
    console.error("[email] SMTP send failed:", detail);
    throw err;
  }
}
