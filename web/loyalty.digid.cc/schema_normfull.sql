CREATE TABLE IF NOT EXISTS normalized_records_full (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    program_name TEXT,
    sector TEXT,
    region TEXT,
    estimated_members INTEGER,
    tier_count INTEGER,
    tier_names TEXT,
    miles_expiry TEXT,
    award_pricing TEXT,
    earn_rate TEXT,
    credit_card_partners TEXT,
    alliance TEXT,
    points_currency TEXT,
    best_redemption TEXT,
    analyzed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_normfull_company ON normalized_records_full(company_name);
CREATE INDEX IF NOT EXISTS idx_normfull_sector ON normalized_records_full(sector);
