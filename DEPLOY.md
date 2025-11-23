# Deployment Instructions

Since I cannot log in to your Cloudflare account, please follow these steps to deploy the agent.

## 1. Login to Cloudflare
```bash
npx wrangler login
```

## 2. Create D1 Database
Create the database and copy the `database_id` from the output.
```bash
npx wrangler d1 create agent-db
```

## 3. Update `wrangler.toml`
Open `wrangler.toml` and replace `TO_BE_FILLED_BY_USER` with the `database_id` you just got.

## 4. Apply Database Schema
```bash
npx wrangler d1 execute agent-db --file=schema.sql
```

## 5. Set Secrets
Set the following secrets (you will be prompted to paste the values):
```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put TELEGRAM_CHAT_ID
```
*Note: `TELEGRAM_CHAT_ID` is the default chat/channel ID for notifications.*

## 6. Deploy Worker
```bash
npx wrangler deploy
```

## 7. Set Telegram Webhook
After deployment, you will get a Worker URL (e.g., `https://agent-worker.your-subdomain.workers.dev`).
Set the webhook for your bot:
```bash
curl -F "url=https://<YOUR_WORKER_URL>" https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook
```

## 8. Verify
-   Send `/start` or `/info` to your bot.
-   Add a URL: `/add https://example.com`.
