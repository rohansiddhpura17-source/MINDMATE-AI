-- CreateTable
CREATE TABLE "spaced_repetition_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "materialId" TEXT,
    "repetitionNumber" INTEGER NOT NULL DEFAULT 0,
    "intervalDays" REAL NOT NULL DEFAULT 1.0,
    "easeFactor" REAL NOT NULL DEFAULT 2.5,
    "lastReviewedAt" DATETIME,
    "nextReviewAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastOutcome" TEXT,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "spaced_repetition_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "study_tasks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 15,
    "targetDifficulty" TEXT NOT NULL DEFAULT 'medium',
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "isPostponed" BOOLEAN NOT NULL DEFAULT false,
    "postponedToDate" TEXT,
    "priorityScore" REAL NOT NULL DEFAULT 0.0,
    "recommendationReason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'ALGORITHM',
    "actionUrl" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "study_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user_preferences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "adaptiveDifficulty" BOOLEAN NOT NULL DEFAULT true,
    "personalizedRecs" BOOLEAN NOT NULL DEFAULT true,
    "proactiveAI" BOOLEAN NOT NULL DEFAULT true,
    "learningInsights" BOOLEAN NOT NULL DEFAULT true,
    "cloudAI" BOOLEAN NOT NULL DEFAULT false,
    "learningStyle" TEXT NOT NULL DEFAULT 'visual',
    "dailyGoalMinutes" INTEGER NOT NULL DEFAULT 30,
    "targetDaysJson" TEXT NOT NULL DEFAULT '["Mon","Tue","Wed","Thu","Fri"]',
    "preferredSessionMinutes" INTEGER NOT NULL DEFAULT 15,
    "targetGoalDate" DATETIME,
    "targetGoalName" TEXT,
    "priorityTopicsJson" TEXT NOT NULL DEFAULT '[]',
    "reviewStrategy" TEXT NOT NULL DEFAULT 'BALANCED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_user_preferences" ("adaptiveDifficulty", "cloudAI", "createdAt", "dailyGoalMinutes", "id", "learningInsights", "learningStyle", "personalizedRecs", "proactiveAI", "updatedAt", "userId") SELECT "adaptiveDifficulty", "cloudAI", "createdAt", "dailyGoalMinutes", "id", "learningInsights", "learningStyle", "personalizedRecs", "proactiveAI", "updatedAt", "userId" FROM "user_preferences";
DROP TABLE "user_preferences";
ALTER TABLE "new_user_preferences" RENAME TO "user_preferences";
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "spaced_repetition_items_userId_idx" ON "spaced_repetition_items"("userId");

-- CreateIndex
CREATE INDEX "spaced_repetition_items_userId_nextReviewAt_idx" ON "spaced_repetition_items"("userId", "nextReviewAt");

-- CreateIndex
CREATE UNIQUE INDEX "spaced_repetition_items_userId_topicId_key" ON "spaced_repetition_items"("userId", "topicId");

-- CreateIndex
CREATE INDEX "study_tasks_userId_idx" ON "study_tasks"("userId");

-- CreateIndex
CREATE INDEX "study_tasks_userId_date_idx" ON "study_tasks"("userId", "date");

-- CreateIndex
CREATE INDEX "study_tasks_userId_isCompleted_idx" ON "study_tasks"("userId", "isCompleted");
