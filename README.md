# SaunaScopeBot - Intelligent Sauna & Wellness Monitoring Agent

An advanced AI-powered Telegram bot that automatically monitors sauna, spa, and wellness websites for new events, courses, and opportunities. Built on Cloudflare Workers with Google Gemini AI integration.

## 🎯 Project Overview

SaunaScopeBot is an autonomous monitoring agent designed for sauna and wellness enthusiasts. It continuously watches your curated list of websites, automatically detecting and intelligently analyzing new content using Large Language Models (LLMs). When it discovers relevant events, courses, or special offers, it immediately notifies you via Telegram with rich, structured summaries.

The bot goes beyond simple change detection. It understands context, filters noise, and even discovers new sauna-related websites by analyzing external links from sites you're already monitoring—creating a self-expanding network of sauna opportunities.

## ✨ Key Features

### 🤖 Intelligent Content Analysis
- **Deep Page Understanding**: Uses Google Gemini 2.0 Flash Lite to analyze entire web pages, not just detect raw HTML changes
- **Structured Event Extraction**: Automatically extracts events, courses, and offers with:
  - **Title**: Clear, compelling event name
  - **Summary**: Human-readable explanation of what the event is and why it matters
  - **Date & Price**: Extracted and formatted pricing and scheduling information
  - **Link**: Direct link to the specific opportunity
  - **Relevance Score**: 1-10 rating of how sauna-related the content is
- **Context-Aware**: Understands the "vibe" of content to avoid false positives from navigation menus, ads, or irrelevant updates

### 🌐 Browser Rendering Technology
- **JavaScript Execution**: Uses Cloudflare Browser Rendering (Puppeteer) to render pages like a real browser
- **Dynamic Content Support**: Handles single-page applications, lazy loading, and AJAX-heavy sites
- **Scroll Simulation**: Automatically scrolls pages to trigger lazy-loaded content
- **Human-Like Scraping**: Extracts visible text as a human would see it

### 🔍 Recursive Site Discovery
- **Automatic Link Harvesting**: Scans monitored websites for external links
- **AI-Powered Filtering**: Uses LLM to identify which links are sauna/spa/wellness related
- **Smart Curation**: Ignores social media, booking platforms, and generic sites
- **User Approval Workflow**: Presents discoveries for your review before adding them
- **Self-Expanding Network**: Your monitoring list grows organically as you add authoritative sources

### 🛡️ Intelligent Quality Control
- **Sauna Relevance Validation**: New sites are automatically checked for sauna/spa/wellness relevance
- **Block Non-Relevant Sites**: Prevents accidental addition of unrelated websites
- **Force-Add Override**: Ability to bypass validation when needed (`/force-add`)
- **Duplicate Prevention**: Automatically detects and handles already-monitored URLs

### 💬 Natural Language Interface
- **Conversational Commands**: Talk to the bot naturally: "Monitor example.com" or "Show me my sites"
- **Intent Recognition**: AI-powered understanding of user requests
- **Regex Shortcuts**: Common commands bypass AI for instant response (no rate limits)
- **Fallback Commands**: Traditional slash commands always available

### ⚡ Performance Optimization
- **Smart Throttling**: 10-second delays between site checks to respect API rate limits
- **Segment Limiting**: Only analyzes most relevant content sections (max 10 segments)
- **Efficient Caching**: Stores content hashes to avoid re-analyzing unchanged pages
- **Fallback Mechanisms**: Gracefully falls back to simple HTTP fetch if browser rendering fails

### 📊 Comprehensive Logging & Telemetry
- **Change Tracking**: All detected changes logged to database with timestamps
- **Error Monitoring**: Failed scrapes and errors stored for debugging
- **Usage Metrics**: Tracks URLs checked, LLM calls, notifications sent, and execution time
- **Performance Insights**: Duration metrics for optimization

## 🤖 The Role of AI/LLM in This Project

