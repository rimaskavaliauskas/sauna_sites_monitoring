# Implementation Plan - Cloudflare Worker AI Agent

This plan outlines the steps to build a robust, scalable Telegram monitoring bot using Cloudflare Workers, D1, and Gemini 2.0 Flash Lite.

## User Review Required
> [!IMPORTANT]
> **Hybrid Architecture**: We will use `fetch` by default and `Browser Rendering` only for dynamic sites (`is_dynamic` flag).
> **Event-Centric**: Focus on storing and notifying about *events*, not just page changes.
> **Modularity**: Code will be split into `services/`, `lib/`, and `router/` to prevent monolithic `index.js`.

## Proposed Changes

### 1. Database Schema & Storage
#### [NEW] [schema.sql](file:///d:/AI/aleksandro%20kursas/cloudflare-agent/schema.sql)
-   **`urls`**: Added `is_dynamic` (BOOLEAN) to toggle Browser Rendering.
-   **`events`**: New table for deduplication (`id`, `url_id`, `title`, `date_iso`, `price_info`, `hash`, `first_seen_at`).
-   **`telemetry`**: Enhanced metrics (`urls_checked`, `changes_found`, `llm_calls`, `errors_count`, `duration_ms`).
-   **`errors`**: Structured error logging (`level`: warning/critical, `type`: fetch/llm/parse).

### 2. Hybrid Scraping & Smart Rendering
-   **Default**: Use lightweight `fetch()` + HTML cleaning (Cheerio/Regex).
-   **Dynamic**: Use Cloudflare Browser Rendering only if `is_dynamic=true` in DB.
-   **Fallback**: If `fetch()` returns < 500 chars, auto-retry with Browser (and suggest flagging as dynamic).

### 3. Two-Level Analysis Pipeline
To save tokens and costs:
-   **Level 1 (Fast Diff & Noise Filter)**:
    -   **Segmentation**: Compare text segments (Paragraphs/List items).
    -   **Levenshtein Check**: Calculate Levenshtein Distance between old and new content.
        -   If `Distance < Threshold` AND `No New Structured Events` -> Ignore (Treat as typo fix/formatting change).
    -   **Noise Filter**: Ignore changes < 10 chars, reordered blocks.
    -   If changes are minor -> Skip or use "Lite" LLM check.
-   **Level 2 (Deep Analysis)**:
    -   Triggered if: Significant content change OR New Event detected OR User requested `/test`.
    -   Sends full content to Gemini with `PROMPT_DEEP_ANALYSIS`.
    -   Extracts Events, Prices, Dates.

### 4. Modular Code Architecture
Refactor `src/index.js` into:
-   `src/router.js`: Handle Telegram Webhooks & Commands.
-   `src/services/scraper.js`: Hybrid fetching logic.
-   `src/services/analyzer.js`: Segmentation, Diffing, and LLM orchestration.
-   `src/services/database.js`: D1 interactions (Events, URLs).
-   `src/lib/prompts.js`: Centralized Prompt Engineering.

### 5. AI Intent & Natural Language
-   **Router**: Regex for instant commands (`/add`, `/list`) -> Zero latency.
-   **NLP Fallback**: If regex fails, use `PROMPT_INTENT_RECOGNITION` to parse:
    -   "Monitor sauna.fi" -> `ADD_URL`
    -   "Show me stats" -> `GET_TELEMETRY`
    -   "Any new events?" -> `CHECK_EVENTS`

### 6. Telemetry & Maintenance
-   **Daily Cleanup**: Cron job to delete logs > 30 days.
-   **Daily Report**: Summary of errors and stats sent to Admin.
-   **Error Normalization**: Classify errors (Network vs Parse vs LLM) for better debugging.

## Verification Plan

### Automated Tests
-   `test/diff.test.js`: Verify segmentation and noise filtering.
-   `test/intent.test.js`: Test NLP command parsing.

### Manual Verification
1.  **Hybrid Test**: Add a static site (Wikipedia) and a dynamic site (SPA). Verify correct scraper usage.
2.  **Event Dedup**: Run check twice on same site. Ensure 2nd run produces NO notifications.
3.  **Load Test**: Add 10 URLs, run `/test`. Verify throttling and rate limits.
