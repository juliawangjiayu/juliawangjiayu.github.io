CREATE TABLE random_runs (
  token_hash TEXT PRIMARY KEY,
  season_id TEXT NOT NULL,
  question_ids TEXT NOT NULL,
  created_at TEXT NOT NULL,
  claimed_by_visitor_id TEXT REFERENCES visitors(id),
  claimed_at TEXT
);

CREATE TABLE random_run_batches (
  token_hash TEXT NOT NULL REFERENCES random_runs(token_hash),
  batch_index INTEGER NOT NULL CHECK (batch_index BETWEEN 0 AND 39),
  session_id TEXT NOT NULL UNIQUE REFERENCES game_sessions(id),
  PRIMARY KEY (token_hash, batch_index)
);

CREATE TABLE random_leaderboard_bests (
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  season_id TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 1000000),
  run_token_hash TEXT NOT NULL UNIQUE REFERENCES random_runs(token_hash),
  achieved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (visitor_id, season_id)
);
CREATE INDEX idx_random_leaderboard_rank ON random_leaderboard_bests(season_id, score DESC, achieved_at ASC, visitor_id ASC);

CREATE TABLE challenges_new (
  id TEXT PRIMARY KEY,
  question_ids TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 25000),
  total_rounds INTEGER NOT NULL CHECK (total_rounds IN (4, 5)),
  created_at TEXT NOT NULL,
  created_by_visitor_id TEXT REFERENCES visitors(id),
  source_session_id TEXT REFERENCES game_sessions(id)
);
INSERT INTO challenges_new (id, question_ids, score, total_rounds, created_at, created_by_visitor_id, source_session_id)
  SELECT id, question_ids, score, total_rounds, created_at, created_by_visitor_id, source_session_id FROM challenges;
DROP TABLE challenges;
ALTER TABLE challenges_new RENAME TO challenges;
CREATE UNIQUE INDEX idx_challenges_source_session ON challenges(source_session_id) WHERE source_session_id IS NOT NULL;
