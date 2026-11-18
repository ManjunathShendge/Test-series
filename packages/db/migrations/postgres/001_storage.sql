-- M0 storage primitives. Identity and commerce services (M1, M9) must enforce their
-- workflows; these tables only guarantee integrity rules the database can own.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

CREATE TABLE bootstrap_state (id text PRIMARY KEY, version integer NOT NULL);
INSERT INTO bootstrap_state VALUES ('schema', 1);

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);
CREATE TABLE roles (id text PRIMARY KEY);
INSERT INTO roles VALUES ('student'), ('examiner'), ('reviewer'), ('ops'), ('finance'), ('super');
CREATE TABLE user_roles (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id text NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE billing_orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  idempotency_key text NOT NULL UNIQUE,
  amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
  currency text NOT NULL CHECK (currency = 'INR'),
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE billing_events (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  order_id uuid REFERENCES billing_orders(id),
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_event_id)
);
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES billing_orders(id),
  source_event text NOT NULL UNIQUE,
  amount_paise bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
  id uuid PRIMARY KEY,
  actor_id uuid,
  action text NOT NULL,
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Ledger and audit history is append-only (CLAUDE.md invariant 5), including TRUNCATE.
CREATE FUNCTION reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END $$;
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_history_change();
CREATE TRIGGER ledger_no_truncate BEFORE TRUNCATE ON ledger_entries
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_change();
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION reject_history_change();
CREATE TRIGGER audit_no_truncate BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION reject_history_change();

-- Domain job queue: deduplicated, claimed with SKIP LOCKED, leases recover crashed workers.
CREATE TABLE jobs (
  id uuid PRIMARY KEY,
  deduplication_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  available_at timestamptz NOT NULL,
  lease_token uuid,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX jobs_ready ON jobs(kind, status, available_at);
