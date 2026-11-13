-- User platform tables (Phase 1: Supabase Auth + D1 sync)

-- users (synced from Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, -- Supabase auth.users.id (UUID)
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  gmail_connected INTEGER DEFAULT 0,
  gmail_token TEXT, -- encrypted
  gmail_refresh_token TEXT, -- encrypted
  gmail_token_expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- user_memberships (what programs user is in)
CREATE TABLE IF NOT EXISTS user_memberships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider_id INTEGER NOT NULL REFERENCES providers(id),
  tier_name TEXT,
  points_balance INTEGER,
  joined_date TEXT,
  last_active_date TEXT,
  notes TEXT,
  source TEXT DEFAULT 'manual', -- 'manual', 'gmail', 'plaid'
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, provider_id)
);

-- user_spend (optional, from Plaid or manual entry)
CREATE TABLE IF NOT EXISTS user_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sector TEXT NOT NULL,
  annual_amount REAL,
  frequency TEXT,
  avg_transaction REAL,
  period_start TEXT,
  period_end TEXT,
  source TEXT DEFAULT 'manual',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, sector, period_start)
);

-- recommendations (cached model output)
CREATE TABLE IF NOT EXISTS recommendations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_provider_id INTEGER REFERENCES providers(id),
  to_provider_id INTEGER REFERENCES providers(id),
  sector TEXT NOT NULL,
  delta_value REAL,
  confidence REAL,
  reasoning TEXT, -- JSON
  generated_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT,
  status TEXT DEFAULT 'active' -- 'active', 'dismissed', 'accepted'
);

-- gmail_scans (audit log)
CREATE TABLE IF NOT EXISTS gmail_scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scan_date TEXT DEFAULT (datetime('now')),
  emails_scanned INTEGER,
  programs_detected INTEGER,
  new_memberships INTEGER,
  status TEXT,
  error_message TEXT
);

-- oauth_states (CSRF protection for OAuth flows)
CREATE TABLE IF NOT EXISTS oauth_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  state TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL, -- 'gmail', 'google'
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- model_training_log (feedback loop)
CREATE TABLE IF NOT EXISTS model_training_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  recommendation_id INTEGER,
  actual_switch INTEGER DEFAULT 0,
  predicted_delta REAL,
  actual_delta REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_memberships_user ON user_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memberships_provider ON user_memberships(provider_id);
CREATE INDEX IF NOT EXISTS idx_user_spend_user ON user_spend(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_user ON recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations(status);
CREATE INDEX IF NOT EXISTS idx_gmail_scans_user ON gmail_scans(user_id);
CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
CREATE INDEX IF NOT EXISTS idx_model_training_user ON model_training_log(user_id);
