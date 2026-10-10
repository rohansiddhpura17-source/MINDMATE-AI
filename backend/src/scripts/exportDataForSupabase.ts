/**
 * MindMate / AdaptLearn AI - Data Export & Migration Bridge
 * 
 * Exports records from the local SQLite database into SQL statements compatible
 * with the friend's Supabase PostgreSQL schema.
 * 
 * Run with: npx tsx src/scripts/exportDataForSupabase.ts
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function exportData() {
  console.log('[Migration Bridge] Exporting existing SQLite records for Supabase...');

  const users = await prisma.user.findMany({
    include: {
      preferences: true,
      progress: true,
      quizAttempts: true,
      studyTasks: true,
      materials: true,
    },
  });

  console.log(`[Migration Bridge] Found ${users.length} registered users.`);

  let sqlStatements = '-- MindMate Data Migration Dump\n-- Generated from local SQLite database\n\n';

  for (const user of users) {
    // 1. Export Profile
    const name = user.name.replace(/'/g, "''");
    const email = user.email.replace(/'/g, "''");
    const goal = (user.goal || 'Master computer science concepts').replace(/'/g, "''");
    const learningStyle = user.preferences?.learningStyle || 'Examples first';
    const streak = user.progress.reduce((max, p) => Math.max(max, p.streakDays), 0);
    const avgMastery = user.progress.length > 0 
      ? user.progress.reduce((acc, p) => acc + p.masteryScore, 0) / user.progress.length 
      : 0;

    sqlStatements += `INSERT INTO profiles (id, name, email, goal, learning_style, streak, overall_mastery)\n`;
    sqlStatements += `VALUES ('${user.id}', '${name}', '${email}', '${goal}', '${learningStyle}', ${streak}, ${avgMastery.toFixed(1)})\n`;
    sqlStatements += `ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, overall_mastery = EXCLUDED.overall_mastery;\n\n`;

    // 2. Export Topics
    for (const p of user.progress) {
      const topicName = p.topicName.replace(/'/g, "''");
      const status = p.masteryScore >= 80 ? 'mastered' : p.masteryScore >= 60 ? 'strong' : 'developing';
      sqlStatements += `INSERT INTO topics (id, user_id, name, mastery, status, subject)\n`;
      sqlStatements += `VALUES ('${p.id}', '${user.id}', '${topicName}', ${p.masteryScore}, '${status}', 'Computer Science')\n`;
      sqlStatements += `ON CONFLICT (user_id, name) DO UPDATE SET mastery = EXCLUDED.mastery, status = EXCLUDED.status;\n`;
    }
    sqlStatements += '\n';

    // 3. Export Quiz Sessions
    for (const q of user.quizAttempts) {
      const topic = q.topicName.replace(/'/g, "''");
      const accuracy = q.totalQuestions > 0 ? (q.correctAnswers / q.totalQuestions) * 100 : 0;
      sqlStatements += `INSERT INTO quiz_sessions (id, user_id, topic, score, total, accuracy, completed_at)\n`;
      sqlStatements += `VALUES ('${q.id}', '${user.id}', '${topic}', ${Math.round(q.score)}, ${q.totalQuestions}, ${accuracy.toFixed(1)}, '${q.createdAt.toISOString()}');\n`;
    }
    sqlStatements += '\n';

    // 4. Export Planner Tasks
    for (const t of user.studyTasks) {
      const taskName = t.title.replace(/'/g, "''");
      const duration = `${t.estimatedMinutes} min`;
      const type = t.type.toLowerCase();
      sqlStatements += `INSERT INTO planner_tasks (id, user_id, day, name, duration, type, completed, created_at)\n`;
      sqlStatements += `VALUES ('${t.id}', '${user.id}', '${t.dayOfWeek}', '${taskName}', '${duration}', '${type}', ${t.isCompleted}, '${t.createdAt.toISOString()}');\n`;
    }
    sqlStatements += '\n';

    // 5. Export Materials
    for (const m of user.materials) {
      const matName = m.name.replace(/'/g, "''");
      const raw = (m.summaryJson || m.name).replace(/'/g, "''");
      sqlStatements += `INSERT INTO materials (id, user_id, name, type, status, raw_content, created_at)\n`;
      sqlStatements += `VALUES ('${m.id}', '${user.id}', '${matName}', '${m.type}', '${m.status.toLowerCase()}', '${raw}', '${m.createdAt.toISOString()}');\n`;
    }
    sqlStatements += '\n';
  }

  const outputPath = path.join(process.cwd(), 'prisma/migrations/sqlite_to_supabase_dump.sql');
  fs.writeFileSync(outputPath, sqlStatements, 'utf8');
  console.log(`[Migration Bridge] Successfully exported data to: ${outputPath}`);
}

exportData()
  .catch((err) => {
    console.error('[Migration Bridge Error]', err);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
