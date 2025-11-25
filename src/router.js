import { PROMPT_CHECK_SAUNA_RELEVANCE, PROMPT_FILTER_LINKS } from './lib/prompts.js';
import { classifyText } from './lib/gemini.js';
import { ConversationService } from './services/conversation.js';
import { ExaService } from './services/exa.js';

export class Router {
    constructor(env, dbService, scraperService, analyzerService) {
        this.env = env;
        this.db = dbService;
        this.scraper = scraperService;
        this.analyzer = analyzerService;
        this.exa = new ExaService(env.EXA_API_KEY);
        this.conversation = new ConversationService(env, dbService, this.exa, scraperService, analyzerService);
    }

    async handleRequest(request, ctx) {
        console.log(`[Router] Received ${request.method} request to ${request.url}`);

        if (request.method === "POST") {
            try {
                const url = new URL(request.url);
                console.log(`[Router] POST pathname: ${url.pathname}`);

                // Accept any POST request as webhook (Telegram can send to / or /webhook)
                const update = await request.json();
                console.log(`[Router] Received update:`, JSON.stringify(update).substring(0, 200));

                if (update.message) {
                    console.log(`[Router] Processing message from chat ${update.message.chat.id}`);
                    // Pass ctx to handleTelegramMessage
                    await this.handleTelegramMessage(update.message, ctx);
                } else {
                    console.log(`[Router] No message in update`);
                }

                return new Response("OK");
            } catch (e) {
                console.error(`[Router] Error handling POST:`, e);
                console.error(`[Router] Error stack:`, e.stack);
                return new Response("Error", { status: 500 });
            }
        }

        console.log(`[Router] Returning 404 for ${request.method} ${request.url}`);
        return new Response("Not Found", { status: 404 });
    }

