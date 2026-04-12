# Brevo (Sendinblue) SMTP with this app

The server uses **Nodemailer** with standard SMTP environment variables. Brevo works as the SMTP provider.

## 1. Get SMTP credentials in Brevo

1. Log in at [https://app.brevo.com](https://app.brevo.com).
2. Go to **SMTP & API** → **SMTP** (or **Settings** → **SMTP & API** → **SMTP**), or open:
  [https://app.brevo.com/settings/keys/smtp](https://app.brevo.com/settings/keys/smtp)
3. Note:
  - **SMTP server:** `smtp-relay.brevo.com`
  - **Port:** `587` (recommended) or `465` / `2525` if your network blocks 587
4. Create or copy your **SMTP key** (a long secret — **not** your Brevo login password, and not the Marketing/Transactional **API** key unless Brevo shows the same for SMTP).
5. **Login:** Brevo often shows your **account email** as the SMTP username — use exactly what the SMTP page displays.

## 2. Verify a sender

Brevo only sends from **verified** addresses or domains.

1. Go to **Senders & IP** → **Domains** (or **Senders**) and add/verify the email or domain you will use in `SMTP_FROM`.
2. Until a sender is verified, mail may fail or be blocked.

## 3. Configure `.env` in this project

Copy `[.env.example](../.env.example)` to `.env` at the **repo root** (or `server/.env` — the server loads both). Example:

```env
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=your-login-email-shown-in-brevo-smtp-page
SMTP_PASS=your-smtp-key-from-brevo
SMTP_FROM="Photocopy Orders <orders@your-verified-domain.com>"
```

- `**SMTP_FROM**` must match a **verified sender** in Brevo (name + email can be quoted as above).
- If you omit `SMTP_FROM`, the app falls back to `SMTP_USER` — that must also be a permitted sender.

## 4. Admin notification address

```env
ADMIN_EMAIL=savolekovic15@gmail.com
```

Use your real inbox; Brevo will deliver there if your account is in good standing.

## 5. Restart the API

After changing `.env`:

```bash
npm run dev
```

(or restart only the server process.)

## 6. Test

1. Place an order through the app.
2. Check Brevo **Statistics** / **Logs** if delivery fails.
3. Check **spam** for the admin and customer messages.

## Port 465 (SSL)

If you use **465**, set `SMTP_PORT=465`. The app sets Nodemailer `secure: true` for port 465. For **587**, leave `SMTP_PORT=587` (STARTTLS).

## Troubleshooting


| Issue                 | What to check                                                     |
| --------------------- | ----------------------------------------------------------------- |
| Authentication failed | SMTP key is wrong or expired — regenerate in Brevo SMTP settings. |
| Sender rejected       | `SMTP_FROM` / sender not verified in Brevo.                       |
| Connection timeout    | Try port **2525** or **465** if 587 is blocked on your network.   |
| Nothing in inbox      | Spam folder; Brevo log for bounce/reject.                         |


