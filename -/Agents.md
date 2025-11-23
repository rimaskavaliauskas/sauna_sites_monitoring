# AI Agent Architecture: Cloudflare Worker + Gemini 2.0 Flash Lite

## Overview
This agent monitors web pages for specific content changes (events, saunas, festivals, jobs) and notifies a Telegram channel. It runs entirely on Cloudflare's free tier using Workers, D1, and Cron Triggers.

## Core Components

### 1. Cloudflare Worker (`src/index.js`)
-   **Entry Points**:
    -   `fetch(request, env, ctx)`: Handles Telegram Webhook updates.
    -   `scheduled(event, env, ctx)`: Triggered by Cron (every 1-3 hours).
-   **Table `telemetry`**: Stats (runs, updates, errors, llm_usage).
-   **Table `errors`**: Detailed error logs for debugging.

### 3. AI Model
-   **Model**: `gemini-2.0-flash-lite-preview-02-05`.
-   **Interface**: REST API.
-   **Prompts**: Stored as constants (extensible to KV).

## Detailed Logic

### Smart Comparison & Segmentation
Instead of comparing full text:
1.  Clean HTML -> Split into logical blocks (paragraphs, list items).
2.  Hash each block.
3.  Compare with previous hashes.
4.  Identify **New** or **Modified** blocks.
5.  Only these blocks are sent to Keyword Filter -> LLM.

### Initial Snapshot
-   **Action**: `/add <url>`
-   **Worker**: Fetches URL immediately.
-   **Result**: Saves `last_clean_text` and hash.
-   **Notification**: **NONE** (Silent start).

### Alert Spam Control
-   **Throttling**: Max 5 notifications per Cron cycle.
-   **Bulk Mode**: If > 5 changes detected, send 1 summary message: "Bulk update detected: X changes on Y sites."

### Failure Handling
-   **Fetch Failures**: Retry 1x with backoff. If fail -> Log to `errors` table, skip.
-   **Empty/Bad Content**: Log warning, skip.
-   **LLM Errors**: Fallback to keyword-only match (flagged as "Unverified") or skip.

## Data Flow
1.  **Cron** -> Worker.
2.  **Telemetry** -> Start run timer.
3.  **Loop** over URLs:
    -   Fetch -> Fail? Retry -> Fail? Log Error & Continue.
    -   Clean & Segment.
    -   Diff vs stored blocks.
    -   No change? Continue.
    -   **Keyword Match** on changed blocks.
    -   **LLM Classify** (Prompt: `PROMPT_SEMANTIC_CLASSIFIER`).
    -   Collect valid changes.
4.  **Post-Loop**:
    -   Check Throttling limits.
    -   Send Telegram messages (Individual or Bulk).
    -   Update `urls` (hashes) and `telemetry` (stats).

## Development Process
1.  **Setup**: Init Worker, D1, Secrets.
2.  **Database**: Apply updated schema (with telemetry/errors).
3.  **Bot Logic**: Commands (/add, /list, /remove, /test, /info, /filters).
4.  **Core Logic**:
    -   `lib/fetcher.js`: Robust fetch with retries.
    -   `lib/cleaner.js`: Segmentation logic.
    -   `lib/differ.js`: Block comparison.
    -   `lib/gemini.js`: API client.
5.  **Testing**: Unit tests for segmentation/diffing.

## Prompts (Constants)
-   `PROMPT_SEMANTIC_CLASSIFIER`: "You are a change-classifier..."
-   `PROMPT_KEYWORDS`: List of active keywords.
