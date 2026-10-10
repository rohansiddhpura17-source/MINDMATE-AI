-- CreateTable
CREATE TABLE "adaptive_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topicId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "optionsJson" TEXT NOT NULL,
    "correct" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "skill" TEXT,
    "source" TEXT NOT NULL DEFAULT 'SYSTEM',
    "materialId" TEXT,
    "pageCitation" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_learner_progress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "masteryScore" REAL NOT NULL DEFAULT 50.0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "confidenceLevel" TEXT NOT NULL DEFAULT 'INSUFFICIENT_EVIDENCE',
    "currentDifficulty" TEXT NOT NULL DEFAULT 'medium',
    "consecutiveCorrect" INTEGER NOT NULL DEFAULT 0,
    "consecutiveIncorrect" INTEGER NOT NULL DEFAULT 0,
    "lastPracticed" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "learner_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_learner_progress" ("attemptCount", "correctCount", "id", "lastPracticed", "masteryScore", "streakDays", "topicId", "topicName", "updatedAt", "userId") SELECT "attemptCount", "correctCount", "id", "lastPracticed", "masteryScore", "streakDays", "topicId", "topicName", "updatedAt", "userId" FROM "learner_progress";
DROP TABLE "learner_progress";
ALTER TABLE "new_learner_progress" RENAME TO "learner_progress";
CREATE INDEX "learner_progress_userId_idx" ON "learner_progress"("userId");
CREATE UNIQUE INDEX "learner_progress_userId_topicId_key" ON "learner_progress"("userId", "topicId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "adaptive_questions_topicId_idx" ON "adaptive_questions"("topicId");

-- CreateIndex
CREATE INDEX "adaptive_questions_topicId_difficulty_idx" ON "adaptive_questions"("topicId", "difficulty");
