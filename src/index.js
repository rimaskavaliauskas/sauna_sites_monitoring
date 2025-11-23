import { segmentText } from './lib/cleaner.js';
import { findNewSegments, hashContent } from './lib/differ.js';
import { classifyText } from './lib/gemini.js';
import { fetchPage } from './lib/fetcher.js'; // Keep for fallback or lightweight checks
import { scrapePage } from './lib/browser.js';
import {
    PROMPT_SEMANTIC_CLASSIFIER,
    PROMPT_KEYWORDS,
    PROMPT_INTENT_RECOGNITION,
    PROMPT_EXTRACT_STRUCTURED,
    PROMPT_CHECK_SAUNA_RELEVANCE,
    PROMPT_DEEP_ANALYSIS,
    PROMPT_FILTER_LINKS
} from './lib/prompts.js';

// Configuration
const MAX_SEGMENTS_PER_ANALYSIS = 10;

export default {
    async fetch(request, env, ctx) {
        if (request.method === "POST") {
            try {
                const update = await request.json();
                if (update.message && update.message.text) {
                    await handleTelegramMessage(update.message, env);
                }
                return new Response("OK");
            } catch (e) {
                console.error("Webhook Error:", e);
                return new Response("Error", { status: 500 });
            }
        }
        return new Response("Agent Worker Running");
    },

    async scheduled(event, env, ctx) {
        ctx.waitUntil(runMonitoringLoop(env));
    }
};

async function handleTelegramMessage(message, env) {
    const chatId = message.chat.id;
    const text = message.text.trim();
    const parts = text.split(" ");
    const command = parts[0];

    try {
        if (command === "/add" && parts[1]) {
            await handleAddUrl(env, chatId, parts[1]);
        } else if (command === "/force-add" && parts[1]) {
            await handleAddUrl(env, chatId, parts[1], true); // Skip sauna check
        } else if (command === "/list") {
            const { results } = await env.DB.prepare("SELECT id, url, active FROM urls").all();
            const msg = results.map(r => `${r.id}. ${r.url} [${r.active ? 'ON' : 'OFF'}]`).join("\n") || "No URLs.";
            await sendTelegram(env, chatId, msg);
        } else if (command === "/remove" && parts[1]) {
            await env.DB.prepare("DELETE FROM urls WHERE id = ?").bind(parts[1]).run();
            await sendTelegram(env, chatId, `🗑 Removed ID ${parts[1]}`);
        } else if (command === "/test" && parts[1]) {
            await sendTelegram(env, chatId, "⏳ Test run started...");
            await runMonitoringLoop(env);
            await sendTelegram(env, chatId, "✅ Test run complete.");
        } else if (command === "/discoveries") {
            const { results } = await env.DB.prepare("SELECT * FROM discovered_urls WHERE status = 'pending' LIMIT 10").all();
            if (results.length === 0) {
                await sendTelegram(env, chatId, "No pending discoveries.");
            } else {
                let msg = `🔍 <b>Pending Discoveries (${results.length}):</b>\n\n`;
                for (const d of results) {
                    msg += `<b>${d.id}.</b> ${d.title}\n`;
                    msg += `   ${d.context}\n`;
                    msg += `   <code>${d.url}</code>\n\n`;
                }
                msg += `To add: <code>/approve [id]</code>\nTo reject: <code>/reject [id]</code>`;
                await sendTelegram(env, chatId, msg);
            }
        } else if (command === "/approve" && parts[1]) {
            const discovery = await env.DB.prepare("SELECT * FROM discovered_urls WHERE id = ?").bind(parts[1]).first();
            if (!discovery) {
                await sendTelegram(env, chatId, `❌ Discovery ID ${parts[1]} not found.`);
            } else {
                await handleAddUrl(env, chatId, discovery.url, true);
                await env.DB.prepare("UPDATE discovered_urls SET status = 'approved' WHERE id = ?").bind(parts[1]).run();
                await sendTelegram(env, chatId, `✅ Approved and added: ${discovery.title}`);
            }
        } else if (command === "/reject" && parts[1]) {
            await env.DB.prepare("UPDATE discovered_urls SET status = 'rejected' WHERE id = ?").bind(parts[1]).run();
            await sendTelegram(env, chatId, `❌ Rejected discovery ID ${parts[1]}.`);
        } else if (text.toLowerCase() === "test") {
            await sendTelegram(env, chatId, "🔔 Random Reminder!");
        } else {
            await sendTelegram(env, chatId, "🤔 Thinking...");
            await handleNaturalLanguage(env, chatId, text);
        }
    } catch (e) {
        console.error("Handler Error:", e);
        await sendTelegram(env, chatId, `❌ Error: ${e.message}`);
    }
}

