import { PROMPT_CONVERSATION } from '../lib/prompts.js';

export class ConversationService {
    constructor(env, dbService, exaService, scraperService, analyzerService) {
        this.env = env;
        this.db = dbService;
        this.exa = exaService;
        this.scraper = scraperService;
        this.analyzer = analyzerService;
    }

    async chat(userMessage, language = 'ENGLISH') {
        const currentDate = new Date().toISOString().split('T')[0];
        const systemPrompt = PROMPT_CONVERSATION
            .replace('{{DATE}}', currentDate)
            .replace('{{LANGUAGE}}', language);

        const tools = [
            {
                name: "query_database",
                description: "Query the database for events, URLs, or statistics. Use this to answer questions about what is being monitored.",
                parameters: {
                    type: "object",
                    properties: {
                        query_type: {
                            type: "string",
                            enum: ["events", "urls", "stats"],
                            description: "The type of data to query"
                        },
                        filters: {
                            type: "object",
                            description: "Optional filters (e.g., { is_future: true } for events, { active: true } for urls)"
                        }
                    },
                    required: ["query_type"]
                }
            },
            {
                name: "search_exa",
                description: "Search the web for NEW sauna/spa sites or information using Exa.",
                parameters: {
                    type: "object",
                    properties: {
                        query: {
                            type: "string",
                            description: "The search query"
                        },
                        num_results: {
                            type: "number",
                            description: "Number of results to return (default 5)"
                        }
                    },
                    required: ["query"]
                }
            },
            {
                name: "get_url_details",
                description: "Get detailed information about a specific monitored URL by its ID.",
                parameters: {
                    type: "object",
                    properties: {
                        url_id: {
                            type: "number",
                            description: "The ID of the URL to retrieve"
                        }
                    },
                    required: ["url_id"]
                }
            },
            {
                name: "analyze_url",
                description: "Visit and analyze a specific external URL to extract events or details. Use this when the user asks to check a link or when you find a link via search.",
                parameters: {
                    type: "object",
                    properties: {
                        url: {
                            type: "string",
                            description: "The URL to visit and analyze"
                        }
                    },
                    required: ["url"]
                }
            },
            {
                name: "analyze_event_by_id",
                description: "Deeply analyze a specific event from the database by its ID. Visits the source link and provides a detailed report.",
                parameters: {
                    type: "object",
                    properties: {
                        event_id: {
                            type: "number",
                            description: "The ID of the event to analyze"
                        }
                    },
                    required: ["event_id"]
                }
            }
        ];

        // 1. Call LLM with tools
        const llmResponse = await this.callLLM(systemPrompt, userMessage, tools);

        // 2. Check for function call
        if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
            const toolCall = llmResponse.tool_calls[0]; // Handle one tool call for now
            const functionName = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);

            console.log(`[Conversation] Executing tool: ${functionName}`, args);
            let toolResult;

            try {
                toolResult = await this.executeTool(functionName, args);
            } catch (e) {
                console.error(`[Conversation] Tool execution error:`, e);
                toolResult = { error: e.message };
            }

            // 3. Call LLM again with result
            const finalResponse = await this.callLLM(
                systemPrompt,
                userMessage,
                tools,
                [
                    { role: "model", parts: [{ functionCall: { name: functionName, args: args } }] },
                    { role: "function", parts: [{ functionResponse: { name: functionName, response: { content: toolResult } } }] }
                ]
            );
            return finalResponse.text;
        }

        return llmResponse.text;
    }

    async executeTool(name, args) {
        switch (name) {
            case 'query_database':
                return await this.queryDatabase(args.query_type, args.filters);
            case 'search_exa':
                if (!this.exa) return { error: "Exa service not configured" };
                return await this.exa.search(args.query, args.num_results);
            case 'get_url_details':
                return await this.db.db.prepare("SELECT * FROM urls WHERE id = ?").bind(args.url_id).first();
            case 'analyze_url':
                if (!this.scraper || !this.analyzer) return { error: "Scraper/Analyzer not configured" };
                try {
                    const result = await this.scraper.scrape(args.url);
                    const analysis = await this.analyzer.analyze(result.content, args.url, null, null);
                    return analysis.analysis; // Return the structured analysis (events, insights)
                } catch (e) {
                    return { error: `Failed to analyze URL: ${e.message}` };
                }
            case 'analyze_event_by_id':
                if (!this.scraper || !this.analyzer) return { error: "Scraper/Analyzer not configured" };
                try {
                    // 1. Get event from DB
                    const event = await this.db.db.prepare("SELECT * FROM events WHERE id = ?").bind(args.event_id).first();
                    if (!event) return { error: `Event ID ${args.event_id} not found.` };
                    if (!event.source_link) return { error: `Event ID ${args.event_id} has no source link.` };

                    // 2. Scrape the source link
                    const result = await this.scraper.scrape(event.source_link);

                    // 3. Analyze specifically for this event context
                    // We reuse the analyzer but maybe we want a specific prompt? 
                    // For now, let's use the standard analysis which returns a summary.
                    // Or better: return the raw text content (truncated) so the LLM can summarize it using PROMPT_EVENT_ANALYSIS logic in the chat response.
                    // Actually, let's return the scraped text snippet so the LLM can answer the user's specific question.

                    return {
                        event_title: event.title,
                        source_link: event.source_link,
                        page_content: result.content.substring(0, 20000) // Increased limit and renamed
                    };
                } catch (e) {
                    return { error: `Failed to analyze event source: ${e.message}` };
                }
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }

    async queryDatabase(type, filters = {}) {
        switch (type) {
            case 'events':
                let query = "SELECT * FROM events";
                const params = [];
                const conditions = [];

                if (filters.is_future !== undefined) {
                    conditions.push("is_future = ?");
                    params.push(filters.is_future ? 1 : 0);
                }

                if (conditions.length > 0) {
                    query += " WHERE " + conditions.join(" AND ");
                }

                query += " ORDER BY date_iso ASC LIMIT 20";
                const { results: events } = await this.db.db.prepare(query).bind(...params).all();
                return events;

            case 'urls':
                const { results: urls } = await this.db.db.prepare("SELECT id, url, title, active, is_dynamic, last_checked_at FROM urls").all();
                return urls;

            case 'stats':
                const stats = await this.db.db.prepare(`
                    SELECT 
                        (SELECT COUNT(*) FROM urls) as total_urls,
                        (SELECT COUNT(*) FROM events) as total_events,
                        (SELECT COUNT(*) FROM events WHERE is_future = 1) as future_events,
                        (SELECT COUNT(*) FROM telemetry) as total_checks
                `).first();
                return stats;

            default:
                return { error: "Invalid query type" };
        }
    }

    async callLLM(systemPrompt, userMessage, tools, history = []) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.env.GEMINI_MODEL}:generateContent?key=${this.env.GEMINI_API_KEY}`;

        const contents = [
            { role: "user", parts: [{ text: systemPrompt + "\n\nUser Query: " + userMessage }] },
            ...history
        ];

        // Transform tools to Gemini format
        const geminiTools = [{ function_declarations: tools }];

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents,
                tools: geminiTools
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(`Gemini API Error: ${data.error.message}`);
        }

        const candidate = data.candidates[0];
        const parts = candidate.content.parts;

        // Check for function call
        const functionCall = parts.find(p => p.functionCall);
        if (functionCall) {
            return {
                tool_calls: [{
                    function: {
                        name: functionCall.functionCall.name,
                        arguments: JSON.stringify(functionCall.functionCall.args)
                    }
                }]
            };
        }

        return { text: parts[0].text };
    }
}
