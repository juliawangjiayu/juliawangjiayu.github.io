CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('photo', 'collection')),
  target_id TEXT NOT NULL,
  body TEXT NOT NULL,
  submission_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  reply_body TEXT,
  reply_updated_at TEXT,
  UNIQUE(visitor_id, submission_key)
);
CREATE INDEX idx_comments_target ON comments(target_type, target_id, deleted_at, created_at DESC, id DESC);
CREATE INDEX idx_comments_rate ON comments(visitor_id, created_at);
CREATE INDEX idx_comments_recent ON comments(deleted_at, created_at DESC, id DESC);
