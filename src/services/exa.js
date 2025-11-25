export class ExaService {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.baseUrl = 'https://api.exa.ai/search';
    }

    async search(query, numResults = 5) {
        if (!this.apiKey) {
            console.warn("[ExaService] No API key configured");
            return { error: "Exa API key not configured" };
        }

        try {
            console.log(`[ExaService] Searching for: ${query}`);
            const response = await fetch(this.baseUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey
                },
                body: JSON.stringify({
                    query,
                    num_results: numResults,
                    type: 'neural',
                    category: 'company', // Optimized for finding businesses like saunas
                    useAutoprompt: true,
                    contents: {
                        text: {
                            maxCharacters: 10000 // Get page text for LLM to summarize
                        }
                    }
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Exa API Error: ${response.status} ${errorText}`);
            }

            const data = await response.json();
            return data.results;
        } catch (e) {
            console.error("[ExaService] Search error:", e);
            return { error: e.message };
        }
    }
}
