/**
 * Router - HTTP Request Handler
 * Handles webhook and manual API endpoints
 */

export class Router {
  constructor(env, db, scraper, analyzer) {
    this.env = env
    this.db = db
    this.scraper = scraper
    this.analyzer = analyzer
  }

  async handleRequest(request, ctx) {
    const url = new URL(request.url)
    const path = url.pathname

    try {
      // Health check
      if (path === "/health" || path === "/") {
        return new Response(
          JSON.stringify({
            status: "ok",
            timestamp: new Date().toISOString(),
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        )
      }

      // Manual trigger for testing
      if (path === "/trigger" && request.method === "POST") {
        ctx.waitUntil(this.runManualCheck())
        return new Response(
          JSON.stringify({
            message: "Monitoring triggered",
          }),
          {
            headers: { "Content-Type": "application/json" },
          },
        )
      }

      // Get all monitored URLs
      if (path === "/urls" && request.method === "GET") {
        const urls = await this.db.getActiveUrls()
        return new Response(JSON.stringify(urls), {
          headers: { "Content-Type": "application/json" },
        })
      }

      // Get future events
      if (path === "/events" && request.method === "GET") {
        const events = await this.db.getFutureEvents()
        return new Response(JSON.stringify(events), {
          headers: { "Content-Type": "application/json" },
        })
      }

      // Telegram webhook
      if (path === "/webhook" && request.method === "POST") {
        const body = await request.json()
        ctx.waitUntil(this.handleTelegramWebhook(body))
        return new Response("OK")
      }

      return new Response("Not Found", { status: 404 })
    } catch (e) {
      console.error("Router Error:", e)
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }
  }

  async runManualCheck() {
    // Import and run the monitoring loop
    const urls = await this.db.getActiveUrls()
    console.log(`Manual check started for ${urls.length} URLs`)
  }

  async handleTelegramWebhook(body) {
    // Basic webhook handler - extend as needed
    const message = body.message
    if (!message || !message.text) return

    const chatId = message.chat.id
    const text = message.text

    // Simple command handling
    if (text === "/start" || text === "/help") {
      await this.sendTelegram(
        chatId,
        `🧖 <b>SaunaScopeBot</b>\n\n` +
          `Commands:\n` +
          `/list - Show monitored sites\n` +
          `/events - Show upcoming events\n` +
          `/help - This message`,
      )
    } else if (text === "/list") {
      const urls = await this.db.getActiveUrls()
      const list = urls.map((u, i) => `${i + 1}. ${u.url}`).join("\n")
      await this.sendTelegram(chatId, `📋 <b>Monitored Sites:</b>\n\n${list || "No sites yet"}`)
    } else if (text === "/events") {
      const events = await this.db.getFutureEvents()
      if (!events.results || events.results.length === 0) {
        await this.sendTelegram(chatId, "📅 No upcoming events found.")
      } else {
        let msg = "📅 <b>Upcoming Events:</b>\n\n"
        for (const e of events.results.slice(0, 10)) {
          msg += `<b>${e.title}</b>\n`
          if (e.date_iso) msg += `📆 ${e.date_iso}\n`
          if (e.summary) msg += `${e.summary}\n`
          msg += "\n"
        }
        await this.sendTelegram(chatId, msg)
      }
    }
  }

  async sendTelegram(chatId, text) {
    const token = this.env.TELEGRAM_BOT_TOKEN
    if (!token) return

    await fetch(`${this.env.TELEGRAM_API_URL}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    })
  }
}
