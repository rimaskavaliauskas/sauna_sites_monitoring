// =============================================================================
// ANALYZER.JS - Enhanced with validation, retry logic, and semantic detection
// =============================================================================

import { PROMPT_DEEP_ANALYSIS } from "../lib/prompts.js"
import { classifyText } from "../lib/gemini.js"
import { DatabaseService } from "./database.js"
import { segmentText } from "../lib/cleaner.js"

export class AnalyzerService {
  constructor(env) {
    this.env = env
    this.MIN_SUMMARY_WORDS = 30 // Minimum acceptable summary length
  }

  /**
   * Main analysis entry point - Two-Level Analysis
   */
  async analyze(content, url, oldHash, oldSegmentsJson) {
    const newSegments = segmentText(content)
    const newHash = await this.hashContent(newSegments)

    // Level 1: Fast Hash Check
    if (newHash === oldHash) {
      return { hasChange: false, newHash, newSegments }
    }

    // Level 1.5: Semantic Change Detection
    let isSignificant = true
    if (oldSegmentsJson) {
      try {
        const oldSegments = JSON.parse(oldSegmentsJson)
        const oldText = oldSegments.join(" ")
        const newText = newSegments.join(" ")

        // Use enhanced keyword-based change detection
        if (!this.hasImportantKeywordChanges(oldText, newText)) {
          const similarity = this.calculateSimilarity(oldText, newText)
          if (similarity > 0.92) {
            console.log(`Minor change detected (${(similarity * 100).toFixed(1)}% similar), skipping Deep Analysis.`)
            isSignificant = false
          }
        }
      } catch (e) {
        console.error("Error in change detection:", e)
      }
    }

    if (!isSignificant) {
      return { hasChange: false, newHash, newSegments, note: "Minor change ignored" }
    }

    // Level 2: Deep Analysis with LLM
    console.log(`Significant change detected for ${url}, running Deep Analysis...`)
    const analysis = await this.performDeepAnalysis(content, url)

    return {
      hasChange: true,
      newHash,
      newSegments,
      analysis,
    }
  }

  /**
   * Deep Analysis with validation and retry logic
   */
  async performDeepAnalysis(content, url) {
    const safeContent = content.substring(0, 100000)
    const currentDate = new Date().toISOString().split("T")[0]

    const db = new DatabaseService(this.env)
    let language = await db.getSetting("language")
    if (!language || language === "null" || language === "undefined") {
      language = "ENGLISH"
    }

    const prompt = PROMPT_DEEP_ANALYSIS.replaceAll("{{URL}}", url)
      .replaceAll("{{LANGUAGE}}", language)
      .replaceAll("{{DATE}}", currentDate)

    try {
      const result = await this.classifyWithRetry(
        safeContent,
        prompt,
        {
          temperature: 0.3,
          maxOutputTokens: 8192,
        },
        3,
      )

      return this.validateAndEnhanceAnalysis(result, url, language)
    } catch (e) {
      console.error("Deep Analysis Error:", e)
      return {
        site_category: "Analysis failed",
        future_events: [],
        past_events: [],
        insights: [`Error analyzing ${url}: ${e.message}`],
      }
    }
  }

  /**
   * Retry logic with exponential backoff
   */
  async classifyWithRetry(content, prompt, options, maxRetries = 3) {
    let lastError

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await classifyText(content, this.env.GEMINI_API_KEY, prompt, options)

        const parsed = typeof result === "string" ? JSON.parse(result.replace(/```json|```/g, "").trim()) : result

        const hasContent =
          (parsed.future_events && parsed.future_events.length > 0) ||
          (parsed.past_events && parsed.past_events.length > 0) ||
          (parsed.insights && parsed.insights.length > 0)

        if (hasContent || attempt === maxRetries) {
          return parsed
        }

        console.warn(`Attempt ${attempt}: Empty LLM response, retrying...`)
      } catch (e) {
        lastError = e
        console.error(`Attempt ${attempt} failed:`, e.message)

        // Don't retry on rate limit - let it propagate
        if (e.message.includes("429")) {
          throw e
        }

        if (attempt === maxRetries) {
          throw lastError
        }
      }

