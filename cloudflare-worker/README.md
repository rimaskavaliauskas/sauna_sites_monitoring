# SaunaScopeBot v2.0

A Cloudflare Worker that monitors sauna and wellness websites for events, courses, and offers.

## Features

- **Hybrid Scraping**: Fast fetch for static sites, Puppeteer for JS-heavy sites
- **Two-Level Analysis**: Hash-based change detection + Gemini LLM for deep analysis
- **Enhanced Summaries**: 40-80 word detailed summaries with WHAT/WHO/WHY framework
- **Event Deduplication**: Levenshtein-based similarity matching
- **Telegram Notifications**: Real-time alerts for new events
- **Link Discovery**: Automatic discovery of related sauna sites

## Quick Start

### 1. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 2. Set Up D1 Database

\`\`\`bash
# Create the database (first time only)
npm run db:create

# Run migrations
npm run db:migrate
\`\`\`

### 3. Configure Secrets

\`\`\`bash
npm run secret:gemini        # Enter your Gemini API key
npm run secret:telegram-token  # Enter your Telegram bot token
npm run secret:telegram-chat   # Enter your Telegram chat ID
\`\`\`

### 4. Deploy

\`\`\`bash
npm run deploy
\`\`\`

### 5. Local Development

\`\`\`bash
npm run dev
\`\`\`

## Project Structure

\`\`\`
src/
├── index.js           # Main entry point, scheduled handler
├── router.js          # HTTP request routing
├── services/
│   ├── analyzer.js    # Two-level analysis with LLM
│   ├── database.js    # D1 database operations
│   └── scraper.js     # Hybrid fetch/browser scraping
└── lib/
    ├── prompts.js     # LLM prompts (enhanced for quality)
    ├── gemini.js      # Gemini API client with rate limiting
    └── cleaner.js     # Text cleaning utilities
\`\`\`

## Key Improvements in v2.0

1. **Fixed Lazy Summaries**: Enhanced prompts with explicit requirements, examples, and validation
2. **Temperature Control**: Lower temperature (0.3) for more focused LLM outputs
3. **Output Validation**: Automatic detection and enhancement of low-quality summaries
4. **Retry Logic**: Exponential backoff for API failures
5. **Semantic Change Detection**: Smart filtering to avoid unnecessary LLM calls

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Yes |
| `TELEGRAM_CHAT_ID` | Default chat for notifications | Yes |
| `GEMINI_MODEL` | Model name (default: gemini-2.0-flash-lite) | No |

## API Endpoints

- `GET /` - Health check
- `GET /urls` - List monitored sites
- `GET /events` - Get upcoming events
- `POST /trigger` - Manually trigger monitoring
- `POST /webhook` - Telegram webhook

## License

MIT
