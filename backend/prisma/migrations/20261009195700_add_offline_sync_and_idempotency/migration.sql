-- AlterTable
ALTER TABLE "quiz_attempts" ADD COLUMN "clientEventId" TEXT;

-- CreateTable
CREATE TABLE "sync_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SYNCED',
    "payloadJson" TEXT NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "sync_events_clientEventId_key" ON "sync_events"("clientEventId");

-- CreateIndex
CREATE INDEX "sync_events_userId_idx" ON "sync_events"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_attempts_clientEventId_key" ON "quiz_attempts"("clientEventId");
