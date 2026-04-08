import { randomUUID } from "node:crypto";
import { DocumentStatus } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { embedTexts } from "@/lib/ai/embeddings";
import { chunkDocument } from "@/lib/chunking/chunk-document";
import { extractTextFromBuffer } from "@/lib/parsing/extract-text";
import { getVectorAdapter } from "@/lib/vector/adapter";
import { buildProjectVectorNamespace } from "@/lib/vector/namespace";
import { buildVectorId } from "@/lib/vector/vector-id";

export type IngestionResult = {
  documentId: string;
  fileName: string;
  status: DocumentStatus;
  chunkCount: number;
  error?: string;
};

export type QueuedIngestionJob = {
  documentId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

export async function createQueuedIngestionJobs(params: {
  projectId: string;
  items: Array<{ fileName: string; mimeType: string; buffer: Buffer }>;
}): Promise<QueuedIngestionJob[]> {
  const project = await prisma.project.findUnique({ where: { id: params.projectId } });

  if (!project) {
    throw new Error("Project not found");
  }

  const jobs: QueuedIngestionJob[] = [];

  for (const item of params.items) {
    const document = await prisma.document.create({
      data: {
        projectId: project.id,
        fileName: item.fileName,
        mimeType: item.mimeType || "application/octet-stream",
        status: DocumentStatus.UPLOADED,
        statusMessage: "Queued for processing",
      },
    });

    jobs.push({
      documentId: document.id,
      fileName: item.fileName,
      mimeType: item.mimeType,
      buffer: item.buffer,
    });
  }

  return jobs;
}

export async function processIngestionJob(params: {
  projectId: string;
  documentId: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): Promise<IngestionResult> {
  const project = await prisma.project.findUnique({ where: { id: params.projectId } });

  if (!project) {
    throw new Error("Project not found");
  }

  const namespace = project.vectorNamespace || buildProjectVectorNamespace(project.id);
  const vectorAdapter = getVectorAdapter();

  try {
    await prisma.document.update({
      where: { id: params.documentId },
      data: {
        status: DocumentStatus.PARSING,
        statusMessage: "Parsing document",
      },
    });

    const parsedDocument = await extractTextFromBuffer(params.buffer, params.mimeType);

    await prisma.document.update({
      where: { id: params.documentId },
      data: {
        status: DocumentStatus.CHUNKING,
        parsingDoneAt: new Date(),
        statusMessage: "Text parsed successfully",
      },
    });

    const chunks = await chunkDocument(parsedDocument);

    await prisma.document.update({
      where: { id: params.documentId },
      data: {
        status: DocumentStatus.EMBEDDING,
        chunkingDoneAt: new Date(),
        statusMessage: `Created ${chunks.length} chunks`,
      },
    });

    const embeddings = await embedTexts(chunks.map((chunk) => chunk.content));
    const chunkRows = chunks.map((chunk, index) => ({
      id: randomUUID(),
      projectId: project.id,
      documentId: params.documentId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
      pageNumber: chunk.pageNumber,
      tokenCount: chunk.tokenCount,
      vectorId: buildVectorId({
        projectId: project.id,
        documentId: params.documentId,
        chunkIndex: chunk.chunkIndex,
      }),
      metadataJson: {
        fileName: params.fileName,
        source: "upload",
        embeddingIndex: index,
      },
    }));

    if (chunkRows.length > 0) {
      await prisma.documentChunk.createMany({ data: chunkRows });

      await vectorAdapter.upsert({
        namespace,
        vectors: chunkRows.map((row, index) => ({
          id: row.vectorId!,
          text: row.content,
          embedding: embeddings[index] ?? [],
          metadata: {
            projectId: project.id,
            documentId: params.documentId,
            chunkId: row.id,
            chunkIndex: row.chunkIndex,
            fileName: params.fileName,
          },
        })),
      });
    }

    await prisma.document.update({
      where: { id: params.documentId },
      data: {
        status: DocumentStatus.READY,
        embeddingDoneAt: new Date(),
        statusMessage: "Document is ready for retrieval",
      },
    });

    return {
      documentId: params.documentId,
      fileName: params.fileName,
      status: DocumentStatus.READY,
      chunkCount: chunkRows.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion error";

    await prisma.document.update({
      where: { id: params.documentId },
      data: {
        status: DocumentStatus.FAILED,
        statusMessage: message,
      },
    });

    return {
      documentId: params.documentId,
      fileName: params.fileName,
      status: DocumentStatus.FAILED,
      chunkCount: 0,
      error: message,
    };
  }
}

export async function ingestFilesForProject(params: {
  projectId: string;
  files: File[];
}): Promise<IngestionResult[]> {
  const items = await Promise.all(
    params.files.map(async (file) => ({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );

  const jobs = await createQueuedIngestionJobs({
    projectId: params.projectId,
    items,
  });

  const results: IngestionResult[] = [];

  for (const job of jobs) {
    const result = await processIngestionJob({
      projectId: params.projectId,
      documentId: job.documentId,
      buffer: job.buffer,
      fileName: job.fileName,
      mimeType: job.mimeType,
    });
    results.push(result);
  }

  return results;
}
