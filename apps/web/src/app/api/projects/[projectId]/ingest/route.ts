import { after } from "next/server";
import {
  createQueuedIngestionJobs,
  processIngestionJob,
} from "@/features/ingestion/ingestion-service";

export const runtime = "nodejs";

const ingestAsyncDefault = process.env.INGEST_ASYNC !== "false";

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const formData = await request.formData();
  const entries = formData.getAll("files");

  const files = entries.filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return Response.json(
      {
        error: "No files received. Submit files[] in multipart form data.",
      },
      { status: 400 },
    );
  }

  const items = await Promise.all(
    files.map(async (file) => ({
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      buffer: Buffer.from(await file.arrayBuffer()),
    })),
  );

  const jobs = await createQueuedIngestionJobs({ projectId, items });

  if (!ingestAsyncDefault) {
    const results = [];
    for (const job of jobs) {
      results.push(
        await processIngestionJob({
          projectId,
          documentId: job.documentId,
          buffer: job.buffer,
          fileName: job.fileName,
          mimeType: job.mimeType,
        }),
      );
    }

    return Response.json({
      projectId,
      mode: "sync",
      count: results.length,
      results,
    });
  }

  after(async () => {
    for (const job of jobs) {
      await processIngestionJob({
        projectId,
        documentId: job.documentId,
        buffer: job.buffer,
        fileName: job.fileName,
        mimeType: job.mimeType,
      });
    }
  });

  return Response.json(
    {
      projectId,
      mode: "async",
      accepted: true,
      count: jobs.length,
      jobs: jobs.map((job) => ({
        documentId: job.documentId,
        fileName: job.fileName,
      })),
    },
    { status: 202 },
  );
}