    async handleTelegramMessage(message, ctx) {
        if (message.from && message.from.is_bot) return;

        const chatId = message.chat.id;
        const text = (message.text || "").trim();
        const parts = text.split(" ");
        const command = parts[0].toLowerCase();

        console.log(`[Router] Received command: ${command} from chat ${chatId}`);

        try {
            if (command === "/add" && parts[1]) {
                await this.handleAddUrl(chatId, parts[1]);
            } else if (command === "/force-add" && parts[1]) {
                await this.handleAddUrl(chatId, parts[1], true);
            } else if (command === "/list") {
                const urls = await this.db.getActiveUrls();
                if (!urls || urls.length === 0) {
                    await this.sendTelegram(chatId, "No URLs monitored.");
                } else {
                    const msg = urls.map(r => {
                        const cleanUrl = r.url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                        return `${r.id}. ${cleanUrl} [${r.active ? 'ON' : 'OFF'}]`;
                    }).join("\n");
                    await this.sendTelegram(chatId, msg);
                }
            } else if ((command === "/check" || command === "/check_now") && parts[1]) {
                let urlToCheck = parts[1];

                // Check if input is an ID (numeric)
                if (/^\d+$/.test(urlToCheck)) {
                    const urlRecord = await this.db.getUrlById(urlToCheck);
                    if (urlRecord) {
                        urlToCheck = urlRecord.url;
                        await this.sendTelegram(chatId, `🆔 Found ID ${parts[1]}: ${urlToCheck}`);
                    } else {
                        await this.sendTelegram(chatId, `❌ ID ${parts[1]} not found.`);
                        return;
                    }
                }

                await this.sendTelegram(chatId, `⏳ Checking ${urlToCheck}...`);
                await this.handleAddUrl(chatId, urlToCheck, true);
            } else if (command === "/remove" && parts[1]) {
                const id = parts[1];
                // Manually cascade delete because SQLite FKs might not have ON DELETE CASCADE
                await this.db.db.prepare("DELETE FROM events WHERE url_id = ?").bind(id).run();
                await this.db.db.prepare("DELETE FROM changes_log WHERE url_id = ?").bind(id).run();
                await this.db.db.prepare("DELETE FROM discovered_urls WHERE source_url_id = ?").bind(id).run();
                await this.db.db.prepare("DELETE FROM errors WHERE url_id = ?").bind(id).run();

                await this.db.db.prepare("DELETE FROM urls WHERE id = ?").bind(id).run();
                await this.sendTelegram(chatId, `🗑 Removed ID ${id} and all related data.`);
            } else if (command === "/scan_all") {
                await this.sendTelegram(chatId, "🚀 Starting manual scan of all monitored sites... (This runs in background)");

                // Use ctx.waitUntil to run in background and return 200 OK immediately
                if (ctx && ctx.waitUntil) {
                    ctx.waitUntil(this.handleScanAll(chatId));
                } else {
                    // Fallback for testing/local
                    this.handleScanAll(chatId);
                }
            } else if (command === "/discoveries") {
                const { results } = await this.db.db.prepare("SELECT * FROM discovered_urls WHERE status = 'pending' LIMIT 10").all();
                if (results.length === 0) {
                    await this.sendTelegram(chatId, "No pending discoveries.");
                } else {
                    let msg = `🔍 <b>Pending Discoveries (${results.length}):</b>\n\n`;
                    for (const d of results) {
                        msg += `<b>${d.id}.</b> ${d.title}\n   ${d.context}\n   <code>${d.url}</code>\n\n`;
                    }
                    msg += `To add: <code>/approve [id]</code>\nTo reject: <code>/reject [id]</code>`;
                    await this.sendTelegram(chatId, msg);
                }
            } else if (command === "/approve" && parts[1]) {
                const discovery = await this.db.db.prepare("SELECT * FROM discovered_urls WHERE id = ?").bind(parts[1]).first();
                if (discovery) {
                    await this.handleAddUrl(chatId, discovery.url, true);
                    await this.db.db.prepare("UPDATE discovered_urls SET status = 'approved' WHERE id = ?").bind(parts[1]).run();
                    await this.sendTelegram(chatId, `✅ Approved: ${discovery.title}`);
                } else {
                    await this.sendTelegram(chatId, `❌ ID ${parts[1]} not found.`);
                }
            } else if (command === "/reject" && parts[1]) {
                await this.db.db.prepare("UPDATE discovered_urls SET status = 'rejected' WHERE id = ?").bind(parts[1]).run();
                await this.sendTelegram(chatId, `❌ Rejected ID ${parts[1]}.`);
            } else if (command === "/setlang" && parts[1]) {
                const lang = parts[1].toUpperCase();
                await this.db.setSetting('language', lang);
                await this.sendTelegram(chatId, `✅ Language set to: ${lang}`);
            } else if (command === "/events") {
                const { results } = await this.db.getFutureEvents();
                if (!results || results.length === 0) {
                    await this.sendTelegram(chatId, "No events found.");
                } else {
                    const today = new Date().toISOString().split('T')[0];

                    // Dynamic filtering based on current date
                    const upcoming = results.filter(e => {
                        if (e.date_iso) return e.date_iso >= today;
                        return e.is_future === 1; // Fallback if no date
                    });

                    const recent = results.filter(e => {
                        if (e.date_iso) return e.date_iso < today;
                        return e.is_future === 0; // Fallback
                    });

                    let msg = "";

                    if (upcoming.length > 0) {
                        msg += `<b>Upcoming Events</b>\n\n`;
                        for (const event of upcoming) {
                            msg += `<b>${event.title}</b> (ID: ${event.id})\n`;
                            if (event.summary) msg += `${event.summary}\n`;
                            if (event.location) msg += `Location: ${event.location}\n`;
                            msg += `Date: ${event.date_iso || 'TBA'} | Price: ${event.price_info || 'N/A'}\n`;
                            msg += `<a href="${event.source_link}">${event.source_link}</a>\n\n`;
                        }
                    }

                    if (recent.length > 0) {
                        msg += `<b>Recent Past Events</b>\n\n`;
                        for (const event of recent) {
                            msg += `<b>${event.title}</b> (ID: ${event.id})\n`;
                            if (event.summary) msg += `${event.summary}\n`;
                            if (event.location) msg += `Location: ${event.location}\n`;
                            msg += `Date: ${event.date_iso} | Price: ${event.price_info || 'N/A'}\n`;
                            msg += `<a href="${event.source_link}">${event.source_link}</a>\n\n`;
                        }
                    }

                    await this.sendTelegram(chatId, msg);
                }
            } else if (command === "/delete_event" && parts[1]) {
                await this.db.db.prepare("DELETE FROM events WHERE id = ?").bind(parts[1]).run();
                await this.sendTelegram(chatId, `🗑 Deleted Event ID ${parts[1]}`);
            } else if (command === "/analyze_event" && parts[1]) {
                await this.sendTelegram(chatId, "🧠 Analyzing event...");

                const event = await this.db.db.prepare("SELECT * FROM events WHERE id = ?").bind(parts[1]).first();
                if (!event) {
                    await this.sendTelegram(chatId, `❌ Event ID ${parts[1]} not found.`);
                    return;
                }

                // Get language preference
                let language = await this.db.getSetting('language') || 'ENGLISH';
                const currentDate = new Date().toISOString().split('T')[0];

                // Import the prompt
                const { PROMPT_EVENT_ANALYSIS } = await import('./lib/prompts.js');

                const prompt = PROMPT_EVENT_ANALYSIS
                    .replace('{{TITLE}}', event.title || 'N/A')
                    .replace('{{SUMMARY}}', event.summary || 'N/A')
                    .replace('{{DATE}}', event.date_iso || 'TBA')
                    .replace('{{PRICE}}', event.price_info || 'N/A')
                    .replace('{{LOCATION}}', event.location || 'N/A')
                    .replace('{{LINK}}', event.source_link || 'N/A')
                    .replace('{{CURRENT_DATE}}', currentDate)
                    .replaceAll('{{LANGUAGE}}', language);

                try {
                    const { classifyText } = await import('./lib/gemini.js');
                    const analysis = await classifyText('', this.env.GEMINI_API_KEY, prompt);

                    let msg = `📊 <b>Detailed Analysis: ${event.title}</b>\n\n`;
                    msg += analysis;
                    msg += `\n\n🔗 <a href="${event.source_link}">Event Link</a>`;

                    await this.sendTelegram(chatId, msg);
                } catch (e) {
                    await this.sendTelegram(chatId, `❌ Analysis failed: ${e.message}`);
                }
            } else {
                await this.sendTelegram(chatId, "🤔 Thinking...");
                // Try natural language command first
                const lowerText = text.toLowerCase();
                const addMatch = lowerText.match(/^(?:add|monitor|track)\s+(https?:\/\/[^\s]+)/i);

                if (addMatch) {
                    await this.handleAddUrl(chatId, addMatch[1]);
                } else {
                    // Fallback to conversational LLM
                    await this.handleConversation(chatId, text);
                }
            }
        } catch (e) {
            console.error("Handler Error:", e);
            await this.sendTelegram(chatId, `❌ Error: ${e.message}`);
        }
    }

