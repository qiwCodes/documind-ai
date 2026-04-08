import { prisma } from "@/lib/db/client";
import type { VectorDocument, VectorMatch, VectorStoreAdapter } from "./types";
import { EMBEDDING_DIMENSION } from "./env";

function toVectorLiteral(embedding: number[]): string {
  if (embedding.length !== EMBEDDING_DIMENSION) {
    throw new Error(`Embedding dimension must be ${EMBEDDING_DIMENSION}`);
  }

  return `[${embedding.join(",")}]`;
}

export class PgVectorAdapter implements VectorStoreAdapter {
  async upsert(params: {
    namespace: string;
    vectors: (VectorDocument & { embedding: number[] })[];
  }): Promise<void> {
    void params.namespace;

    for (const vector of params.vectors) {
      const chunkId = String(vector.metadata.chunkId ?? "");
      if (!chunkId) {
        continue;
      }

      const literal = toVectorLiteral(vector.embedding);
      await prisma.$executeRawUnsafe(
        `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
        literal,
        chunkId,
      );
    }
  }

  async query(params: {
    namespace: string;
    queryEmbedding: number[];
    topK: number;
  }): Promise<VectorMatch[]> {
    const literal = toVectorLiteral(params.queryEmbedding);

    const rows = await prisma.$queryRawUnsafe<
      Array<{ id: string; documentId: string; score: number | null }>
    >(
      `SELECT id, "documentId", (1 - (embedding <=> $1::vector))::float AS score
       FROM "DocumentChunk"
       WHERE "projectId" = (SELECT id FROM "Project" WHERE "vectorNamespace" = $2 LIMIT 1)
       AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      literal,
      params.namespace,
      params.topK,
    );

    return rows.map((row) => ({
      id: row.id,
      score: row.score ?? 0,
      metadata: {
        chunkId: row.id,
        documentId: row.documentId,
      },
    }));
  }

  async deleteNamespace(namespace: string): Promise<void> {
    await prisma.$executeRawUnsafe(
      `UPDATE "DocumentChunk"
       SET embedding = NULL
       WHERE "projectId" = (SELECT id FROM "Project" WHERE "vectorNamespace" = $1 LIMIT 1)`,
      namespace,
    );
  }
}
