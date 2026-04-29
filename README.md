<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/36b3e15b-dfd5-4ca1-8723-d4c8c31a92d2

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Telegram Mini App setup

1. Add `BOT_TOKEN` and `FIREBASE_SERVICE_ACCOUNT_JSON` to `.env.local`.
2. Start the app and expose it via HTTPS (for example with ngrok/cloud deploy).
3. In `@BotFather`, set your bot menu button to `Web App` and paste your HTTPS URL.
4. Open the app from Telegram. Frontend sends `initData` to `/api/telegram/firebase-token`.
5. Backend validates signature and returns Firebase Custom Token + verified Telegram user.
6. Frontend signs in to Firebase automatically with `signInWithCustomToken`.
7. If an old Google profile with the same `telegramId` exists, backend auto-migrates profile, quests, and XP history into `tg_<telegramId>`.
8. Optional: configure bot menu button via API:
   `curl -X POST http://localhost:3000/api/telegram/setup-menu-button -H "Content-Type: application/json" -d '{"url":"https://your-public-domain","text":"Open Growly"}'`

## Telegram subscription payments (Growly Pro)

1. Set in `.env.local`:
   - `TELEGRAM_PROVIDER_TOKEN`
   - `TELEGRAM_SUBSCRIPTION_PRICE_STARS`
   - `TELEGRAM_SUBSCRIPTION_DAYS`
2. Set Telegram webhook to your backend:
   `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook?url=https://your-public-domain/api/telegram-webhook`
3. In Mini App settings, users can click "Купить подписку".
4. After successful payment, webhook activates premium cosmetics for `tg_<telegramId>`.

## Manual payment fallback + admin moderation

1. Set `ADMIN_TELEGRAM_IDS` and `VITE_ADMIN_TELEGRAM_IDS` in env (comma-separated Telegram IDs).
2. Users can submit "Оплатить через личку" requests from settings.
3. Admins see pending requests in the app and can approve/reject.
4. Approval activates premium subscription for the requested duration.
