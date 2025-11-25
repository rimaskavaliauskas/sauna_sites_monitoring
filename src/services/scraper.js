// =============================================================================
// SCRAPER.JS - Hybrid Scraper with Fetch fallback to Browser
// =============================================================================

import puppeteer from "@cloudflare/puppeteer"
import * as cheerio from "cheerio"

export class ScraperService {
  constructor(env) {
    this.env = env
  }

  /**
   * Main scrape method - tries fetch first, falls back to browser
   */
  async scrape(url, isDynamic = false) {
    if (isDynamic) {
      return await this.scrapeWithBrowser(url)
    } else {
      try {
        return await this.scrapeWithFetch(url)
      } catch (e) {
        console.warn(`Fetch failed for ${url}, falling back to browser:`, e.message)
        return await this.scrapeWithBrowser(url)
      }
    }
  }

  /**
   * Fast scraping with fetch + cheerio (for static sites)
   */
  async scrapeWithFetch(url) {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    })

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status} ${response.statusText}`)
    }

    const html = await response.text()

    if (html.length < 500) {
      throw new Error("Content too short, likely JS-blocked or empty page")
    }

    const $ = cheerio.load(html)

    // Remove noise elements
    $("script, style, nav, footer, iframe, noscript, header, aside, .cookie-banner, .popup, .modal").remove()

    const content = $("body").text().replace(/\s+/g, " ").trim()
    const links = []

    $("a").each((i, el) => {
      const href = $(el).attr("href")
      const text = $(el).text().trim()
      if (href && text && text.length > 2) {
        // Resolve relative URLs
        try {
          const absoluteUrl = new URL(href, url).href
          links.push({ href: absoluteUrl, text: text.substring(0, 100) })
        } catch (e) {
          // Invalid URL, skip
        }
      }
    })

    return { content, links, method: "fetch" }
  }

  /**
   * Full browser scraping with Puppeteer (for JS-heavy sites)
   */
  async scrapeWithBrowser(url) {
    if (!this.env.MYBROWSER) {
      throw new Error("Browser binding MYBROWSER not configured in wrangler.toml")
    }

    const browser = await puppeteer.launch(this.env.MYBROWSER)
    const page = await browser.newPage()

    try {
      await page.setViewport({ width: 1280, height: 800 })
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      )

      await page.goto(url, {
        waitUntil: "networkidle0",
        timeout: 30000,
      })

      // Auto-scroll to trigger lazy loading
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0
          const distance = 300
          const maxScrolls = 10
          let scrolls = 0

          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight
            window.scrollBy(0, distance)
            totalHeight += distance
            scrolls++

            if (totalHeight >= scrollHeight || scrolls >= maxScrolls) {
              clearInterval(timer)
              window.scrollTo(0, 0) // Scroll back to top
              resolve()
            }
          }, 100)
        })
      })

      // Wait for any dynamic content
      await page.waitForTimeout(1000)

      const content = await page.evaluate(() => {
        // Remove noise elements
        const removeSelectors = [
          "script",
          "style",
          "nav",
          "footer",
          "iframe",
          "noscript",
          "header",
          ".cookie-banner",
          ".popup",
          ".modal",
        ]
        removeSelectors.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => el.remove())
        })
        return document.body.innerText
      })

      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a"))
          .map((a) => ({
            href: a.href,
            text: a.innerText.trim().substring(0, 100),
          }))
          .filter((l) => l.href && l.text && l.text.length > 2)
      })

      return { content, links, method: "browser" }
    } finally {
      await browser.close()
    }
  }
}