async function handleNaturalLanguage(env, chatId, text) {
    // Optimization: Check for simple commands via Regex to save LLM calls
    const lowerText = text.toLowerCase();

    // Regex for ADD: "add <url>" or "monitor <url>"
    const addMatch = lowerText.match(/^(?:add|monitor|track)\s+(https?:\/\/[^\s]+)/i);
    if (addMatch) {
        await handleAddUrl(env, chatId, addMatch[1]);
        return;
    }

    // Regex for REMOVE: "remove <id>" or "remove <url>"
    const removeMatch = lowerText.match(/^(?:remove|delete|stop tracking)\s+(?:id\s*)?(\S+)/i);
    if (removeMatch) {
        const target = removeMatch[1];
        if (/^\d+$/.test(target)) {
            await env.DB.prepare("DELETE FROM urls WHERE id = ?").bind(target).run();
            await sendTelegram(env, chatId, `🗑 Removed ID ${target}`);
        } else {
            const normalizedUrl = target.replace(/^https?:\/\/(www\.)?/, '');
            const deleted = await env.DB.prepare("DELETE FROM urls WHERE url LIKE ?").bind(`%${normalizedUrl}%`).run();
            if (deleted.meta.changes > 0) await sendTelegram(env, chatId, `🗑 Removed ${target}`);
            else await sendTelegram(env, chatId, `❌ Could not find ${target}`);
        }
        return;
    }

    // Regex for LIST: "list", "show sites", "my urls"
    if (/^(list|show|my)\s*(sites|urls|list)?$/i.test(lowerText)) {
        const { results } = await env.DB.prepare("SELECT id, url, active FROM urls").all();
        await sendTelegram(env, chatId, results.map(r => `${r.id}. ${r.url} [${r.active ? 'ON' : 'OFF'}]`).join("\n") || "No URLs.");
        return;
    }

    try {
        const intentJson = await classifyText(text, env.GEMINI_API_KEY, PROMPT_INTENT_RECOGNITION);
        let result = typeof intentJson === 'string' ? JSON.parse(intentJson.replace(/```json|```/g, '').trim()) : intentJson;

        switch (result.intent) {
            case "ADD_URL":
                if (result.url) await handleAddUrl(env, chatId, result.url);
                else await sendTelegram(env, chatId, "I understood you want to add a URL, but couldn't find it.");
                break;
            case "REMOVE_URL":
                if (result.id) {
                    await env.DB.prepare("DELETE FROM urls WHERE id = ?").bind(result.id).run();
                    await sendTelegram(env, chatId, `🗑 Removed ID ${result.id}`);
                } else if (result.url) {
                    const normalizedUrl = result.url.replace(/^https?:\/\/(www\.)?/, '');
                    const deleted = await env.DB.prepare("DELETE FROM urls WHERE url LIKE ?").bind(`%${normalizedUrl}%`).run();
                    if (deleted.meta.changes > 0) await sendTelegram(env, chatId, `🗑 Removed ${result.url}`);
                    else await sendTelegram(env, chatId, `❌ Could not find ${result.url}`);
                } else {
                    await sendTelegram(env, chatId, "Please specify the ID or URL to remove.");
                }
                break;
            case "LIST_URLS":
                const { results } = await env.DB.prepare("SELECT id, url, active FROM urls").all();
                await sendTelegram(env, chatId, results.map(r => `${r.id}. ${r.url} [${r.active ? 'ON' : 'OFF'}]`).join("\n") || "No URLs.");
                break;
            case "TEST_RUN":
                await sendTelegram(env, chatId, "⏳ Starting test...");
                await runMonitoringLoop(env);
                await sendTelegram(env, chatId, "✅ Test complete.");
                break;
            case "CHAT":
            case "HELP":
                await sendTelegram(env, chatId, result.reply || "I'm here to help!");
                break;
            default:
                await sendTelegram(env, chatId, "Try /help.");
        }
    } catch (e) {
        if (e.message.includes("429")) {
            await sendTelegram(env, chatId, "⏳ Rate limit exceeded. Please wait a minute.");
        } else {
            console.error("NL Error:", e);
            await sendTelegram(env, chatId, "Sorry, I had trouble understanding that.");
        }
    }
}