    async handleScanAll(chatId) {
        const urls = await this.db.getActiveUrls();
        if (!urls || urls.length === 0) {
            await this.sendTelegram(chatId, "No URLs to scan.");
            return;
        }

        await this.sendTelegram(chatId, `📋 Scanning ${urls.length} sites. This may take a while...`);
        let changesCount = 0;
        let errorsCount = 0;

        for (const row of urls) {
            try {
                // 1. Scrape
                const { content, links } = await this.scraper.scrape(row.url, row.is_dynamic);

                // 2. Analyze
                const analysisResult = await this.analyzer.analyze(content, row.url, row.last_hash, row.last_clean_text);
                const { hasChange, newHash, newSegments, analysis } = analysisResult;

                if (hasChange && analysis) {
                    // 3. Store Events
                    let newEvents = [];
                    const urlRecord = await this.db.db.prepare("SELECT id FROM urls WHERE url = ?").bind(row.url).first();

                    // Future Events
                    const today = new Date().toISOString().split('T')[0];

                    for (const finding of (analysis.future_events || [])) {
                        // Double check date to prevent AI hallucinations
                        let isActuallyFuture = 1;
                        if (finding.date_iso && finding.date_iso < today) {
                            isActuallyFuture = 0;
                        }

                        const eventHash = await this.analyzer.hashContent([finding.title || 'Untitled', finding.date_iso || '', finding.price || '']);

                        // Check for exact hash match OR similar event
                        const exists = await this.db.eventExists(eventHash);
                        const similarId = await this.db.findSimilarEvent(finding.date_iso, finding.title);

                        if (!exists && !similarId) {
                            await this.db.addEvent({
                                url_id: urlRecord.id,
                                title: finding.title || 'Untitled',
                                summary: finding.summary || '',
                                description: finding.summary || '',
                                date_iso: finding.date_iso || null,
                                price_info: finding.price_info || finding.price || null,
                                location: finding.location || null,
                                source_link: finding.link || row.url,
                                hash: eventHash,
                                is_future: isActuallyFuture
                            });
                            if (isActuallyFuture) newEvents.push(finding);
                        }
                    }

                    // Past Events
                    for (const finding of (analysis.past_events || [])) {
                        const eventHash = await this.analyzer.hashContent([finding.title || 'Untitled', finding.date_iso || '', finding.price || '']);
                        if (!(await this.db.eventExists(eventHash))) {
                            await this.db.addEvent({
                                url_id: urlRecord.id,
                                title: finding.title || 'Untitled',
                                summary: finding.summary || '',
                                description: finding.summary || '',
                                date_iso: finding.date_iso || null,
                                price_info: finding.price_info || finding.price || null,
                                location: finding.location || null,
                                source_link: finding.link || row.url,
                                hash: eventHash,
                                is_future: 0
                            });
                        }
                    }

                    if (newEvents.length > 0) {
                        changesCount++;
                        let msg = `🚨 <b>New Events Found at ${row.url}</b>\n\n`;
                        for (const e of newEvents) {
                            msg += `• <b>${e.title}</b>\n`;
                            if (e.summary) msg += `  ${e.summary}\n`;
                            if (e.location) msg += `  📍 ${e.location}\n`;
                            msg += `  📅 ${e.date_iso || 'TBA'} | 💰 ${e.price_info || 'N/A'}\n\n`;
                        }
                        await this.sendTelegram(chatId, msg);
                    }
                }

                // Update URL
                await this.db.updateUrl(row.id, newHash, newSegments);

            } catch (e) {
                console.error(`Error scanning ${row.url}:`, e);
                errorsCount++;
            }

            // Throttle slightly
            await new Promise(r => setTimeout(r, 2000));
        }

        await this.sendTelegram(chatId, `✅ Scan complete.\nSites checked: ${urls.length}\nNew updates: ${changesCount}\nErrors: ${errorsCount}`);
    }

