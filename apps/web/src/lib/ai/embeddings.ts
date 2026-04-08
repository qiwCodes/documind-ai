// Groq does not provide embeddings. Use OPENAI_EMBEDDING_API_KEY (or OPENAI_API_KEY fallback)
// for OpenAI text-embedding-3-small, or omit for deterministic fallback vectors (lower retrieval quality).
import { embedMany } from "ai";
import { createOpenAI, openai } from "@ai-sdk/openai";
import { EMBEDDING_DIMENSION } from "@/lib/vector/env";

const FALLBACK_SEED_DIM = 256;

function deterministicVectorFromText(text: string): number[] {
  const seed = new Array<number>(FALLBACK_SEED_DIM).fill(0);

  for (let i = 0; i < text.length; i += 1) {
    const charCode = text.charCodeAt(i);
    const index = (charCode + i) % FALLBACK_SEED_DIM;
    seed[index] += (charCode % 11) / 10;
  }

  const padded = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  for (let i = 0; i < FALLBACK_SEED_DIM; i += 1) {
    padded[i] = seed[i];
  }

  const norm = Math.sqrt(padded.reduce((sum, value) => sum + value * value, 0)) || 1;
  return padded.map((value) => value / norm);
}

function normalizeDimension(embedding: number[]): number[] {
  if (embedding.length === EMBEDDING_DIMENSION) {
    return embedding;
  }

  const padded = new Array<number>(EMBEDDING_DIMENSION).fill(0);
  for (let i = 0; i < Math.min(embedding.length, EMBEDDING_DIMENSION); i += 1) {
    padded[i] = embedding[i] ?? 0;
  }

  const norm = Math.sqrt(padded.reduce((sum, value) => sum + value * value, 0)) || 1;
  return padded.map((value) => value / norm);
}

function getEmbeddingApiKey(): string | undefined {
  return process.env.OPENAI_EMBEDDING_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
}

export function hasOpenAIEmbeddingsConfigured(): boolean {
  return Boolean(getEmbeddingApiKey());
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  const embeddingApiKey = getEmbeddingApiKey();
  if (!embeddingApiKey) {
    return texts.map(deterministicVectorFromText);
  }

  const { embeddings } = await embedMany({
    model:
      process.env.OPENAI_EMBEDDING_API_KEY?.trim()
        ? createOpenAI({ apiKey: embeddingApiKey }).embedding("text-embedding-3-small")
        : openai.embedding("text-embedding-3-small"),
    values: texts,
  });

  return embeddings.map((row) => normalizeDimension(row));
}
