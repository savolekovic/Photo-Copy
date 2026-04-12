# Photocopy ordering (full-stack MVP)

Monorepo: **React (Vite)** + **Express** + **PostgreSQL**, with **Nodemailer** (SMTP) for admin and customer emails.

## Structure

- `client/` — single-page multi-step order form
- `server/` — REST API (`/api/literature`, `/api/orders`), DB access, mail

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
   Keep `DATABASE_URL` as in the example if you used Docker Compose above. Add SMTP variables only when you want real emails (optional for local testing; orders still save without mail).
3. **Database** — skip this step if you already created `photocopy` via Docker Compose (the empty database is created automatically). For a manual Postgres install, run `createdb photocopy` if needed.
4. **Apply schema and seed literature**
  ```bash
   npm run db:setup
   npm run db:seed
  ```

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

## Troubleshooting

**Vite: `Failed to resolve import "react-router-dom"`** — From the **repository root**, run `npm install` so workspace dependencies (including `react-router-dom`) are installed. Always start dev from the root with `npm run dev`, or run `npm install` in the root before `npm run dev --workspace=client`.

**Postgres: `column "status" does not exist` during `db:setup`** — This was caused by creating an index on `status` before legacy tables had that column. Use the latest `schema.sql` (index on `status` is applied in `migrate_status.sql` after the column exists), then run `npm run db:setup` again.

## Scripts (root `package.json`)


| Script                | Description                       |
| --------------------- | --------------------------------- |
| `npm run install:all` | Same as `npm install` workspaces  |
| `npm run dev`         | Concurrent API + Vite dev         |
| `npm run dev:server`  | Express only                      |
| `npm run dev:client`  | Vite only                         |
| `npm run db:up`       | Start Postgres via Docker Compose |
| `npm run db:down`     | Stop Compose Postgres             |
| `npm run db:setup`    | Run `schema.sql`                  |
| `npm run db:seed`     | Seed sample literature            |


## API

- `GET /api/literature?faculty=...&year=...` — literature rows (optional filters)
- `POST /api/orders` — body: `faculty`, `year`, `literature_id`, `price`, `email`, `phone` (optional)

### Orders (admin)

- `GET /api/orders` — all orders with `literature: { id, name, price }`, newest first. If `ADMIN_SECRET` is set in `.env`, send header `X-Admin-Secret: <same value>` (the Orders page stores this in session after you enter it).
- `GET /api/orders/:id` — one order with full fields and nested `literature`. Same admin header when `ADMIN_SECRET` is set.
- `PATCH /api/orders/:id` — body `{ "status": "pending" | "completed" }`. Same admin header when `ADMIN_SECRET` is set.
- `DELETE /api/orders/:id` — remove an order. Same admin header when `ADMIN_SECRET` is set.

If `ADMIN_SECRET` is **unset**, these endpoints are open (local dev only — use a secret or reverse-proxy auth in production).

## Testing before you publish (simplest path)

For a **full** test (UI + API + database + optional email), you only need this on your machine:

1. **Postgres** — `npm run db:up` (Docker) or a local `createdb photocopy`, then `npm run db:setup` and `npm run db:seed`.
2. **App** — `npm run dev`, complete an order at [http://localhost:5173](http://localhost:5173), and confirm the row appears if you inspect the DB (or trust the success screen).
3. **Email** — to test **both** admin and user messages, set real SMTP values in `.env` (e.g. [Mailtrap](https://mailtrap.io/) inbox for dev, or your provider’s SMTP). Without SMTP, orders still work; only the mail path is skipped.

**Production build smoke test** (optional but useful): `npm run build`, then run the API with `npm run dev:server` and either preview the built client (`npm run preview --workspace=client`) with `VITE_API_URL=http://localhost:3001` in `client/.env`, or serve `client/dist` behind your VPS stack the same way you will in production.

**On the VPS**, mirror the same ideas: install Node, run Postgres (Docker or system package), copy `.env` with production `DATABASE_URL`, `CLIENT_URL`, SMTP, run migrations/seed as needed, build the client, and run the server behind Nginx (or Caddy) with HTTPS. You do not need Docker on the VPS if you prefer installing Postgres directly.

## Production notes

- Set `CLIENT_URL` to your deployed frontend origin for CORS.
- Set `VITE_API_URL` on the client build to the public API URL if the app is not served behind the same host as `/api`.
- Use a transactional email provider SMTP or relay; keep secrets in environment variables only.
- **Brevo SMTP:** step-by-step [docs/BREVO-SMTP.md](docs/BREVO-SMTP.md).