Google Gemini 2.0 Flash Lite serves as the **intelligent brain** of SaunaScopeBot, performing five critical functions:

### 1. **Natural Language Understanding** (Intent Recognition)
**Prompt**: `PROMPT_INTENT_RECOGNITION`
- Classifies user messages into intents: `ADD_URL`, `REMOVE_URL`, `LIST_URLS`, `TEST_RUN`, `HELP`, `CHAT`
- Extracts entities (URLs, IDs) from conversational text
- Generates appropriate responses for help requests and chat queries

### 2. **Content Relevance Classification** (Sauna Validation)
**Prompt**: `PROMPT_CHECK_SAUNA_RELEVANCE`
- Analyzes website content to determine if it's sauna/spa/wellness related
- Returns: Yes/No (Boolean)
- Prevents pollution of monitoring list with irrelevant sites

### 3. **Deep Content Analysis** (Event/Course Extraction)
**Prompt**: `PROMPT_DEEP_ANALYSIS`
- Analyzes entire page text (up to 100,000 characters)
- Understands context: "What type of site is this?"
- Filters noise: Ignores menus, footers, ads
- Extracts structured opportunities:
  - Type classification (EVENT, COURSE, OFFER, NEWS)
  - Title generation
  - Summary synthesis (explains WHAT and WHY)
  - Date/price extraction
  - Link discovery
  - Relevance scoring (1-10)

### 4. **Link Curation** (Discovery Filtering)
**Prompt**: `PROMPT_FILTER_LINKS`
- Receives batch of external links (up to 20)
- Filters for sauna venues, spas, wellness centers, festivals, education providers
- Excludes social media, booking platforms, privacy pages
- Returns: JSON array of approved links with titles and reasons

### 5. **Semantic Change Detection** (Legacy - currently not used)
**Prompt**: `PROMPT_SEMANTIC_CLASSIFIER`
- Originally designed to classify if text changes are semantically important
- Returns: Yes/No
- Note: Currently replaced by Deep Analysis approach

## 📋 Command Reference

### Direct Commands (No AI Required)

| Command | Description | Example |
|---------|-------------|---------|
| `/add <url>` | Add a URL to monitoring list (with sauna validation) | `/add https://sauna.fi` |
| `/force-add <url>` | Add a URL without validation | `/force-add https://example.com` |
| `/list` | Show all monitored URLs | `/list` |
| `/remove <id>` | Remove URL by ID | `/remove 5` |
| `/test <id>` | Manually trigger check for specific URL | `/test 1` |
| `/discoveries` | View pending discovered sites | `/discoveries` |
| `/approve <id>` | Add a discovered site to monitoring | `/approve 3` |
| `/reject <id>` | Dismiss a discovered site | `/reject 3` |

### Natural Language Commands (AI-Powered)

| What You Say | Bot Understands |
|--------------|-----------------|
| "Monitor https://sauna.com" | `ADD_URL` intent |
| "Remove example.com" | `REMOVE_URL` intent |
| "Show my sites" / "List URLs" | `LIST_URLS` intent |
| "What are you tracking?" | `LIST_URLS` intent |
| "Help" / "/help" | `HELP` intent |
| "Find me some sauna events" | `CHAT` intent (conversational) |
| "Stop tracking ID 5" | `REMOVE_URL` with ID extraction |

### Regex Shortcuts (Instant Response)

These patterns bypass AI for zero-latency responses:

- `add|monitor|track <url>` → Direct `ADD_URL` execution
- `remove|delete|stop tracking <id or url>` → Direct removal
- `list|show|my (sites|urls)?` → Direct list display

## 🏗️ Architecture

### Technology Stack
- **Runtime**: Cloudflare Workers (Serverless JavaScript)
- **Database**: Cloudflare D1 (SQLite)
- **Browser**: Cloudflare Browser Rendering (Puppeteer)
- **AI Model**: Google Gemini 2.0 Flash Lite (REST API)
- **Notifications**: Telegram Bot API
- **Scheduler**: Cloudflare Cron Triggers (every 2 hours)

