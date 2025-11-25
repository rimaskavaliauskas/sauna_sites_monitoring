// =============================================================================
// DATABASE.JS - D1 Database Service (matches user's schema with urls table)
// =============================================================================

export class DatabaseService {
  constructor(env) {
    this.db = env.DB
  }

  // =========================================================================
  // URLS (Monitored Sites)
  // =========================================================================

  async getActiveUrls() {
    const { results } = await this.db.prepare("SELECT * FROM urls WHERE active = 1").all()
    return results || []
  }

  async getUrlById(id) {
    return await this.db.prepare("SELECT * FROM urls WHERE id = ?").bind(id).first()
  }

  async addUrl(url, hash, segments) {
    return await this.db
      .prepare("INSERT INTO urls (url, last_hash, last_clean_text) VALUES (?, ?, ?)")
      .bind(url, hash, JSON.stringify(segments))
      .run()
  }

  async updateUrl(id, hash, segments) {
    return await this.db
      .prepare("UPDATE urls SET last_hash = ?, last_clean_text = ?, error_count = 0 WHERE id = ?")
      .bind(hash, JSON.stringify(segments), id)
      .run()
  }

  async incrementErrorCount(id) {
    return await this.db.prepare("UPDATE urls SET error_count = error_count + 1 WHERE id = ?").bind(id).run()
  }

  // =========================================================================
  // CHANGES LOG
  // =========================================================================

  async logChange(urlId, summary) {
    return await this.db
      .prepare("INSERT INTO changes_log (url_id, change_summary) VALUES (?, ?)")
      .bind(urlId, summary)
      .run()
  }

  // =========================================================================
  // ERRORS
  // =========================================================================

  async logError(urlId, message, type = "general", level = "warning") {
    return await this.db
      .prepare("INSERT INTO errors (url_id, error_message, type, level) VALUES (?, ?, ?, ?)")
      .bind(urlId, message, type, level)
      .run()
  }

  // =========================================================================
  // TELEMETRY
  // =========================================================================

  async logTelemetry(stats) {
    return await this.db
      .prepare(
        "INSERT INTO telemetry (urls_checked, changes_found, llm_calls, notifications_sent, errors_count, duration_ms) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(
        stats.urls_checked,
        stats.changes_found,
        stats.llm_calls,
        stats.notifications_sent,
        stats.errors_count,
        stats.duration_ms,
      )
      .run()
  }

  // =========================================================================
  // EVENTS
  // =========================================================================

  async eventExists(hash) {
    const result = await this.db.prepare("SELECT id FROM events WHERE hash = ?").bind(hash).first()
    return !!result
  }

  async findSimilarEvent(date_iso, title) {
    if (!date_iso || !title) return null

    const { results } = await this.db.prepare("SELECT id, title FROM events WHERE date_iso = ?").bind(date_iso).all()

    if (!results || results.length === 0) return null

    for (const event of results) {
      const t1 = title.toLowerCase()
      const t2 = event.title.toLowerCase()

      // Substring match
      if (t1.includes(t2) || t2.includes(t1)) {
        return event.id
      }

      // Levenshtein similarity (80% threshold)
      const distance = this.levenshteinDistance(t1, t2)
      const maxLength = Math.max(t1.length, t2.length)
      const similarity = 1 - distance / maxLength

      if (similarity > 0.8) {
        return event.id
      }
    }
    return null
  }

  levenshteinDistance(a, b) {
    if (a.length === 0) return b.length
    if (b.length === 0) return a.length

    const matrix = []
    for (let i = 0; i <= b.length; i++) matrix[i] = [i]
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1)
        }
      }
    }
    return matrix[b.length][a.length]
  }

  async addEvent(event) {
    return await this.db
      .prepare(
        `INSERT INTO events (url_id, title, summary, description, date_iso, price_info, location, source_link, hash, is_future) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        event.url_id,
        event.title,
        event.summary || "",
        event.description || "",
        event.date_iso,
        event.price_info,
        event.location || "",
        event.source_link,
        event.hash,
        event.is_future ? 1 : 0,
      )
      .run()
  }

  async getFutureEvents() {
    return await this.db
      .prepare(
        "SELECT * FROM events WHERE date_iso >= date('now', '-30 days') OR date_iso IS NULL ORDER BY date_iso ASC",
      )
      .all()
  }

  // =========================================================================
  // DISCOVERED URLS
  // =========================================================================

  async addDiscoveredUrl(sourceUrlId, url, title, context) {
    return await this.db
      .prepare("INSERT OR IGNORE INTO discovered_urls (source_url_id, url, title, context) VALUES (?, ?, ?, ?)")
      .bind(sourceUrlId, url, title, context)
      .run()
  }

  // =========================================================================
  // SETTINGS
  // =========================================================================

  async getSetting(key) {
    const result = await this.db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first()
    return result ? result.value : null
  }

  async setSetting(key, value) {
    return await this.db
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(key, value)
      .run()
  }
}
