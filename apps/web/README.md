# Documind Web App

Next.js app for Documind AI (landing page, auth flow, dashboard, and API routes).

## Environment

Create `apps/web/.env.local` from `apps/web/.env.example` and set at minimum:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `GROQ_API_KEY` (chat)
- `OPENAI_EMBEDDING_API_KEY` (embeddings)
- `OPENAI_API_KEY` (optional: chat fallback if no Groq key)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

If Clerk keys are not set, Clerk may run in keyless development mode, which is useful for local testing only.

## Run

From repo root:

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Build and checks

```bash
npm run typecheck
npm run lint
npm run build
```
