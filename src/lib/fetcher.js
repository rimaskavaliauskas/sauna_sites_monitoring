/**
 * Fetches a URL with retries and timeout.
 * @param {string} url 
 * @returns {Promise<string|null>} HTML content or null on failure.
 */
export async function fetchPage(url) {
    const MAX_RETRIES = 1;
    const TIMEOUT = 10000; // 10s

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), TIMEOUT);

            const response = await fetch(url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; AgentBot/1.0; +http://example.com/bot)"
                },
                signal: controller.signal
            });
            clearTimeout(id);

            if (!response.ok) {
                console.warn(`Fetch failed for ${url}: ${response.status}`);
                if (attempt === MAX_RETRIES) return null;
                continue;
            }

            return await response.text();
        } catch (e) {
            console.warn(`Fetch error for ${url} (Attempt ${attempt + 1}):`, e);
            if (attempt === MAX_RETRIES) return null;
            // Simple backoff
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    return null;
}