async function handleAddUrl(env, chatId, url, skipCheck = false) {
    const existing = await env.DB.prepare("SELECT id FROM urls WHERE url = ?").bind(url).first();
    if (existing) await sendTelegram(env, chatId, `ℹ️ Already monitored. Re-analyzing...`);

    // Use Browser Rendering for initial fetch to get full content
    let result;
    try {
        result = await scrapePage(env, url);
    } catch (e) {
        console.error("Browser scrape failed, falling back to fetch:", e);
        const rawContent = await fetchPage(url);
        result = { content: rawContent, links: [] };
    }

    const content = result.content;

    if (!content) {
        await sendTelegram(env, chatId, `❌ Failed to fetch ${url}`);
        return;
    }

    // Sauna Check
    if (!existing && !skipCheck) {
        // Use a smaller chunk for classification to save tokens/time
        const previewText = content.substring(0, 2000);
        const isSaunaRelated = await classifyText(previewText, env.GEMINI_API_KEY, PROMPT_CHECK_SAUNA_RELEVANCE);

        // classifyText returns a boolean for Yes/No prompts
        if (isSaunaRelated === false) {
            await sendTelegram(env, chatId,
                `⚠️ <b>Not Added:</b> This site doesn't appear to be sauna/spa related.\n\n` +
                `If you still want to monitor it, use:\n<code>/force-add ${url}</code>`
            );
            return;
        }
    }

    const segments = segmentText(content);
    const hash = await hashContent(segments);

    try {
        if (existing) {
            await env.DB.prepare("UPDATE urls SET last_hash = ?, last_clean_text = ? WHERE url = ?")
                .bind(hash, JSON.stringify(segments), url).run();
        } else {
            await env.DB.prepare("INSERT INTO urls (url, last_hash, last_clean_text) VALUES (?, ?, ?)")
                .bind(url, hash, JSON.stringify(segments)).run();
            await sendTelegram(env, chatId, `✅ Added ${url}. Performing Deep Analysis...`);
        }

        // Deep Analysis
        const analysis = await analyzePageContent(env, content, url);
        if (analysis.findings && analysis.findings.length > 0) {
            const msg = formatDeepResults(url, analysis);
            await sendTelegram(env, chatId, msg);
        } else {
            await sendTelegram(env, chatId, `✅ Analysis complete. No specific offers found right now.`);
        }

    } catch (e) {
        await sendTelegram(env, chatId, `❌ Error adding URL: ${e.message}`);
    }
}

// New Deep Analysis Function
async function analyzePageContent(env, content, url) {
    // We send the full content (or a large chunk) to Gemini
    // Truncate to avoid token limits if necessary (Gemini Flash Lite has 1M context, so we are likely fine)
    const safeContent = content.substring(0, 100000);

    try {
        const result = await classifyText(safeContent, env.GEMINI_API_KEY, PROMPT_DEEP_ANALYSIS);
        const parsed = typeof result === 'string' ? JSON.parse(result.replace(/```json|```/g, '').trim()) : result;
        return parsed;
    } catch (e) {
        console.error("Deep Analysis Error:", e);
        return { findings: [] };
    }
}

function formatDeepResults(url, analysis) {
    let msg = `🔎 <b>Analysis for ${url}</b>\n`;
    if (analysis.site_category) msg += `<i>Category: ${analysis.site_category}</i>\n\n`;

    for (const item of analysis.findings) {
        msg += `<b>${item.title}</b> (${item.type})\n`;
        msg += `${item.summary}\n`;

        const details = [];
        if (item.date) details.push(`📅 ${item.date}`);
        if (item.price) details.push(`💰 ${item.price}`);
        if (item.relevance_score) details.push(`⭐ ${item.relevance_score}/10`);

        if (details.length > 0) msg += `${details.join(' | ')}\n`;

        const link = item.link || url;
        msg += `🔗 <a href="${link}">Read more</a>\n\n`;
    }
    return msg.trim();
}

