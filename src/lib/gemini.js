/**
 * Calls Gemini 2.0 Flash Lite to classify text.
 * @param {string} text - The text to classify.
 * @param {string} apiKey - Gemini API Key.
 * @param {string} prompt - The system prompt.
 * @returns {Promise<string|boolean>} - Response from Gemini (JSON string or boolean).
 */
export async function classifyText(text, apiKey, prompt) {
    const model = "gemini-2.0-flash-lite-preview-02-05";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // Detect if this is a Yes/No prompt or a JSON prompt
    const isYesNoPrompt = prompt.includes("Yes\" or \"No\"");

    const payload = {
        contents: [{
            parts: [{
                text: isYesNoPrompt
                    ? `${prompt}\n\nText to analyze:\n"${text}"\n\nReply (Yes/No):`
                    : `${prompt}\n\nUser Message:\n"${text}"\n\nYour Response:`
            }]
        }],
        generationConfig: {
            temperature: 0.1,
            maxOutputTokens: isYesNoPrompt ? 5 : 4000
        }
    };

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            console.error(`Gemini API Error: ${response.status} ${response.statusText}`);
            if (response.status === 429) throw new Error("429 Too Many Requests");
            return false; // Fail safe for other errors
        }

        const data = await response.json();
        const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

        if (isYesNoPrompt) {
            return answer?.toLowerCase() === "yes";
        } else {
            return answer || "{}"; // Return the JSON string or empty object
        }
    } catch (e) {
        console.error("Gemini Fetch Error:", e);
        if (e.message.includes("429")) throw e;
        return isYesNoPrompt ? false : "{}";
    }
}
