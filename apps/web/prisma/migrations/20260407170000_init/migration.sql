CREATE EXTENSION IF NOT EXISTS vector;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."DocumentStatus" AS ENUM ('UPLOADED', 'PARSING', 'CHUNKING', 'EMBEDDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "public"."Project" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "vectorNamespace" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Document" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "checksum" TEXT,
    "status" "public"."DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "statusMessage" TEXT,
    "parsingDoneAt" TIMESTAMP(3),
    "chunkingDoneAt" TIMESTAMP(3),
    "embeddingDoneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER,
    "pageNumber" INTEGER,
    "startOffset" INTEGER,
    "endOffset" INTEGER,
    "vectorId" TEXT,
    "embedding" vector(1536),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Conversation" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "public"."MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Citation" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "anchorLabel" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "score" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Citation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_vectorNamespace_key" ON "public"."Project"("vectorNamespace");

-- CreateIndex
CREATE INDEX "Document_projectId_status_idx" ON "public"."Document"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_vectorId_key" ON "public"."DocumentChunk"("vectorId");

-- CreateIndex
CREATE INDEX "DocumentChunk_projectId_documentId_idx" ON "public"."DocumentChunk"("projectId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_key" ON "public"."DocumentChunk"("documentId", "chunkIndex");

-- CreateIndex
CREATE INDEX "Citation_messageId_idx" ON "public"."Citation"("messageId");

-- CreateIndex
CREATE INDEX "Citation_documentId_chunkId_idx" ON "public"."Citation"("documentId", "chunkId");

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentChunk" ADD CONSTRAINT "DocumentChunk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Conversation" ADD CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Citation" ADD CONSTRAINT "Citation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Citation" ADD CONSTRAINT "Citation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Citation" ADD CONSTRAINT "Citation_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "public"."DocumentChunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

