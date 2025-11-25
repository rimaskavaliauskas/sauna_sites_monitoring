import { ConversationService } from './src/services/conversation.js';
import { PROMPT_CONVERSATION } from './src/lib/prompts.js';

// Mock dependencies
const mockEnv = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: "gemini-2.0-flash-lite-preview-02-05"
};

const mockDb = {
    db: {
        prepare: (query) => {
            console.log("DB Query:", query);
            return {
                bind: (...args) => {
                    console.log("DB Bind Args:", args);
                    return {
                        all: async () => {
                            return {
                                results: [
                                    { id: 1, title: "Test Event 1", summary: "Summary 1", date_iso: "2025-01-01", location: "Loc 1", price: "100", source_link: "http://test.com" },
                                    { id: 2, title: "Test Event 2", summary: "Summary 2", date_iso: "2025-02-01", location: "Loc 2", price: "200", source_link: "http://test2.com" }
                                ]
                            };
                        },
                        first: async () => {
                            return { id: 1, title: "Test Event 1", source_link: "http://test.com" };
                        }
                    };
                }
            };
        }
    }
};

const mockExa = { search: async () => [] };
const mockScraper = { scrape: async () => ({ content: "Mock content" }) };
const mockAnalyzer = { analyze: async () => ({ analysis: "Mock analysis" }) };

async function runTest() {
    const service = new ConversationService(mockEnv, mockDb, mockExa, mockScraper, mockAnalyzer);

    console.log("--- Testing 'Show me future events' ---");
    try {
        const response = await service.chat("Show me future events");
        console.log("\nBot Response:\n", response);
    } catch (e) {
        console.error("Error:", e);
    }
}

runTest();
