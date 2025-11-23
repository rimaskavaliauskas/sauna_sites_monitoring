-- Table: urls
CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    last_hash TEXT,
    last_clean_text TEXT,
    added_at TEXT DEFAULT (datetime('now')),
    active INTEGER DEFAULT 1,
    error_count INTEGER DEFAULT 0
);

-- Table: filters
CREATE TABLE IF NOT EXISTS filters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    keyword TEXT NOT NULL,
    enabled INTEGER DEFAULT 1
);

-- Table: changes_log
CREATE TABLE IF NOT EXISTS changes_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER,
    change_summary TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (url_id) REFERENCES urls(id)
);

-- Table: telemetry
CREATE TABLE IF NOT EXISTS telemetry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT DEFAULT (datetime('now')),
    urls_checked INTEGER DEFAULT 0,
    changes_found INTEGER DEFAULT 0,
    llm_calls INTEGER DEFAULT 0,
    notifications_sent INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0
);

-- Table: errors
CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER,
    error_message TEXT,
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (url_id) REFERENCES urls(id)
);

-- Initial Seed Data for Filters
INSERT INTO filters (category, keyword) VALUES 
('festival', 'festival'),
('event', 'conference'),
('sauna', 'pirtis'),
('education', 'course'),
('job', 'vakansija'),
('sauna', 'sauna'),
('event', 'event');
