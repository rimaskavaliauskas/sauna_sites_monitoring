import { launchBrowser, searchFlights } from './browser.js';

export default {
    async fetch(request, env, ctx) {
        // Handle Telegram Webhook
        if (request.method === 'POST') {
            try {
                const update = await request.json();
                if (update.message && update.message.text) {
                    const chatId = update.message.chat.id;
                    const text = update.message.text;

                    if (text.startsWith('/')) {
                        // Handle Commands
                        if (text === '/check') {
                            ctx.waitUntil(this.runCheck(env, chatId));
                            return new Response('Checking flights...');
                        }
                        if (text === '/start') {
                            await this.sendTelegram(env, chatId, "Welcome! I am your Airline Deal Monitor.\n\nYou can say things like:\n\"Add route Vilnius to Milan under 50 EUR\"\n\"Check flights now\"");
                            return new Response('OK');
                        }
                    } else {
                        // Handle Natural Language via LLM
                        ctx.waitUntil(this.handleMessage(env, chatId, text));
                    }
                }
            } catch (e) {
                console.error('Webhook Error:', e);
            }
            return new Response('OK');
        }
        return new Response('Airline Monitor Worker');
    },

    async handleMessage(env, chatId, text) {
        try {
            // 1. Call Gemini to parse intent
            const prompt = `
            You are a smart assistant for an airline deal monitor.
            User Input: "${text}"
            
            Extract the following JSON:
            {
                "intent": "ADD_ROUTE" | "REMOVE_ROUTE" | "LIST_ROUTES" | "OTHER",
                "origin": "City or Airport Code (e.g. VNO)",
                "destination": "City or Airport Code (e.g. BGY)",
                "max_price": number (or null),
                "currency": "EUR" (default),
                "airline": "Airline Name" (or null),
                "response": "A helpful response if intent is OTHER"
            }
            If the user just wants to chat, set intent to "OTHER" and provide a helpful response in "response" field.
            Return ONLY raw JSON.
            `;

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Gemini API Error ${response.status}: ${errText}`);
            }

            const data = await response.json();
            const rawText = data.candidates[0].content.parts[0].text;
            const cleanJson = rawText.replace(/```json|```/g, '').trim();
            const result = JSON.parse(cleanJson);

            // 2. Act on Intent
            if (result.intent === 'ADD_ROUTE') {
                if (!result.origin || !result.destination) {
                    await this.sendTelegram(env, chatId, "I couldn't understand the origin or destination. Please try again.");
                    return;
                }

                await env.DB.prepare(
                    "INSERT INTO routes (origin, destination, max_price, airline) VALUES (?, ?, ?, ?)"
                ).bind(result.origin, result.destination, result.max_price, result.airline).run();

                await this.sendTelegram(env, chatId, `✅ Added route: ${result.origin} -> ${result.destination} (Max: ${result.max_price || 'Any'})`);
            } else if (result.intent === 'LIST_ROUTES') {
                const { results } = await env.DB.prepare("SELECT * FROM routes WHERE is_active = 1").all();
                if (results.length === 0) {
                    await this.sendTelegram(env, chatId, "No active routes.");
                } else {
                    const list = results.map(r => `- ${r.origin} -> ${r.destination} (< ${r.max_price || 'Any'})`).join('\n');
                    await this.sendTelegram(env, chatId, `📅 Monitored Routes:\n${list}`);
                }
            } else {
                await this.sendTelegram(env, chatId, result.response || "I didn't understand that. Try 'Add route VNO to BGY'.");
            }

        } catch (e) {
            console.error('LLM Error:', e);
            await this.sendTelegram(env, chatId, `⚠️ Error: ${e.message}`);
        }
    },

    async scheduled(event, env, ctx) {
        ctx.waitUntil(this.runCheck(env));
    },

    async runCheck(env, targetChatId = null) {
        console.log('Starting flight check...');
        let browser;
        try {
            browser = await launchBrowser(env);

            // Get active routes from D1
            const { results: routes } = await env.DB.prepare(
                "SELECT * FROM routes WHERE is_active = 1"
            ).all();

            if (!routes || routes.length === 0) {
                console.log('No active routes found.');
                return;
            }

            for (const route of routes) {
                console.log(`Checking ${route.origin} -> ${route.destination}`);
                const deals = await searchFlights(browser, route.origin, route.destination, '2024-05-01'); // Date hardcoded for MVP

                for (const deal of deals) {
                    console.log(`Found deal: ${deal.price} ${deal.currency} (Max: ${route.max_price})`);
                    // Check if price is good
                    if (!route.max_price || deal.price <= route.max_price) {
                        // Check for duplicates
                        const exists = await env.DB.prepare(
                            "SELECT id FROM deals WHERE route_id = ? AND flight_date = ? AND price = ?"
                        ).bind(route.id, deal.date, deal.price).first();

                        if (!exists) {
                            console.log('New deal! Saving and notifying...');
                            // Save to DB
                            await env.DB.prepare(
                                "INSERT INTO deals (route_id, flight_date, price, currency, flight_number) VALUES (?, ?, ?, ?, ?)"
                            ).bind(route.id, deal.date, deal.price, deal.currency, deal.flight_number).run();

                            // Notify
                            if (targetChatId || env.TARGET_CHAT_ID) {
                                const msg = `✈️ Deal Found!\n\n${route.origin} -> ${route.destination}\nPrice: ${deal.price} ${deal.currency}\nDate: ${deal.date}\nFlight: ${deal.flight_number}`;
                                await this.sendTelegram(env, targetChatId || env.TARGET_CHAT_ID, msg);
                            }
                        } else {
                            console.log('Deal already exists in DB. Skipping.');
                        }
                    } else {
                        console.log('Price too high. Skipping.');
                    }
                }
            }

        } catch (e) {
            console.error('Run Check Error:', e);
            if (targetChatId) {
                await this.sendTelegram(env, targetChatId, `⚠️ Check Failed: ${e.message}`);
            }
        } finally {
            if (browser) await browser.close();
        }
    },

    async sendTelegram(env, chatId, text) {
        const url = `${env.TELEGRAM_API_URL}${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text })
        });
    }
};
