CREATE TABLE IF NOT EXISTS game_photos (
  photo_id TEXT PRIMARY KEY,
  image_url TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
  answer_latitude REAL NOT NULL CHECK (answer_latitude BETWEEN -90 AND 90),
  answer_longitude REAL NOT NULL CHECK (answer_longitude BETWEEN -180 AND 180),
  radius_km INTEGER NOT NULL CHECK (radius_km IN (1, 10, 50, 100)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('easy', 'medium', 'hard', 'random', 'challenge')),
  question_ids TEXT NOT NULL,
  total_score INTEGER NOT NULL DEFAULT 0 CHECK (total_score BETWEEN 0 AND 25000),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_answers (
  session_id TEXT NOT NULL,
  round_index INTEGER NOT NULL CHECK (round_index BETWEEN 0 AND 4),
  guess_latitude REAL NOT NULL CHECK (guess_latitude BETWEEN -90 AND 90),
  guess_longitude REAL NOT NULL CHECK (guess_longitude BETWEEN -180 AND 180),
  distance_km REAL NOT NULL CHECK (distance_km >= 0),
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 5000),
  proximity TEXT NOT NULL CHECK (proximity IN ('exact', 'close', 'near', 'far', 'miss')),
  submitted_at TEXT NOT NULL,
  PRIMARY KEY (session_id, round_index),
  FOREIGN KEY (session_id) REFERENCES game_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  question_ids TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 25000),
  total_rounds INTEGER NOT NULL DEFAULT 5 CHECK (total_rounds = 5),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_game_photos_mode
  ON game_photos(enabled, difficulty);

CREATE INDEX IF NOT EXISTS idx_game_answers_session
  ON game_answers(session_id, round_index);
