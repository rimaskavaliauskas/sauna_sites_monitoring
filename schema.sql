-- =============================================================================
-- SCHEMA.SQL - D1 Database Schema for SaunaScopeBot
-- =============================================================================

-- Monitored URLs
CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    last_hash TEXT,
    last_clean_text TEXT,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    active BOOLEAN DEFAULT 1,
    error_count INTEGER DEFAULT 0,
    is_dynamic BOOLEAN DEFAULT 0
);

-- Keyword filters for relevance scoring
CREATE TABLE IF NOT EXISTS filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    keyword TEXT NOT NULL,
    enabled BOOLEAN DEFAULT 1
);

-- Change history log
CREATE TABLE IF NOT EXISTS changes_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER,
    change_summary TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (url_id) REFERENCES urls(id)
);

-- Discovered URLs from link extraction
CREATE TABLE IF NOT EXISTS discovered_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_url_id INTEGER,
    url TEXT UNIQUE,
    title TEXT,
    context TEXT,
    status TEXT DEFAULT 'pending',  -- pending, approved, rejected
    found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_url_id) REFERENCES urls(id)
);

-- Extracted events
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER,
    title TEXT NOT NULL,
    summary TEXT,
    description TEXT,
    date_iso TEXT,
    price_info TEXT,
    location TEXT,
    source_link TEXT,
    hash TEXT UNIQUE,
    is_future BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (url_id) REFERENCES urls(id)
);

-- Create index for faster event lookups
CREATE INDEX IF NOT EXISTS idx_events_hash ON events(hash);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(date_iso);
CREATE INDEX IF NOT EXISTS idx_events_future ON events(is_future);

-- Telemetry for monitoring runs
CREATE TABLE IF NOT EXISTS telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    urls_checked INTEGER,
    changes_found INTEGER,
    llm_calls INTEGER,
    notifications_sent INTEGER,
    errors_count INTEGER,
    duration_ms INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Error logs
CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER,
    level TEXT DEFAULT 'warning',  -- warning, critical
    type TEXT,  -- fetch, llm, parse
    error_message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (url_id) REFERENCES urls(id)
);

-- Settings (key-value store)
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- Default filters
INSERT OR IGNORE INTO filters (category, keyword) VALUES 
    ('event', 'festival'),
    ('event', 'conference'),
    ('event', 'competition'),
    ('sauna', 'sauna'),
    ('sauna', 'pirtis'),
    ('sauna', 'aufguss'),
    ('sauna', 'löyly'),
    ('education', 'course'),
    ('education', 'workshop'),
    ('education', 'training'),
    ('education', 'certification'),
    ('job', 'vacancy'),
    ('job', 'career'),
    ('wellness', 'spa'),
    ('wellness', 'wellness');

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES 
    ('language', 'ENGLISH'),
    ('notifications_enabled', 'true'),
    ('min_summary_words', '40');
