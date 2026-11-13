-- Loyalty Program Intelligence — D1 Schema
-- Read-optimized for the UI

CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    program_name TEXT NOT NULL,
    program_url TEXT,
    sector TEXT NOT NULL,
    region TEXT,
    estimated_members INTEGER,
    key_characteristics TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parameters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    param_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT,
    data_type TEXT,
    benchmark_notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crawled_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER REFERENCES providers(id),
    company_name TEXT NOT NULL,
    program_name TEXT NOT NULL,
    sector TEXT,
    region TEXT,
    program_url TEXT,
    estimated_members INTEGER,
    crawl_status INTEGER,
    crawl_error TEXT,
    html_length INTEGER,
    text_preview TEXT,
    crawled_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS normalized_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider_id INTEGER REFERENCES providers(id),
    param_id TEXT REFERENCES parameters(param_id),
    value TEXT,
    confidence REAL DEFAULT 0.0,
    source_url TEXT,
    extracted_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for read performance
CREATE INDEX IF NOT EXISTS idx_providers_sector ON providers(sector);
CREATE INDEX IF NOT EXISTS idx_providers_region ON providers(region);
CREATE INDEX IF NOT EXISTS idx_providers_members ON providers(estimated_members);
CREATE INDEX IF NOT EXISTS idx_parameters_category ON parameters(category);
CREATE INDEX IF NOT EXISTS idx_crawled_provider ON crawled_data(provider_id);
CREATE INDEX IF NOT EXISTS idx_normalized_provider ON normalized_records(provider_id);
CREATE INDEX IF NOT EXISTS idx_normalized_param ON normalized_records(param_id);
