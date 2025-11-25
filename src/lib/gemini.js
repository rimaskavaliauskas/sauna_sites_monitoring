// =============================================================================
// GEMINI.JS - Enhanced with generation config options
// =============================================================================

/**
 * Call Gemini API with configurable generation parameters
 *
 * @param {string} content - The content to analyze
 * @param {string} apiKey - Gemini API key
 * @param {string} systemPrompt - The system/instruction prompt
 * @param {Object} options - Generation options
 * @param {number} options.temperature - Controls randomness (0.0-1.0, default 0.3)
 * @param {number} options.maxOutputTokens - Max response length (default 4096)
 * @param {string} options.model - Model name (default 'gemini-2.0-flash')
 */
export async function classifyText(content, apiKey, systemPrompt, options = {}) {
  const {
    temperature = 0.3, // Lower = more focused/consistent
    maxOutputTokens = 4096, // Allow detailed responses
    model = "gemini-2.0-flash-exp", // Fast and capable
  } = options

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const requestBody = {
    contents: [
      {
        parts: [{ text: systemPrompt }, { text: `\n\nContent to analyze:\n\n${content}` }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens,
      responseMimeType: "application/json",
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    ],
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()

  // Check for API-level errors
  if (data.error) {
    throw new Error(`Gemini error: ${data.error.message}`)
  }

  // Check for blocked content
  if (data.candidates?.[0]?.finishReason === "SAFETY") {
    throw new Error("Content blocked by safety filters")
  }

  // Extract text from response
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text

  if (!responseText) {
    throw new Error("Empty response from Gemini API")
  }

  return responseText
}

/**
 * New function: Rate-limited API calls
 * Implements a simple queue to respect Gemini's rate limits
 */
export class GeminiRateLimiter {
  constructor(requestsPerMinute = 15) {
    this.requestsPerMinute = requestsPerMinute
    this.requestTimes = []
  }

  async waitForSlot() {
    const now = Date.now()
    const oneMinuteAgo = now - 60000

    // Remove old timestamps
    this.requestTimes = this.requestTimes.filter((t) => t > oneMinuteAgo)

    if (this.requestTimes.length >= this.requestsPerMinute) {
      // Calculate wait time until oldest request expires
      const oldestRequest = Math.min(...this.requestTimes)
      const waitTime = oldestRequest + 60000 - now + 100 // +100ms buffer

      console.log(`Rate limit: waiting ${waitTime}ms`)
      await new Promise((resolve) => setTimeout(resolve, waitTime))

      // Recursively check again after waiting
      return this.waitForSlot()
    }

    this.requestTimes.push(now)
  }

  async call(content, apiKey, prompt, options) {
    await this.waitForSlot()
    return classifyText(content, apiKey, prompt, options)
  }
}
