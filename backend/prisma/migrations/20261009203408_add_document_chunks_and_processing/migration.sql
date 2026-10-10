-- CreateTable
CREATE TABLE "document_chunks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "materialId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_chunks_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "learning_materials" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_learning_materials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PDF',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "pages" INTEGER NOT NULL DEFAULT 1,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "filePath" TEXT,
    "summaryJson" TEXT,
    "keyConceptsJson" TEXT,
    "flashcardsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "learning_materials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_learning_materials" ("createdAt", "fileSize", "id", "name", "pages", "status", "type", "userId") SELECT "createdAt", "fileSize", "id", "name", "pages", "status", "type", "userId" FROM "learning_materials";
DROP TABLE "learning_materials";
ALTER TABLE "new_learning_materials" RENAME TO "learning_materials";
CREATE INDEX "learning_materials_userId_idx" ON "learning_materials"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "document_chunks_materialId_idx" ON "document_chunks"("materialId");

-- CreateIndex
CREATE INDEX "document_chunks_materialId_pageNumber_idx" ON "document_chunks"("materialId", "pageNumber");
