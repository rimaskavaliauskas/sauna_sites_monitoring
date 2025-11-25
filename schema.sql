-- Table: urls
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

-- Table: filters
CREATE TABLE IF NOT EXISTS filters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  keyword TEXT NOT NULL,
  enabled BOOLEAN DEFAULT 1
);

-- Table: changes_log
CREATE TABLE IF NOT EXISTS changes_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url_id INTEGER,
  change_summary TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (url_id) REFERENCES urls(id)
);

-- Table: discovered_urls
CREATE TABLE IF NOT EXISTS discovered_urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_url_id INTEGER,
    url TEXT UNIQUE,
    title TEXT,
    context TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    found_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_url_id) REFERENCES urls(id)
);

-- Table: events (NEW)
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    urls_checked INTEGER,
    changes_found INTEGER,
    llm_calls INTEGER,
    notifications_sent INTEGER,
    errors_count INTEGER,
    duration_ms INTEGER
);

-- Table: errors (NEW)
CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url_id INTEGER,
    level TEXT DEFAULT 'warning', -- warning, critical
    type TEXT, -- fetch, llm, parse
    error_message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (url_id) REFERENCES urls(id)
);

-- Table: settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

-- Initial Seed Data for Filters
INSERT OR IGNORE INTO filters (category, keyword) VALUES 
('festival', 'festival'),
('event', 'conference'),
('sauna', 'pirtis'),
('education', 'course'),
('job', 'vakansija'),
('sauna', 'sauna'),
('event', 'event');
