<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Frequency Alchemist

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/ba644a22-afe9-4e13-ac5a-f78306069312

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. For a UI-only preview, run `npm run dev`. The AI request needs the Vercel Function at `/api/frequency`.
3. For local API testing, configure server-only values from `.env.example` and use `vercel dev` in a linked Vercel project.

## Vercel server configuration

The root `api/frequency.mjs` runs Gemini on the server. The browser sends only the theme to `/api/frequency`; no API key is injected into the Vite build. Set `GEMINI_API_KEY`, `KV_REST_API_URL`, and `KV_REST_API_TOKEN` in Vercel server environment variables. `FREQUENCY_RATE_LIMIT_SECRET` is optional; if omitted, the server-only Redis token is used to pseudonymize IP addresses. `GEMINI_MODEL` is optional. Without a shared Redis quota store, generation returns 503 rather than making unbounded paid AI calls. The quota is atomic: five requests per IP per 10 minutes, 20 per IP per day, and 100 globally per day.

Any Gemini key previously shipped in public JavaScript must be revoked and replaced. Deploying this source alone does not invalidate an exposed key. Verify the new public JS contains no key after deployment.
