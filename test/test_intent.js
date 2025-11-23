import { classifyText } from '../src/lib/gemini.js';
import { PROMPT_INTENT_RECOGNITION } from '../src/lib/prompts.js';

// Mock Environment - User needs to set this or we pass it in
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("❌ Please set GEMINI_API_KEY environment variable to run this test.");
    console.error("Usage: set GEMINI_API_KEY=your_key && node test/test_intent.js");
    process.exit(1);
}

const TEST_CASES = [
    "Monitor https://aufguss-wm.com/",
    "/help",
    "Stop tracking ID 5",
    "What festivals are there?",
    "Hello"
];

async function runTests() {
    console.log("🤖 Running Intent Classification Tests...\n");

    for (const text of TEST_CASES) {
        console.log(`Input: "${text}"`);
        try {
            const result = await classifyText(text, API_KEY, PROMPT_INTENT_RECOGNITION);
            console.log("Raw Result:", result);

            let parsed = result;
            if (typeof result === 'string') {
                try {
                    parsed = JSON.parse(result.replace(/```json|```/g, '').trim());
                } catch (e) {
                    console.error("  ❌ JSON Parse Error");
                }
            }

            console.log("  Intent:", parsed.intent);
            console.log("  Data:", parsed);
            console.log("---------------------------------------------------");
        } catch (e) {
            console.error("  ❌ API Error:", e.message);
        }
    }
}

runTests();
