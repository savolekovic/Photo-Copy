# Photocopy ordering (full-stack MVP)

Monorepo: **React (Vite)** + **Express** + **PostgreSQL**, with **Nodemailer** (SMTP) for admin and customer emails.

Two roles: **students** order literature after signing in with their university e-mail;
**operators** work the queue and move orders through the pickup lifecycle. Interface and
e-mails are available in Montenegrin and English.

## Structure

- `client/` — student ordering flow, student order history, operator dashboard
- `server/` — REST API (`/api/auth`, `/api/literature`, `/api/orders`), DB access, mail
- `server/db/migrations/` — numbered SQL migrations, applied in order by `npm run db:setup`

## Roles and lifecycle

Orders move through: `nova` → `u_pripremi` → `spremno` → `preuzeto`, with `otkazano`
reachable from any non-terminal state. Reaching **`spremno` automatically e-mails the
student**, and every transition is recorded in `order_status_history` with the operator who
made it. There is no hard delete — cancelling is a status change, so the audit trail is
never destroyed.

**Students** sign in with a passwordless magic link, which is what enforces the
"official university address only" rule: registering is impossible without receiving mail
at an approved domain. **Operators** cannot self-register and must be created with
`npm run create:operator` (see Setup step 5).

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ **or** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (recommended if you have nothing installed yet)

**New to Docker?** See the step-by-step guide: **[docs/DOCKER.md](docs/DOCKER.md)** (install on a fresh Mac, what we use it for, daily commands).

### If you are starting from zero

You do **not** need hosted Postgres or SSL for local development. Ignore `PGSSL` in `.env.example` until you deploy to a cloud database.

**Option A — Docker (simplest):** install Docker Desktop, then from the repo root:

```bash
docker compose up -d
```

Wait a few seconds, then use the default `DATABASE_URL` from `.env.example` (already matches the Compose file).

**Option B — Postgres on your Mac:** install with Homebrew (`brew install postgresql@16`), start the service, then create the database:

```bash
createdb photocopy
```

Point `DATABASE_URL` at your user/socket if different from the example.

## Setup

1. **Install dependencies** (from repo root):
  ```bash
   npm install
  ```
2. **Configure environment**
  ```bash
   cp .env.example .env
  ```
   Keep `DATABASE_URL` as in the example if you used Docker Compose above. Set `STUDENT_EMAIL_DOMAINS` to your university's domain. SMTP is only needed for real e-mail — without it, login links are printed to the server console (see Sign-in below).
3. **Database** — skip this step if you already created `photocopy` via Docker Compose (the empty database is created automatically). For a manual Postgres install, run `createdb photocopy` if needed.
4. **Apply schema and seed literature**
  ```bash
   npm run db:setup
   npm run db:seed
  ```
   `db:setup` applies `schema.sql` and then any unapplied files in `server/db/migrations/`, tracking them in a `schema_migrations` table. It is safe to re-run.
5. **Create the first operator** — operators cannot self-register:
  ```bash
   npm run create:operator --workspace=server -- operater@udg.edu.me
  ```
   Any domain is accepted for an operator; the university-domain restriction applies only to new student self-registrations. Re-running for an existing operator just reactivates them.

## Run

**API + frontend together** (recommended):

```bash
npm run dev
```