    async handleConversation(chatId, text) {
        try {
            const language = await this.db.getSetting('language') || 'ENGLISH';
            const response = await this.conversation.chat(text, language);
            await this.sendTelegram(chatId, response);
        } catch (e) {
            console.error("Conversation Error:", e);
            await this.sendTelegram(chatId, `❌ I had trouble thinking about that: ${e.message}`);
        }
    }

    async handleAddUrl(chatId, url, skipCheck = false) {
        const existing = await this.db.db.prepare("SELECT id FROM urls WHERE url = ?").bind(url).first();
        if (existing) await this.sendTelegram(chatId, `ℹ️ Already monitored. Re-analyzing...`);

        let result;
        try {
            result = await this.scraper.scrape(url);
        } catch (e) {
            await this.sendTelegram(chatId, `❌ Failed to fetch ${url}: ${e.message}`);
            return;
        }

        const content = result.content;

        if (!existing && !skipCheck) {
            const previewText = content.substring(0, 2000);
            const isSaunaRelated = await classifyText(previewText, this.env.GEMINI_API_KEY, PROMPT_CHECK_SAUNA_RELEVANCE);

            if (isSaunaRelated === false) {
                await this.sendTelegram(chatId,
                    `⚠️ <b>Not Added:</b> This site doesn't appear to be sauna/spa related.\n\n` +
                    `If you still want to monitor it, use:\n<code>/force-add ${url}</code>`
                );
                return;
            }
        }

        // Analyze immediately
        const analysisResult = await this.analyzer.analyze(content, url, null, null);
        const { newHash, newSegments, analysis } = analysisResult;

        try {
            if (existing) {
                await this.db.updateUrl(existing.id, newHash, newSegments);
            } else {
                await this.db.addUrl(url, newHash, newSegments);
                await this.sendTelegram(chatId, `✅ Added ${url}.`);
            }

            if (analysis) {
                const urlRecord = existing || await this.db.db.prepare("SELECT id FROM urls WHERE url = ?").bind(url).first();

                // Future
                const today = new Date().toISOString().split('T')[0];

                // Collect event IDs for display
                const eventIds = [];
                for (const finding of (analysis.future_events || [])) {
                    let isActuallyFuture = 1;
                    if (finding.date_iso && finding.date_iso < today) {
                        isActuallyFuture = 0;
                    }

                    const eventHash = await this.analyzer.hashContent([finding.title || 'Untitled', finding.date_iso || '', finding.price || '']);
                    const exists = await this.db.eventExists(eventHash);
                    const similarId = await this.db.findSimilarEvent(finding.date_iso, finding.title);

                    let eventId;
                    if (!exists && !similarId) {
                        const result = await this.db.addEvent({
                            url_id: urlRecord.id,
                            title: finding.title || 'Untitled',
                            summary: finding.summary || '',
                            description: finding.summary || '',
                            date_iso: finding.date_iso || null,
                            price_info: finding.price_info || finding.price || null,
                            location: finding.location || null,
                            source_link: finding.link || url,
                            hash: eventHash,
                            is_future: isActuallyFuture
                        });
                        eventId = result.meta.last_row_id;
                    } else if (similarId) {
                        eventId = similarId;
                    } else {
                        // Get ID from existing event
                        const existingEvent = await this.db.db.prepare("SELECT id FROM events WHERE hash = ?").bind(eventHash).first();
                        eventId = existingEvent?.id;
                    }

                    eventIds.push({ ...finding, id: eventId });
                }

                // Past
                for (const finding of (analysis.past_events || [])) {
                    const eventHash = await this.analyzer.hashContent([finding.title || 'Untitled', finding.date_iso || '', finding.price || '']);
                    if (!(await this.db.eventExists(eventHash))) {
                        await this.db.addEvent({
                            url_id: urlRecord.id,
                            title: finding.title || 'Untitled',
                            summary: finding.summary || '',
                            description: finding.summary || '',
                            date_iso: finding.date_iso || null,
                            price_info: finding.price_info || finding.price || null,
                            location: finding.location || null,
                            source_link: finding.link || url,
                            hash: eventHash,
                            is_future: 0
                        });
                    }
                }

                let msg = `🔎 <b>Analysis for ${url}</b>\n`;
                if (eventIds.length > 0) {
                    msg += `<b>📅 Upcoming Events & Offers</b>\n`;
                    for (const item of eventIds) {
                        msg += `• <b>${item.title}</b> (${item.type})`;
                        if (item.id) msg += ` [ID: ${item.id}]`;
                        msg += `\n`;
                        if (item.summary) msg += `  <i>${item.summary}</i>\n`;
                        if (item.location) msg += `  📍 ${item.location}\n`;
                    }
                } else {
                    msg += `<i>No future events detected.</i>\n`;
                }
                await this.sendTelegram(chatId, msg);
            } else {
                await this.sendTelegram(chatId, `✅ Analysis complete. No specific offers found right now.`);
            }

        } catch (e) {
            await this.sendTelegram(chatId, `❌ Error adding URL: ${e.message}`);
        }
    }

    async sendTelegram(chatId, text) {
        const token = this.env.TELEGRAM_BOT_TOKEN;
        if (!token || !chatId) return;

        try {
            await fetch(`${this.env.TELEGRAM_API_URL}${token}/sendMessage`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text,
                    parse_mode: "HTML",
                    disable_web_page_preview: true
                })
            });
        } catch (e) {
            console.error("[sendTelegram] Error:", e);
        }
    }
}
