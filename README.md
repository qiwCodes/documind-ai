# Documind AI

Production-oriented rewrite of Documind AI as a TypeScript monorepo with a Next.js web app, auth, document ingestion, and citation-aware RAG chat.

## What this repo contains

- `apps/web` - Next.js 16 app with landing page, auth, dashboard, workspace UI, and API routes
- `packages/*` - shared workspace configuration and reusable package scaffolding
- `tooling` - project tooling and support files

## Current capabilities

- Upload and manage project documents
- Parse and chunk document text for retrieval
- Hybrid retrieval with lexical + vector search
- Citation-aware RAG chat
- Smarter response formatting for lists, comparisons, and Markdown tables
- Better follow-up handling for short context-dependent questions

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS |
| Auth | Clerk |
| Database | PostgreSQL + Prisma |
| AI chat | Groq by default, OpenAI fallback |
| Embeddings | OpenAI embeddings |
| Vector backends | Configurable via env (`pgvector`, Pinecone, in-memory adapter support in codebase) |

## Quick start

1. Install dependencies from repo root:

```bash
npm install
```

2. Create environment files:

```bash
copy .env.example .env
copy apps\web\.env.example apps\web\.env.local
```

3. Fill the required values.

Minimum local setup:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Prisma + app database connection |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend auth |
| `CLERK_SECRET_KEY` | Clerk server auth |
| `GROQ_API_KEY` | Primary chat model |
| `OPENAI_EMBEDDING_API_KEY` | Embeddings for retrieval |
| `OPENAI_API_KEY` | Optional chat fallback |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client integration |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase client integration |

Optional / backend-specific values:

| Variable | Purpose |
|---|---|
| `VECTOR_BACKEND` | Select vector backend |
| `PINECONE_API_KEY` | Pinecone backend |
| `PINECONE_INDEX` | Pinecone index name |
| `SUPABASE_URL` | Supabase server integration |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase server/service operations |
| `INGEST_ASYNC` | Toggle async ingestion behavior |
| `GROQ_MODEL` | Override default Groq model |

4. Run the app:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Workspace scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the web app in development mode |
| `npm run typecheck` | Run TypeScript checks |
| `npm run lint` | Run ESLint |
| `npm run build` | Create a production build |

## Notes

- If Clerk keys are missing locally, Clerk may fall back to keyless development mode.
- Chat quality is best when both a chat model key and embedding key are configured.
- The repository currently reflects the monorepo migration from the previous Python/Streamlit implementation.