### Data Flow

```
User ─► Telegram ─► Webhook ─► Worker
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
                 Natural      Direct        Cron
                Language     Commands      Trigger
                    │             │             │
                    └──────► Intent ◄──────────┘
                              │
                        ┌─────┴─────┐
                        │           │
                    Database    Browser
                        │        Rendering
                        │           │
                        │      ┌────┴────┐
                        │      │ Scrape  │
                        │      │ Extract │
                        │      └────┬────┘
                        │           │
                        │      ┌────┴────┐
                        │      │  Gemini │
                        │      │   LLM   │
                        │      └────┬────┘
                        │           │
                        └────► Analyze
                               │
                          ┌────┴────┐
                          │ Notify  │
                          │  User   │
                          └─────────┘
```

### Database Schema

**`urls`** - Monitored websites
- `id`, `url`, `last_hash`, `last_clean_text`, `added_at`, `active`, `error_count`

**`discovered_urls`** - AI-discovered sites pending approval
- `id`, `source_url_id`, `url`, `title`, `context`, `status`, `found_at`

**`changes_log`** - History of detected changes
- `id`, `url_id`, `change_summary`, `timestamp`

**`filters`** - Keyword filters (legacy feature)
- `id`, `category`, `keyword`, `enabled`

**`telemetry`** - Performance metrics
- `id`, `timestamp`, `urls_checked`, `changes_found`, `llm_calls`, `notifications_sent`, `duration_ms`

**`errors`** - Error logging
- `id`, `url_id`, `error_message`, `timestamp`

## 🎁 Benefits

### For Users
✅ **Time Savings**: No manual checking of dozens of websites daily  
✅ **Never Miss Opportunities**: 24/7 automated monitoring  
✅ **Curated Information**: Only sauna-relevant content, no noise  
✅ **Structured Insights**: Events presented with all key details at a glance  
✅ **Network Growth**: Automatic discovery of new relevant sites  
✅ **Mobile-First**: All notifications and controls via Telegram  

### For Sauna Enthusiasts
✅ **Event Discovery**: Find festivals, competitions, workshops before they sell out  
✅ **Course Tracking**: Be first to know about Aufguss training, certifications  
✅ **Deal Alerts**: Catch special offers and early bird pricing  
✅ **Community Building**: Discover new venues and practitioners  

### Technical Advantages
✅ **Serverless**: Zero infrastructure management, infinite scalability  
✅ **Cost-Efficient**: Pay only for actual executions, free tier available  
✅ **Fault-Tolerant**: Automatic retries, error logging, graceful degradation  
✅ **Intelligent**: AI adaptation to new content formats  
✅ **Transparent**: Full logging and telemetry for debugging  

## 🚀 Future Enhancements

**Potential Features:**
- 📅 Calendar integration (iCal export)
- 🔔 Custom notification filters (price range, location, event type)
- 📊 Analytics dashboard (trends, popular events)
- 🌍 Multi-language support
- 🤝 Collaborative lists (share monitoring lists with friends)
- 📧 Email digest option
- 🔗 RSS feed generation
- 💾 Export to PDF/CSV

## 📈 Performance Metrics

Current Rate Limits (Free Tier):
- **Gemini API**: 15 requests/minute, 1,500/day
- **Optimization**: Regex shortcuts save ~70% of AI calls
- **Throttling**: 10-second delays prevent bursts
- **Efficiency**: ~1-3 AI calls per monitored site per check

## 🏆 Success Story

This bot transforms a manual, time-consuming task into an automated intelligence system. By combining browser automation, LLM reasoning, and recursive discovery, it creates a **self-improving monitoring network** that gets smarter the more you use it.

---

**Built with ❤️ for the global sauna community**
