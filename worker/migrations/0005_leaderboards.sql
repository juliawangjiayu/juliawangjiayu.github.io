ALTER TABLE game_sessions ADD COLUMN claimed_by_visitor_id TEXT REFERENCES visitors(id);
ALTER TABLE game_sessions ADD COLUMN claimed_at TEXT;
ALTER TABLE challenges ADD COLUMN created_by_visitor_id TEXT REFERENCES visitors(id);
ALTER TABLE challenges ADD COLUMN source_session_id TEXT REFERENCES game_sessions(id);
CREATE UNIQUE INDEX idx_challenges_source_session ON challenges(source_session_id) WHERE source_session_id IS NOT NULL;
CREATE TABLE leaderboard_bests (
  visitor_id TEXT NOT NULL REFERENCES visitors(id),
  mode TEXT NOT NULL CHECK (mode IN ('easy', 'medium', 'hard', 'random')),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 25000),
  session_id TEXT NOT NULL UNIQUE REFERENCES game_sessions(id),
  achieved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (visitor_id, mode)
);
CREATE INDEX idx_leaderboard_rank ON leaderboard_bests(mode, score DESC, achieved_at ASC, visitor_id ASC);
