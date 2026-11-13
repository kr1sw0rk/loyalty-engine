CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    api_key TEXT NOT NULL UNIQUE,
    name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT,
    is_active INTEGER DEFAULT 1
);

INSERT OR IGNORE INTO api_keys (api_key, name) VALUES ('bd639807d8f3c1e2a5b4d6f8a9c0e1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8', 'ingestion-crawler');
