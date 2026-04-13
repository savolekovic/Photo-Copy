# Docker on a new Mac — install and use with this project

This guide is for a **fresh Mac** where you have never used Docker. In **this repository**, Docker is used for **one thing only**: running **PostgreSQL** locally so the API has a database. The React app and Node server still run with **npm** on your Mac; Docker does not replace Node.

---

## 1. What you are installing

**Docker Desktop** is an app that runs **containers** — isolated processes that behave like small virtual machines. Our [`docker-compose.yml`](../docker-compose.yml) defines a single container: **PostgreSQL 16**, with a database named `photocopy` and a password that matches [`.env.example`](../.env.example).

You do **not** need to learn Docker deeply to use this project. You only need to install the app, start the database container, and stop it when you are done.

---

## 2. Install Docker Desktop (macOS)

### 2.1 Download

1. Open a browser and go to:  
   **https://www.docker.com/products/docker-desktop/**
2. Click **Download for Mac**.
3. Pick the correct installer:
   - **Apple Silicon (M1 / M2 / M3 / M4)** — choose the **Apple Chip** build if offered.
   - **Intel Mac** — choose the **Intel Chip** build.

If you are unsure which Mac you have: **Apple menu → About This Mac**. Look at **Chip** or **Processor**.

### 2.2 Install

1. Open the downloaded **`.dmg`** file.
2. Drag **Docker** into the **Applications** folder.
3. Open **Docker** from **Applications** (first launch may take a minute).

### 2.3 First-run prompts

- Accept the **subscription license** (Docker Desktop is free for personal use and small businesses under their current terms; read their page if you need details).
- macOS may ask for your **password** so Docker can install networking helpers — this is normal.
- You may see **“Docker Desktop needs privileged access”** — approve it so containers can run.

### 2.4 Wait until Docker is ready

- Look at the **menu bar** (top right): the **Docker whale** icon should appear.
- Wait until it says Docker is **running** (no “Starting…” forever). The first start can take a few minutes.

If Docker asks to sign in: you can **Skip** for local development, or create a free Docker Hub account if you prefer.

---

## 3. Check that Docker works

Open **Terminal** (Spotlight: Cmd+Space, type `Terminal`) and run:

```bash
docker --version
```

You should see something like `Docker version 27.x` or similar.

Then:

```bash
docker compose version
```

You should see a **Compose** version (v2 is bundled with Docker Desktop).

If these commands fail, Docker Desktop is not running — open the app from Applications and wait until the whale icon is steady.

---

## 4. How this project uses Docker

| Piece | Runs where |
|--------|------------|
| React (Vite) | Your Mac — `npm run dev` |
| Express API | Your Mac — `npm run dev` |
| PostgreSQL | **Inside Docker** — started by `docker compose` |

The file [`docker-compose.yml`](../docker-compose.yml) tells Docker to:

- Download a small official **Postgres** image (first time only).
- Create a **volume** so database files persist after you stop the container.
- Map **port 5432** on your Mac to Postgres inside the container.

Your [`.env`](../.env.example) `DATABASE_URL` points at `localhost:5432`, which reaches that Postgres.

**You are not “dockerizing” the whole app** for day-to-day dev — only the database.

---

## 5. Step by step in this repository

From the **project root** (`Photo-Copy`):

### 5.1 One-time: Node dependencies

```bash
cd /path/to/Photo-Copy
npm install
cp .env.example .env
```

Keep `DATABASE_URL` as in `.env.example` if you use Docker Compose as written.

### 5.2 Start Postgres in Docker

```bash
npm run db:up
```

This runs `docker compose up -d` (detached: runs in the background).

Wait **5–10 seconds** the first time while the image downloads.

### 5.3 Create tables and sample data

```bash
npm run db:setup
npm run db:seed
```

### 5.4 Run the app

```bash
npm run dev
```

Open **http://localhost:5173** and use the photocopy flow. The API talks to Postgres in Docker on port **5432**.

---

## 6. Stopping and starting again

**Stop the database container** (frees port 5432; data is kept in Docker’s volume):

```bash
npm run db:down
```

**Start it again** later:

```bash
npm run db:up
```

You usually **do not** need to run `db:setup` or `db:seed` again unless you wiped the volume or want a clean database.

---

## 7. Useful commands (optional)

```bash
docker compose ps
```

Shows whether the `db` service is running.

```bash
docker compose logs db
```

Shows Postgres logs if something fails.

---

## 8. Troubleshooting

### “Port 5432 is already allocated”

Something else is using Postgres on your Mac (another Postgres install, or an old container).

- Stop other Postgres services, **or**
- Change the **left** port in `docker-compose.yml` from `5432:5432` to something like `5433:5432`, and set `DATABASE_URL` to use port **5433** on `localhost`.

### Docker Desktop won’t start

- Reboot the Mac.
- Ensure macOS is updated.
- In Docker Desktop **Settings → General**, try “Use **VirtioFS**” or defaults as documented for your OS version.

### `npm run db:setup` fails with connection refused

- Confirm `npm run db:up` succeeded and `docker compose ps` shows `db` as **running**.
- Wait a few seconds after `db:up` before `db:setup`.

---

## 9. Do you need Docker on the VPS?

**No.** On a server you can install PostgreSQL with the system package manager and skip Docker entirely. Docker here is a **convenience for your Mac**; deployment options are described in the main [README](../README.md).
