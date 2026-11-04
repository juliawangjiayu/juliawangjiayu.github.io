CREATE TABLE visitors (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL UNIQUE,
  email_verifier TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE visitor_sessions (
  token_hash TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_visitor_sessions_owner ON visitor_sessions(visitor_id, created_at);
CREATE TABLE rate_limit_events (
  scope TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_rate_limit_events_lookup ON rate_limit_events(scope, subject_hash, created_at);
