// Quick diagnostic for intent recognition
// Run with: set GEMINI_API_KEY=your_key && node test/diagnose.js

const PROMPT = `
You are an intent classifier for a Telegram Bot that monitors websites.
The user will send a message in natural language. You must classify the intent and extract relevant entities.

Available Intents:
1. ADD_URL: User wants to start monitoring a website.
2. REMOVE_URL: User wants to stop monitoring a website (by ID or URL).
3. LIST_URLS: User wants to see the list of monitored websites.
4. TEST_RUN: User wants to force a check or test the bot.
5. HELP: User asks for help or how to use the bot.
6. CHAT: General conversation or questions about the monitored data.

Return a JSON object with:
- "intent": One of the intents above.
- "url": The URL if present (for ADD_URL or REMOVE_URL).
- "id": The ID if present (for REMOVE_URL).
- "reply": A friendly, short response to the user (only for CHAT or HELP intent, otherwise null).

Example Input: "/help"
Example Output: {"intent": "HELP", "reply": "Use /add <url> to monitor a site, /list to see your sites, /remove to stop monitoring."}

Example Input: "What are the top 5 offers now?"
Example Output: {"intent": "CHAT", "reply": "I monitor for new events. Check /list to see which sites I'm watching!"}
`;

async function test(userMessage) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ Set GEMINI_API_KEY first");
        process.exit(1);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite-preview-02-05:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{
            parts: [{
                text: `${PROMPT}\n\nUser Message:\n"${userMessage}"\n\nYour Response:`
            }]
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200
        }
    };

    console.log(`\n📤 Testing: "${userMessage}"`);

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });

    const data = await response.json();
    const rawAnswer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    console.log("📥 Raw Response:", rawAnswer);

    try {
        const cleaned = rawAnswer.replace(/```json|```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        console.log("✅ Parsed:", JSON.stringify(parsed, null, 2));
    } catch (e) {
        console.log("❌ Parse Error:", e.message);
    }
}

// Test cases
const tests = [
    "/help",
    "What are the top 5 offers now?",
    "Monitor example.com"
];

(async () => {
    for (const t of tests) {
        await test(t);
    }
})();
