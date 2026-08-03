/**
 * Server-side translations, used for e-mail content and for status labels the API
 * returns. The client keeps its own dictionary; these are the strings the student never
 * sees in the browser, so they must be localized independently.
 *
 * Montenegrin (sr-ME) is the default; English is the fallback for any missing key.
 */

export const LOCALES = ["sr-ME", "en"];
export const DEFAULT_LOCALE = "sr-ME";

const dict = {
  "sr-ME": {
    "status.nova": "Nova",
    "status.u_pripremi": "U pripremi",
    "status.spremno": "Spremno za preuzimanje",
    "status.preuzeto": "Preuzeto",
    "status.otkazano": "Otkazano",

    // PLACEHOLDER faculty names — keys are the database codes. Mirror of the client
    // dictionary in client/src/i18n/messages.js; replace both with the real roster.
    "faculty.Law": "Pravni fakultet",
    "faculty.Economics": "Ekonomski fakultet",
    "faculty.Engineering": "Elektrotehnički fakultet",
    "faculty.Medicine": "Medicinski fakultet",
    "faculty.Arts": "Filozofski fakultet",
    "faculty.Sciences": "Prirodno-matematički fakultet",

    "year.1st": "I godina",
    "year.2nd": "II godina",
    "year.3rd": "III godina",
    "year.4th": "IV godina",
    "year.Master": "Master",

    "label.placed": "Kreirana",
    "label.faculty": "Fakultet",
    "label.year": "Godina studija",
    "label.literature": "Literatura",
    "label.email": "E-mail",
    "label.phone": "Telefon",
    "label.total": "Ukupno",
    "label.status": "Status",
    "label.order": "Narudžbina",
    "label.notProvided": "Nije unesen",
    "label.deadline": "Rok za preuzimanje",
    "label.items": "Poručeni materijali",

    "magicLink.subject": "Link za prijavu — Fotokopirnica",
    "magicLink.badge": "Prijava",
    "magicLink.title": "Prijava na sistem",
    "magicLink.intro":
      "Kliknite na dugme ispod da se prijavite. Link važi {minutes} minuta i može se koristiti samo jednom.",
    "magicLink.button": "Prijavi se",
    "magicLink.fallback":
      "Ako dugme ne radi, kopirajte ovaj link u pregledač:",
    "magicLink.footer":
      "Ako niste zatražili prijavu, ignorišite ovaj e-mail — niko nije pristupio vašem računu.",

    "confirm.subject": "Narudžbina #{id} je evidentirana",
    "confirm.badge": "Narudžbina #{id}",
    "confirm.title": "Hvala na narudžbini",
    "confirm.intro":
      "Vaša narudžbina je uspješno evidentirana. Obavijestićemo vas e-mailom kada materijal bude spreman za preuzimanje.",
    "confirm.footer":
      "Ako niste kreirali ovu narudžbinu, kontaktirajte fotokopirnicu.",

    "admin.subject": "Nova narudžbina #{id}",
    "admin.badge": "Narudžbina #{id}",
    "admin.title": "Nova narudžbina",
    "admin.intro": "Nova narudžbina je pristigla kroz aplikaciju.",
    "admin.footer": "Automatsko obavještenje iz sistema fotokopirnice.",

    "ready.subject": "Narudžbina #{id} je spremna za preuzimanje",
    "ready.badge": "Narudžbina #{id}",
    "ready.title": "Spremno za preuzimanje",
    "ready.intro":
      "Vaš materijal je pripremljen i možete ga preuzeti u fotokopirnici.",
    "ready.deadline": "Rok za preuzimanje je {date}.",
    "ready.footer":
      "Automatsko obavještenje iz sistema fotokopirnice.",

    "reminder.subject": "Podsjetnik: narudžbina #{id} čeka na preuzimanje",
    "reminder.badge": "Podsjetnik · narudžbina #{id}",
    "reminder.title": "Podsjetnik za preuzimanje",
    "reminder.intro":
      "Vaš materijal je još uvijek spreman za preuzimanje u fotokopirnici.",
    "reminder.deadline": "Rok za preuzimanje je {date}.",
    "reminder.footer":
      "Dobijate ovaj podsjetnik jer narudžbina još nije preuzeta. Podsjetnici se prekidaju nakon preuzimanja.",

    "expired.subject": "Narudžbina #{id} — istekao rok za preuzimanje",
    "expired.badge": "Narudžbina #{id}",
    "expired.title": "Istekao rok za preuzimanje",
    "expired.intro":
      "Rok za preuzimanje vaše narudžbine je istekao. Obratite se fotokopirnici ako vam je materijal još potreban.",
    "expired.footer": "Automatsko obavještenje iz sistema fotokopirnice.",
  },

  en: {
    "status.nova": "New",
    "status.u_pripremi": "In preparation",
    "status.spremno": "Ready for pickup",
    "status.preuzeto": "Picked up",
    "status.otkazano": "Cancelled",

    // PLACEHOLDER — see the sr-ME block.
    "faculty.Law": "Faculty of Law",
    "faculty.Economics": "Faculty of Economics",
    "faculty.Engineering": "Faculty of Electrical Engineering",
    "faculty.Medicine": "Faculty of Medicine",
    "faculty.Arts": "Faculty of Philosophy",
    "faculty.Sciences": "Faculty of Natural Sciences",

    "year.1st": "1st year",
    "year.2nd": "2nd year",
    "year.3rd": "3rd year",
    "year.4th": "4th year",
    "year.Master": "Master",

    "label.placed": "Placed",
    "label.faculty": "Faculty",
    "label.year": "Year of study",
    "label.literature": "Literature",
    "label.email": "E-mail",
    "label.phone": "Phone",
    "label.total": "Total",
    "label.status": "Status",
    "label.order": "Order",
    "label.notProvided": "Not provided",
    "label.deadline": "Pickup deadline",
    "label.items": "Ordered materials",

    "magicLink.subject": "Your login link — Photocopy",
    "magicLink.badge": "Sign in",
    "magicLink.title": "Sign in to the system",
    "magicLink.intro":
      "Click the button below to sign in. The link is valid for {minutes} minutes and can be used once.",
    "magicLink.button": "Sign in",
    "magicLink.fallback": "If the button does not work, paste this link into your browser:",
    "magicLink.footer":
      "If you did not request this, you can ignore this e-mail — nobody accessed your account.",

    "confirm.subject": "Order #{id} received",
    "confirm.badge": "Order #{id}",
    "confirm.title": "Thank you for your order",
    "confirm.intro":
      "Your order has been recorded. We will e-mail you as soon as the material is ready for pickup.",
    "confirm.footer": "If you did not place this order, please contact the copy shop.",

    "admin.subject": "New order #{id}",
    "admin.badge": "Order #{id}",
    "admin.title": "New order",
    "admin.intro": "A new order was placed through the app.",
    "admin.footer": "Automatic notification from the photocopy system.",

    "ready.subject": "Order #{id} is ready for pickup",
    "ready.badge": "Order #{id}",
    "ready.title": "Ready for pickup",
    "ready.intro": "Your material has been prepared and can be collected at the copy shop.",
    "ready.deadline": "Please collect it by {date}.",
    "ready.footer": "Automatic notification from the photocopy system.",

    "reminder.subject": "Reminder: order #{id} is waiting for pickup",
    "reminder.badge": "Reminder · order #{id}",
    "reminder.title": "Pickup reminder",
    "reminder.intro": "Your material is still waiting for you at the copy shop.",
    "reminder.deadline": "Please collect it by {date}.",
    "reminder.footer":
      "You are receiving this because the order has not been collected yet. Reminders stop once you pick it up.",

    "expired.subject": "Order #{id} — pickup deadline passed",
    "expired.badge": "Order #{id}",
    "expired.title": "Pickup deadline passed",
    "expired.intro":
      "The pickup deadline for your order has passed. Please contact the copy shop if you still need the material.",
    "expired.footer": "Automatic notification from the photocopy system.",
  },
};

export function resolveLocale(locale) {
  return LOCALES.includes(locale) ? locale : DEFAULT_LOCALE;
}

/**
 * Translate `key`, substituting `{name}` placeholders from `vars`.
 * Falls back to English, then to the key itself, so a missing string is visible
 * rather than rendering as an empty e-mail.
 */
export function t(locale, key, vars = {}) {
  const table = dict[resolveLocale(locale)] ?? dict[DEFAULT_LOCALE];
  const template = table[key] ?? dict.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

export function statusLabel(locale, status) {
  return t(locale, `status.${status}`);
}

/** Faculty/year values are stored as stable codes; these render them for a reader. */
export function facultyLabel(locale, code) {
  return t(locale, `faculty.${code}`);
}

export function yearLabel(locale, code) {
  return t(locale, `year.${code}`);
}

/**
 * Prices are euro. Intl positions the symbol and decimal separator per locale, so
 * sr-ME gives "12,50 €" and en gives "€12.50".
 */
export function formatMoney(locale, value) {
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  try {
    return new Intl.NumberFormat(resolveLocale(locale), {
      style: "currency",
      currency: "EUR",
    }).format(n);
  } catch {
    return `${n.toFixed(2)} €`;
  }
}
