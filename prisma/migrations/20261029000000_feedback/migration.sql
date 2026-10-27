-- Fase 8b: buzón de ideas, mejoras y errores.
-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('error', 'idea', 'mejora');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('new', 'read', 'done');

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "kind" "FeedbackKind" NOT NULL,
    "message" TEXT NOT NULL,
    "images" JSONB NOT NULL,
    "context" JSONB NOT NULL,
    "path" TEXT NOT NULL,
    "tripId" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