      // Exponential backoff: 2s, 4s, 8s
      await this.sleep(2000 * Math.pow(2, attempt - 1))
    }

    throw lastError
  }

  /**
   * Validate and enhance LLM output quality
   */
  validateAndEnhanceAnalysis(analysis, url, language) {
    const validated = {
      site_category: analysis.site_category || "Unknown",
      future_events: [],
      past_events: [],
      insights: analysis.insights || [],
    }

    if (Array.isArray(analysis.future_events)) {
      validated.future_events = analysis.future_events
        .map((event) => this.validateEvent(event, url))
        .filter((event) => event !== null)
    }

    if (Array.isArray(analysis.past_events)) {
      validated.past_events = analysis.past_events
        .map((event) => this.validateEvent(event, url))
        .filter((event) => event !== null)
    }

    if (validated.insights.length === 0) {
      validated.insights = [
        `Analyzed content from ${url}`,
        `Found ${validated.future_events.length} upcoming and ${validated.past_events.length} past events`,
      ]
    }

    return validated
  }

  /**
   * Validate individual event and enhance if needed
   */
  validateEvent(event, fallbackUrl) {
    if (!event || !event.title) {
      return null
    }

    // Ensure link is never empty
    if (!event.link || event.link === "null" || event.link === "") {
      event.link = fallbackUrl
    }

    // Check summary quality
    const summaryWordCount = (event.summary || "").split(/\s+/).filter((w) => w.length > 0).length

    if (summaryWordCount < this.MIN_SUMMARY_WORDS) {
      console.warn(`Short summary for "${event.title}": ${summaryWordCount} words`)
      event.summary = this.buildEnhancedSummary(event)
    }

    return {
      title: event.title,
      type: event.type || "EVENT",
      summary: event.summary,
      price: event.price || null,
      price_info: event.price_info || "Contact for pricing",
      location: event.location || "See website",
      registration_info: event.registration_info || null,
      date_iso: event.date_iso || null,
      date_text: event.date_text || "Date TBA",
      is_past: Boolean(event.is_past),
      link: event.link,
    }
  }

  /**
   * Build enhanced summary from event data when LLM provides lazy output
   */
  buildEnhancedSummary(event) {
    const parts = []

    const typeLabel =
      {
        EVENT: "Event",
        COURSE: "Training course",
        WORKSHOP: "Workshop",
        OFFER: "Special offer",
        NEWS: "Announcement",
      }[event.type] || "Event"

    parts.push(`${typeLabel}: "${event.title}".`)

    if (event.location && event.location !== "See website") {
      parts.push(`Taking place in ${event.location}.`)
    }

    if (event.date_text && event.date_text !== "Date TBA") {
      parts.push(`Scheduled for ${event.date_text}.`)
    }

    if (event.price) {
      parts.push(`Price: ${event.price}.`)
    } else if (event.price_info === "Free") {
      parts.push("This is a free event.")
    }

    if (event.registration_info === "Sold Out") {
      parts.push("Currently sold out - check for waitlist.")
    } else if (event.registration_info === "Open") {
      parts.push("Registration is currently open.")
    }

    parts.push("Visit the source link for complete details and registration.")

    return parts.join(" ")
  }

  /**
   * Check for important keyword/pattern changes (dates, prices, status)
   */
  hasImportantKeywordChanges(oldText, newText) {
    const IMPORTANT_PATTERNS = [
      /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/g,
      /\d{4}[/.-]\d{1,2}[/.-]\d{1,2}/g,
      /€\s?\d+[\d\s,.]*/g,
      /\$\s?\d+[\d\s,.]*/g,
      /\d+\s?EUR\b/gi,
      /\b(registration|enroll|sign\s?up|book\s?now)\b/gi,
      /\b(sold\s?out|cancelled|postponed|full)\b/gi,
    ]

    for (const pattern of IMPORTANT_PATTERNS) {
      const oldMatches = (oldText.match(pattern) || []).sort()
      const newMatches = (newText.match(pattern) || []).sort()

      if (JSON.stringify(oldMatches) !== JSON.stringify(newMatches)) {
        return true
      }
    }

    return false
  }

  /**
   * Calculate Jaccard similarity between two texts
   */
  calculateSimilarity(text1, text2) {
    const words1 = new Set(
      text1
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
    )
    const words2 = new Set(
      text2
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3),
    )

    const intersection = new Set([...words1].filter((w) => words2.has(w)))
    const union = new Set([...words1, ...words2])

    return union.size > 0 ? intersection.size / union.size : 1
  }

  /**
   * Hash content for change detection
   */
  async hashContent(segments) {
    const text = Array.isArray(segments) ? segments.join("") : String(segments)
    const msgBuffer = new TextEncoder().encode(text)
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