- Frontend: [http://localhost:5173](http://localhost:5173) (proxies `/api` to the server)
- API: [http://localhost:3001](http://localhost:3001)

Or run separately:

```bash
npm run dev:server
npm run dev:client
```

### Signing in (including without SMTP)

Go to [http://localhost:5173/prijava](http://localhost:5173/prijava) and enter an e-mail
address. What happens next depends on whether SMTP is configured:

- **With SMTP** — the login link arrives by e-mail. Click it.
- **Without SMTP** — the API prints the link to its own console:
  ```
  [auth] SMTP unavailable. Login link for ime@udg.edu.me:
    http://localhost:5173/prijava/potvrda?token=...
  ```
  Paste that URL into the browser. The link is **never** returned in the HTTP response —
  an endpoint that handed back login links would be an account-takeover hole.

Links are single-use and expire after `MAGIC_LINK_TTL_MINUTES` (default 15).

## Troubleshooting

**Vite: `Failed to resolve import "react-router-dom"`** — From the **repository root**, run `npm install` so workspace dependencies (including `react-router-dom`) are installed. Always start dev from the root with `npm run dev`, or run `npm install` in the root before `npm run dev --workspace=client`.

**Postgres: `column "status" does not exist` during `db:setup`** — This was caused by creating an index on `status` before legacy tables had that column. The index is now applied in `migrations/001_legacy_order_status.sql` after the column exists; re-run `npm run db:setup`.

**"Nemate pristup" / wrong role after signing in** — student and operator see different pages. A student self-registering will always be a `student`; use `npm run create:operator` for staff accounts.

**Login link says invalid or already used** — links are single-use and expire in 15 minutes. Request a new one. Note that clicking a link twice will show this on the second click even though the first succeeded.

## Scripts (root `package.json`)


| Script                | Description                       |
| --------------------- | --------------------------------- |
| `npm run install:all` | Same as `npm install` workspaces  |
| `npm run dev`         | Concurrent API + Vite dev         |
| `npm run dev:server`  | Express only                      |
| `npm run dev:client`  | Vite only                         |
| `npm run db:up`       | Start Postgres via Docker Compose |
| `npm run db:down`     | Stop Compose Postgres             |
| `npm run db:setup`    | Apply `schema.sql` + migrations    |
| `npm run db:seed`     | Seed sample literature            |

Workspace scripts:

| Script                                                | Description                    |
| ----------------------------------------------------- | ------------------------------ |
| `npm run create:operator --workspace=server -- <mail>` | Create/reactivate an operator |

## API

All endpoints authenticate via the `photocopy_sid` httpOnly session cookie; send
`credentials: "include"`. Responses carry a machine-readable `code` alongside `error`.

### Auth

- `POST /api/auth/request-link` — body `{ email, indexNumber? }`. Issues and e-mails a single-use login link. Also the registration path: an unknown address on an approved domain becomes a `student` account when the link is redeemed.
- `POST /api/auth/verify` — body `{ token }`. Redeems the link and sets the session cookie. A POST rather than a GET on the link itself, so mail scanners that pre-fetch URLs cannot burn the token.
- `POST /api/auth/logout` — destroys the session server-side and clears the cookie.
- `GET /api/auth/me` — `{ user }` or `{ user: null }` when anonymous (not a 401).
- `PATCH /api/auth/me` — body `{ locale }` (`sr-ME` | `en`), so e-mails match the chosen interface language.

### Literature

- `GET /api/literature?faculty=...&year=...` — requires any signed-in account.

### Orders

- `POST /api/orders` — **student only**. Body: `faculty`, `year`, `literature_id`, `price`, `phone?`. The recipient address comes from the session, never the request body.
- `GET /api/orders/mine` — **student only**. The signed-in student's own orders; defaults to all statuses.
- `GET /api/orders` — **operator only**. Supports `status` (a concrete status, `active`, or `all`), `faculty`, `year`, `search` (e-mail, literature name or index number), `sort`, `page`, `limit`. Defaults to `active`.
- `GET /api/orders/summary` — **operator only**. Per-status counts plus an `overdue` count.
- `GET /api/orders/:id` — operators read any order, students only their own (returns 404 for someone else's, so IDs cannot be probed). Includes `history`.
- `GET /api/orders/:id/history` — the audit trail alone, same ownership rules.
- `PATCH /api/orders/:id/status` — **operator only**. Body `{ status, note? }`. Rejects illegal transitions with 409 and returns `allowedTransitions`. Moving to `spremno` stamps the pickup deadline and e-mails the student.

There is deliberately **no** `DELETE`; use a transition to `otkazano`.

## Testing before you publish (simplest path)

For a **full** test (UI + API + database + optional email), you only need this on your machine:

1. **Postgres** — `npm run db:up` (Docker) or a local `createdb photocopy`, then `npm run db:setup` and `npm run db:seed`.
2. **Operator** — `npm run create:operator --workspace=server -- operater@udg.edu.me`.
3. **App** — `npm run dev`, then walk both roles:
   - Sign in as a student (any `@udg.edu.me` address; grab the link from the server console if SMTP is off), place an order, and check it appears under **Moje narudžbine** as `Nova`.
   - Sign in as the operator, move that order to `U pripremi` then `Spremno` — the student is e-mailed on `Spremno` — then `Preuzeto`. Open the order's detail modal and confirm every transition is listed under **Istorija statusa** with your operator address against it.
4. **Email** — to see the real messages, set SMTP values in `.env` (e.g. a [Mailtrap](https://mailtrap.io/) inbox for dev). Without SMTP, everything still works; mail is skipped and login links go to the console.

**Production build smoke test** (optional but useful): `npm run build`, then run the API with `npm run dev:server` and either preview the built client (`npm run preview --workspace=client`) with `VITE_API_URL=http://localhost:3001` in `client/.env`, or serve `client/dist` behind your VPS stack the same way you will in production.

**On the VPS**, mirror the same ideas: install Node, run Postgres (Docker or system package), copy `.env` with production `DATABASE_URL`, `CLIENT_URL`, SMTP, run migrations/seed as needed, build the client, and run the server behind Nginx (or Caddy) with HTTPS. You do not need Docker on the VPS if you prefer installing Postgres directly.

## Production notes

- Set `CLIENT_URL` to your deployed frontend origin. It is used for CORS **and** to build magic-link URLs, so a wrong value produces links that go nowhere.
- **Set `COOKIE_SECURE=true`** and serve over HTTPS. The session cookie is the only credential.
- Configure SMTP for real. Without it nobody can log in, because the login link is the credential.
- Set `VITE_API_URL` on the client build to the public API URL if the app is not served behind the same host as `/api`.
- Set `TRUST_PROXY_HOPS` to match your reverse-proxy depth so the magic-link rate limit sees real client IPs.
- Use a transactional email provider SMTP or relay; keep secrets in environment variables only.
- **Brevo SMTP:** step-by-step [docs/BREVO-SMTP.md](docs/BREVO-SMTP.md).

