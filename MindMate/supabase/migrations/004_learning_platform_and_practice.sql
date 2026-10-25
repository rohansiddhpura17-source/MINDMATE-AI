-- ==============================================================================
-- Migration 004: Learning Platform, Practice Modes, Mistakes, and Achievements
-- ==============================================================================

-- 1. Extend planner_tasks for activity validation
ALTER TABLE planner_tasks
  ADD COLUMN IF NOT EXISTS activity_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS activity_type TEXT,
  ADD COLUMN IF NOT EXISTS topic TEXT;

-- 2. User Question Attempts (records every adaptive quiz question, recall test, and tracks mistakes)
CREATE TABLE IF NOT EXISTS user_question_attempts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  question_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  topic_name TEXT,
  difficulty INTEGER DEFAULT 1,
  question_text TEXT NOT NULL,
  selected_option INTEGER NOT NULL,
  correct_option INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL,
  explanation TEXT,
  options JSONB,
  resolved BOOLEAN DEFAULT FALSE,
  attempted_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. User Flashcard Progress (spaced repetition status: learning vs mastered)
CREATE TABLE IF NOT EXISTS user_flashcard_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  card_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  status TEXT DEFAULT 'learning', -- 'learning' | 'mastered'
  last_reviewed TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, card_id)
);

-- 4. Learning Wins & Milestone Badges
CREATE TABLE IF NOT EXISTS learning_wins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT DEFAULT 'milestone', -- 'streak' | 'mastery' | 'quiz' | 'milestone'
  icon TEXT DEFAULT 'Trophy',
  metric_value TEXT,
  achieved_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_question_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_flashcard_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_wins ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users own question attempts" ON user_question_attempts
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own flashcard progress" ON user_flashcard_progress
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users own learning wins" ON learning_wins
  FOR ALL USING (auth.uid() = user_id);

-- Helpful indices for fast query performance
CREATE INDEX IF NOT EXISTS idx_question_attempts_user_mistakes
  ON user_question_attempts(user_id, is_correct, resolved);

CREATE INDEX IF NOT EXISTS idx_flashcards_user_topic
  ON user_flashcard_progress(user_id, topic_id);
