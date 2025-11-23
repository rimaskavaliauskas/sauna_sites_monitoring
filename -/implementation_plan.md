# Implementation Plan - Cloudflare Worker AI Agent

This plan outlines the steps to build the Telegram monitoring bot using Cloudflare Workers, D1, and Gemini 2.0 Flash Lite.

## User Review Required
> [!IMPORTANT]
> **Model Selection**: Strictly `gemini-2.0-flash-lite-preview-02-05`.
> **Smart Comparison**: We will implement text segmentation to save tokens.
> **Telemetry**: We will add tables for tracking usage and errors.

## Proposed Changes

### Project Structure
#### [NEW] [wrangler.toml](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/wrangler.toml)
-   Configuration for Worker, D1 binding (`DB`), and Cron triggers.

#### [NEW] [schema.sql](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/schema.sql)
-   SQL definitions for `urls`, `filters`, `changes_log`.
-   **[NEW]** `telemetry` table (id, timestamp, urls_checked, changes_found, llm_calls, notifications_sent).
-   **[NEW]** `errors` table (id, url_id, error_message, timestamp).

#### [NEW] [src/index.js](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/src/index.js)
-   Main worker logic.
-   `fetch` handler for Telegram updates.
-   `scheduled` handler for Cron jobs with **Throttling** and **Telemetry**.

#### [NEW] [src/lib/cleaner.js](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/src/lib/cleaner.js)
-   HTML cleaning logic.
-   **[NEW]** `segmentText(text)` function to split content into comparable blocks.

#### [NEW] [src/lib/differ.js](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/src/lib/differ.js)
-   **[NEW]** Logic to compare block hashes and identify changed segments.

#### [NEW] [src/lib/gemini.js](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/src/lib/gemini.js)
-   Gemini API client (REST).

#### [NEW] [src/lib/prompts.js](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/src/lib/prompts.js)
-   **[NEW]** Centralized storage for prompts.

### Verification Plan

### Automated Tests
-   `test/segmentation.test.js`: Verify text splitting logic.
# Implementation Plan - Cloudflare Worker AI Agent

This plan outlines the steps to build the Telegram monitoring bot using Cloudflare Workers, D1, and Gemini 2.0 Flash Lite.

## User Review Required
> [!IMPORTANT]
> **Model Selection**: Strictly `gemini-2.0-flash-lite-preview-02-05`.
> **Smart Comparison**: We will implement text segmentation to save tokens.
> **Telemetry**: We will add tables for tracking usage and errors.

## Proposed Changes

### Project Structure
#### [NEW] [wrangler.toml](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/wrangler.toml)
-   Configuration for Worker, D1 binding (`DB`), and Cron triggers.

#### [NEW] [schema.sql](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/schema.sql)
-   SQL definitions for `urls`, `filters`, `changes_log`.
-   **[NEW]** `telemetry` table (id, timestamp, urls_checked, changes_found, llm_calls, notifications_sent).
-   **[NEW]** `errors` table (id, url_id, error_message, timestamp).

#### [NEW] [src/index.js](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/src/index.js)
-   Main worker logic.
-   `fetch` handler for Telegram updates.
-   `scheduled` handler for Cron jobs with **Throttling** and **Telemetry**.

#### [NEW] [src/lib/cleaner.js](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/src/lib/cleaner.js)
-   HTML cleaning logic.
-   **[NEW]** `segmentText(text)` function to split content into comparable blocks.

#### [NEW] [src/lib/differ.js](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/src/lib/differ.js)
-   **[NEW]** Logic to compare block hashes and identify changed segments.

#### [NEW] [src/lib/gemini.js](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/src/lib/gemini.js)
-   Gemini API client (REST).

#### [NEW] [src/lib/prompts.js](file:///c:/Users/HP/.gemini/antigravity/playground/outer-spicule/src/lib/prompts.js)
-   **[NEW]** Centralized storage for prompts.

### Verification Plan

### Automated Tests
-   `test/segmentation.test.js`: Verify text splitting logic.
-   `test/simulation.js`: Mock run of the cron job.

### Manual Verification
1.  **Deploy**: `npx wrangler deploy`.
2.  **Database**: `npx wrangler d1 execute ...`
3.  **Telegram**:
    -   Check Throttling limits.
    -   Send Telegram messages (Individual or Bulk). **MUST include Source URL.**
    -   Update `urls` (hashes) and `telemetry` (stats).
