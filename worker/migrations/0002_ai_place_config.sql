CREATE TABLE IF NOT EXISTS ai_place_versions (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  provider TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  timeout_seconds INTEGER NOT NULL CHECK (timeout_seconds BETWEEN 1 AND 120),
  retry_count INTEGER NOT NULL CHECK (retry_count BETWEEN 0 AND 5),
  prompt_text TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL DEFAULT '',
  api_key_iv TEXT NOT NULL DEFAULT '',
  receipt TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_place_active (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  version INTEGER NOT NULL REFERENCES ai_place_versions(version)
);
