-- Authentication: student + operator accounts, passwordless magic-link tokens,
-- and server-side sessions (the cookie carries a random value; only its hash is stored).

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  -- Broj indeksa. Nullable at the storage layer on purpose: operators never have one,
  -- and whether it is mandatory for students is an app-level policy (see REQUIRE_INDEX_NUMBER)
  -- that the client has not finally confirmed.
  index_number TEXT,
  locale TEXT NOT NULL DEFAULT 'sr-ME',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  CONSTRAINT users_role_check CHECK (role IN ('student', 'operator'))
);

-- Case-insensitive uniqueness: e-mail is the identity, so Ime@ucg.ac.me == ime@ucg.ac.me.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

-- Two students must not claim the same index number. NULLs do not collide in Postgres,
-- so this stays compatible with the column being optional.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_index_number
  ON users (index_number)
  WHERE index_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS login_tokens (
  id SERIAL PRIMARY KEY,
  -- SHA-256 of the value that went out in the e-mail. The raw token is never persisted,
  -- so a database leak cannot be replayed into a login.
  token_hash TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  -- Captured with the request so a first-time login can create the account in one step.
  index_number TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  request_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Supports the per-address rate limit on link requests.
CREATE INDEX IF NOT EXISTS idx_login_tokens_email_created
  ON login_tokens (LOWER(email), created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  -- SHA-256 of the cookie value, for the same reason as login_tokens.token_hash.
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);
