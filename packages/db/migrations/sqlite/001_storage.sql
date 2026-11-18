CREATE TABLE bootstrap_state (id TEXT PRIMARY KEY, version INTEGER NOT NULL) STRICT;
INSERT INTO bootstrap_state VALUES ('schema', 1);

-- Storage primitives. Identity and commerce services must enforce their workflows.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  disabled_at INTEGER
) STRICT;
CREATE TABLE roles (id TEXT PRIMARY KEY) STRICT;
INSERT INTO roles VALUES ('student'), ('examiner'), ('reviewer'), ('ops'), ('finance'), ('super');
CREATE TABLE user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
) STRICT;
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
) STRICT;
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE billing_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  currency TEXT NOT NULL CHECK (currency = 'INR'),
  status TEXT NOT NULL CHECK (status IN ('pending','paid','failed','refunded')),
  created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE billing_events (
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  order_id TEXT REFERENCES billing_orders(id),
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  received_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_event_id)
) STRICT;
CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES billing_orders(id),
  source_event TEXT NOT NULL UNIQUE,
  amount_paise INTEGER NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'Ledger entries are append-only'); END;
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger_entries BEGIN SELECT RAISE(ABORT, 'Ledger entries are append-only'); END;
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT,
  action TEXT NOT NULL,
  metadata TEXT NOT NULL CHECK (json_valid(metadata)),
  created_at INTEGER NOT NULL
) STRICT;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit_events BEGIN SELECT RAISE(ABORT, 'Audit events are append-only'); END;
CREATE TABLE stored_files (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id),
  media_type TEXT NOT NULL,
  content BLOB NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,
  deduplication_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL CHECK (json_valid(payload)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  available_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE INDEX jobs_ready ON jobs(kind, status, available_at);
