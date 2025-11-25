
import { AnalyzerService } from './src/services/analyzer.js';
import { PROMPT_DEEP_ANALYSIS } from './src/lib/prompts.js';

// Mock Env
const env = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || 'mock-key',
    DB: {
        prepare: () => ({
            first: async () => ({ value: 'ENGLISH' }), // Mock DB returning ENGLISH
            all: async () => []
        })
    }
};

// Mock DatabaseService
class MockDatabaseService {
    constructor(env) { }
    async getSetting(key) {
        console.log(`[MockDB] Getting setting for ${key}`);
        return 'ENGLISH';
    }
}

// Mock AnalyzerService to inject MockDB
class TestAnalyzerService extends AnalyzerService {
    async performDeepAnalysis(content, url) {
        console.log("--- STARTING DEEP ANALYSIS TEST ---");

        // Replicate logic from AnalyzerService.js
        const safeContent = content.substring(0, 1000); // Shorten for test
        const currentDate = new Date().toISOString().split('T')[0];

        // Mock DB call
        const db = new MockDatabaseService(this.env);
        let language = await db.getSetting('language');
        console.log(`[Analyzer] Raw language setting: '${language}'`);

        if (!language || language === 'null' || language === 'undefined') {
            language = 'ENGLISH';
        }
        console.log(`[Analyzer] Using language for prompt: '${language}'`);

        const prompt = PROMPT_DEEP_ANALYSIS
            .replace('{{URL}}', url)
            .replace('{{LANGUAGE}}', language)
            .replace('{{DATE}}', currentDate);

        console.log("\n--- GENERATED PROMPT ---");
        console.log(prompt);
        console.log("------------------------\n");

        return { status: "Prompt generated", prompt };
    }
}

async function runTest() {
    const analyzer = new TestAnalyzerService(env);
    await analyzer.performDeepAnalysis("Some Finnish content here...", "https://test.com");
}

runTest();
