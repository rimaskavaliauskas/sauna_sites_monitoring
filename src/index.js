import { DatabaseService } from './services/database.js';
import { ScraperService } from './services/scraper.js';
import { AnalyzerService } from './services/analyzer.js';
import { Router } from './router.js';
import { PROMPT_FILTER_LINKS } from './lib/prompts.js';
import { classifyText } from './lib/gemini.js';

export default {
    async fetch(request, env, ctx) {
        const db = new DatabaseService(env);
        const scraper = new ScraperService(env);
        const analyzer = new AnalyzerService(env);
        const router = new Router(env, db, scraper, analyzer);

        return router.handleRequest(request, ctx);
    },

    async scheduled(event, env, ctx) {
        const db = new DatabaseService(env);
        const scraper = new ScraperService(env);
        const analyzer = new AnalyzerService(env);

        ctx.waitUntil(runMonitoringLoop(env, db, scraper, analyzer));
    }
};

async function runMonitoringLoop(env, db, scraper, analyzer) {
    const startTime = Date.now();
    let stats = {
        urls_checked: 0,
        changes_found: 0,
        llm_calls: 0,
        notifications_sent: 0,
        errors_count: 0
    };

    const urls = await db.getActiveUrls();
    stats.urls_checked = urls.length;

    for (const row of urls) {
        try {
            // 1. Scrape (Hybrid)
            const { content, links } = await scraper.scrape(row.url, row.is_dynamic);

            // 2. Analyze (Two-Level)
            const analysisResult = await analyzer.analyze(content, row.url, row.last_hash, row.last_clean_text);
            const { hasChange, newHash, newSegments, analysis } = analysisResult;

            if (hasChange && analysis) {
                stats.llm_calls++;

                // 3. Event Deduplication & Storage
                let newEvents = [];
                // Combine future and past events for storage, but we might only notify about future ones
                const allFindings = [...(analysis.future_events || []), ...(analysis.past_events || [])];

                if (allFindings.length > 0) {
                    for (const finding of allFindings) {
                        // Create unique hash for event
                        const eventHash = await analyzer.hashContent([finding.title, finding.date_iso || '', finding.price || '']);

                        const exists = await db.eventExists(eventHash);
                        if (!exists) {
                            const eventData = {
                                url_id: row.id,
                                title: finding.title,
                                description: finding.summary,
                                date_iso: finding.date_iso,
                                price_info: finding.price_info || finding.price, // Fallback
                                source_link: finding.link || row.url,
                                hash: eventHash
                            };
                            await db.addEvent(eventData);
                            // Only notify if it's NOT past (unless user wants history, but usually they want new upcoming stuff)
                            if (!finding.is_past) {
                                newEvents.push(eventData);
                            }
                        }
                    }
                }

                // 4. Notify (Event-Centric)
                if (newEvents.length > 0) {
                    stats.changes_found += newEvents.length;
                    const msg = formatEventNotification(row.url, newEvents);
                    await sendTelegram(env, null, msg);
                    stats.notifications_sent++;
                }

                // Log change summary for history
                await db.logChange(row.id, JSON.stringify(allFindings));
            }

            // Update URL state
            await db.updateUrl(row.id, newHash, newSegments);

            // 5. Discovery
            if (links && links.length > 0) {
                await discoverNewSites(env, db, row.id, row.url, links);
            }

        } catch (e) {
            console.error(`Error processing ${row.url}:`, e);
            stats.errors_count++;
            await db.logError(row.id, e.message, 'general', 'warning');
            await db.incrementErrorCount(row.id);
        }

        // Throttling
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    stats.duration_ms = Date.now() - startTime;
    await db.logTelemetry(stats);
}

function formatEventNotification(sourceUrl, events) {
    let msg = `🚨 <b>New Events Found!</b>\n\n`;

    for (const event of events) {
        msg += `<b>${event.title}</b>\n`;
        if (event.date_iso) msg += `📅 ${event.date_iso}\n`;
        if (event.price_info) msg += `💰 ${event.price_info}\n`;
        msg += `${event.description}\n`;
        if (event.source_link) msg += `🔗 <a href="${event.source_link}">More Info</a>\n`;
        msg += `\n`;
    }

    msg += `Source: ${sourceUrl}`;
    return msg;
}

async function discoverNewSites(env, db, sourceUrlId, sourceUrl, links) {
    try {
        const limitedLinks = links.slice(0, 20);
        const linksJson = JSON.stringify(limitedLinks);
        const filterPrompt = `${PROMPT_FILTER_LINKS}\n\nLinks to filter:\n${linksJson}`;

        const result = await classifyText(filterPrompt, env.GEMINI_API_KEY, PROMPT_FILTER_LINKS);
        const filteredLinks = typeof result === 'string' ? JSON.parse(result.replace(/```json|```/g, '').trim()) : result;

        if (!Array.isArray(filteredLinks) || filteredLinks.length === 0) return;

        let newCount = 0;
        for (const link of filteredLinks) {
            try {
                const res = await db.addDiscoveredUrl(sourceUrlId, link.href, link.title, link.reason);
                if (res && res.meta && res.meta.changes > 0) newCount++;
            } catch (e) { /* ignore */ }
        }

        if (newCount > 0) {
            const msg = `🔍 <b>Discovered ${newCount} new sauna site(s) from ${sourceUrl}!</b>\n\n` +
                filteredLinks.map(l => `• ${l.title}\n  ${l.reason}`).join('\n\n') +
                `\n\nUse /discoveries to review and add them.`;
            await sendTelegram(env, null, msg);
        }
    } catch (e) {
        console.error(`Discovery error for ${sourceUrl}:`, e);
    }
}

async function sendTelegram(env, chatId, text) {
    const token = env.TELEGRAM_BOT_TOKEN;
    const targetChat = chatId || env.TELEGRAM_CHAT_ID;
    if (!token || !targetChat) return;

    try {
        await fetch(`${env.TELEGRAM_API_URL}${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: targetChat,
                text,
                parse_mode: "HTML",
                disable_web_page_preview: true
            })
        });
    } catch (e) {
        console.error("Telegram Send Error:", e);
    }
}
