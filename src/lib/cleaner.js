// =============================================================================
// CLEANER.JS - Text cleaning and segmentation utilities
// =============================================================================

/**
 * Segment text into meaningful chunks for comparison
 * Removes noise and normalizes whitespace
 */
export function segmentText(content) {
  if (!content || typeof content !== "string") {
    return []
  }

  // Normalize whitespace
  let cleaned = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\t/g, " ").replace(/ +/g, " ")

  // Remove common noise patterns
  const noisePatterns = [
    /cookie[s]?\s*(policy|notice|consent|settings)/gi,
    /accept\s*(all\s*)?cookies/gi,
    /privacy\s*policy/gi,
    /terms\s*(of\s*)?(service|use)/gi,
    /©\s*\d{4}/g,
    /all\s*rights\s*reserved/gi,
    /follow\s*us\s*on/gi,
    /subscribe\s*to\s*(our\s*)?newsletter/gi,
    /sign\s*up\s*for\s*(our\s*)?newsletter/gi,
    /loading\.{3}/gi,
    /please\s*wait/gi,
  ]

  for (const pattern of noisePatterns) {
    cleaned = cleaned.replace(pattern, "")
  }

  // Split into paragraphs/segments
  const segments = cleaned
    .split(/\n\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20) // Filter very short segments

  return segments
}

/**
 * Clean HTML content - extract text only
 */
export function cleanHtml(html) {
  if (!html) return ""

  return (
    html
      // Remove script and style contents
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
      // Remove HTML tags
      .replace(/<[^>]+>/g, " ")
      // Decode HTML entities
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Normalize whitespace
      .replace(/\s+/g, " ")
      .trim()
  )
}

/**
 * Extract potential dates from text
 */
export function extractDates(text) {
  const datePatterns = [
    // ISO format: 2025-06-15
    /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g,
    // European format: 15.06.2025 or 15/06/2025
    /\b(\d{1,2})[./](\d{1,2})[./](\d{4})\b/g,
    // Written format: June 15, 2025 or 15 June 2025
    /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})\b/gi,
    /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/gi,
  ]

  const dates = []
  for (const pattern of datePatterns) {
    const matches = text.matchAll(pattern)
    for (const match of matches) {
      dates.push(match[0])
    }
  }

  return [...new Set(dates)] // Remove duplicates
}

/**
 * Extract potential prices from text
 */
export function extractPrices(text) {
  const pricePatterns = [
    /€\s*\d+(?:[.,]\d{2})?/g,
    /\$\s*\d+(?:[.,]\d{2})?/g,
    /\d+(?:[.,]\d{2})?\s*€/g,
    /\d+(?:[.,]\d{2})?\s*EUR\b/gi,
    /\d+(?:[.,]\d{2})?\s*USD\b/gi,
  ]

  const prices = []
  for (const pattern of pricePatterns) {
    const matches = text.matchAll(pattern)
    for (const match of matches) {
      prices.push(match[0])
    }
  }

  return [...new Set(prices)]
}