async function runMonitoringLoop(env) {
    const startTime = Date.now();
    let changesFound = 0, llmCalls = 0, notificationsSent = 0;
    const { results: urls } = await env.DB.prepare("SELECT * FROM urls WHERE active = 1").all();
    const notifications = [];

    for (const row of urls) {
        try {
            // Use Browser Rendering
            let result;
            try {
                result = await scrapePage(env, row.url);
            } catch (e) {
                console.error(`Scrape failed for ${row.url}, fallback to fetch`, e);
                const rawContent = await fetchPage(row.url);
                result = { content: rawContent, links: [] };
            }

            const content = result.content;
            const links = result.links || [];

            if (!content) {
                await env.DB.prepare("UPDATE urls SET error_count = error_count + 1 WHERE id = ?").bind(row.id).run();
                continue;
            }

            const newSegments = segmentText(content);
            const newHash = await hashContent(newSegments);

            if (newHash === row.last_hash) continue; // No change

            // Deep Analysis on Change
            const analysis = await analyzePageContent(env, content, row.url);
            llmCalls++; // Count the deep analysis call

            if (analysis.findings && analysis.findings.length > 0) {
                changesFound += analysis.findings.length;
                notifications.push({ url: row.url, analysis: analysis });

                await env.DB.prepare("INSERT INTO changes_log (url_id, change_summary) VALUES (?, ?)")
                    .bind(row.id, JSON.stringify(analysis.findings)).run();
            }

            await env.DB.prepare("UPDATE urls SET last_hash = ?, last_clean_text = ?, error_count = 0 WHERE id = ?")
                .bind(newHash, JSON.stringify(newSegments), row.id).run();

            // Discovery: Extract and filter external links
            if (links.length > 0) {
                await discoverNewSites(env, row.id, row.url, links);
            }

        } catch (e) {
            console.error(`Error processing ${row.url}:`, e);
            await env.DB.prepare("INSERT INTO errors (url_id, error_message) VALUES (?, ?)").bind(row.id, e.message).run();
        }

        // Throttling: Wait 10 seconds between checks to respect Gemini Rate Limits
        await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Send Notifications
    for (const note of notifications) {
        const msg = formatDeepResults(note.url, note.analysis);
        await sendTelegram(env, null, msg);
        notificationsSent++;
    }

    const duration = Date.now() - startTime;
    await env.DB.prepare(
        "INSERT INTO telemetry (urls_checked, changes_found, llm_calls, notifications_sent, duration_ms) VALUES (?, ?, ?, ?, ?)"
    ).bind(urls.length, changesFound, llmCalls, notificationsSent, duration).run();
}

async function discoverNewSites(env, sourceUrlId, sourceUrl, links) {
    try {
        // Limit to first 20 links to avoid overwhelming the AI
        const limitedLinks = links.slice(0, 20);

        // Filter links with AI
        const linksJson = JSON.stringify(limitedLinks);
        const filterPrompt = `${PROMPT_FILTER_LINKS}\n\nLinks to filter:\n${linksJson}`;

        const result = await classifyText(filterPrompt, env.GEMINI_API_KEY, PROMPT_FILTER_LINKS);
        const filteredLinks = typeof result === 'string' ? JSON.parse(result.replace(/```json|```/g, '').trim()) : result;

        if (!Array.isArray(filteredLinks) || filteredLinks.length === 0) return;

        // Store discoveries
        for (const link of filteredLinks) {
            try {
                await env.DB.prepare(
                    "INSERT OR IGNORE INTO discovered_urls (source_url_id, url, title, context) VALUES (?, ?, ?, ?)"
                ).bind(sourceUrlId, link.href, link.title, link.reason).run();
            } catch (e) {
                // Ignore duplicates
            }
        }

        // Notify user
        if (filteredLinks.length > 0) {
            const msg = `🔍 <b>Discovered ${filteredLinks.length} new sauna site(s) from ${sourceUrl}!</b>\n\n` +
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
            body: JSON.stringify({ chat_id: targetChat, text, parse_mode: "HTML" })
        });
    } catch (e) {
        console.error("Telegram Send Error:", e);
    }
}
