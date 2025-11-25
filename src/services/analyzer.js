import { segmentText } from '../lib/cleaner.js';
import { classifyText } from '../lib/gemini.js';
import { PROMPT_DEEP_ANALYSIS } from '../lib/prompts.js';
import { DatabaseService } from './database.js';

export class AnalyzerService {
    constructor(env) {
        this.env = env;
    }

    async analyze(content, url, oldHash, oldSegmentsJson) {
        const newSegments = segmentText(content);
        const newHash = await this.hashContent(newSegments);

        // Level 1: Fast Diff & Noise Filter
        if (newHash === oldHash) {
            return { hasChange: false, newHash, newSegments };
        }

        // Calculate Levenshtein Distance if we have old content
        let isSignificant = true;
        if (oldSegmentsJson) {
            try {
                const oldSegments = JSON.parse(oldSegmentsJson);
                const oldText = oldSegments.join(' ');
                const newText = newSegments.join(' ');

                const distance = this.levenshteinDistance(oldText, newText);
                const maxLength = Math.max(oldText.length, newText.length);
                const changePercent = (distance / maxLength) * 100;

                // Noise Threshold: Ignore changes < 5% unless they look like structured data changes (simple heuristic)
                // DISABLED: 5% is too high for price/date changes on large pages.
                // if (changePercent < 5) {
                //    console.log(`Minor change detected (${changePercent.toFixed(2)}%), skipping Deep Analysis.`);
                //    isSignificant = false;
                // }
            } catch (e) {
                console.error("Error calculating Levenshtein:", e);
            }
        }

        if (!isSignificant) {
            return { hasChange: false, newHash, newSegments, note: "Minor change ignored" };
        }

        // Level 2: Deep Analysis
        console.log(`Significant change detected for ${url}, running Deep Analysis...`);
        const analysis = await this.performDeepAnalysis(content, url);

        return {
            hasChange: true,
            newHash,
            newSegments,
            analysis
        };
    }
    async performDeepAnalysis(content, url) {
        const safeContent = content.substring(0, 100000);
        const currentDate = new Date().toISOString().split('T')[0];

        // Get Language Preference
        const db = new DatabaseService(this.env);
        let language = await db.getSetting('language');
        console.log(`[Analyzer] Raw language setting: '${language}'`);

        if (!language || language === 'null' || language === 'undefined') {
            language = 'ENGLISH';
        }
        console.log(`[Analyzer] Using language for prompt: '${language}'`);

        const prompt = PROMPT_DEEP_ANALYSIS
            .replaceAll('{{URL}}', url)
            .replaceAll('{{LANGUAGE}}', language)
            .replaceAll('{{DATE}}', currentDate);

        try {
            const result = await classifyText(safeContent, this.env.GEMINI_API_KEY, prompt);
            const parsed = typeof result === 'string' ? JSON.parse(result.replace(/```json|```/g, '').trim()) : result;
            return parsed;
        } catch (e) {
            console.error("Deep Analysis Error:", e);
            return { future_events: [], past_events: [], insights: [] };
        }
    }

    async hashContent(segments) {
        const text = segments.join('');
        const msgBuffer = new TextEncoder().encode(text);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    levenshteinDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;

        const matrix = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        Math.min(
                            matrix[i][j - 1] + 1, // insertion
                            matrix[i - 1][j] + 1 // deletion
                        )
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }
}
