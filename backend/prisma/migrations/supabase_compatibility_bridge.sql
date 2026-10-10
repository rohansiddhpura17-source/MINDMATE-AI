-- MindMate / AdaptLearn AI - Supabase PostgreSQL Compatibility Bridge
-- This script prepares the friend's Supabase PostgreSQL database to safely
-- host both the friend's simplified tables AND the rich Milestones 1-8 models.

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Friend's Native Profiles Table (Compatible with Supabase Auth or Local Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  goal TEXT,
  learning_style TEXT DEFAULT 'Examples first',
  preferred_session TEXT DEFAULT '30-45 min',
  streak INTEGER DEFAULT 0,
  overall_mastery FLOAT DEFAULT 0,
  learning_efficiency FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Friend's Topics Table
CREATE TABLE IF NOT EXISTS topics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  mastery FLOAT DEFAULT 0,
  status TEXT DEFAULT 'not-started',
  subject TEXT DEFAULT 'General',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- 4. Friend's Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  topic TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Friend's Quiz Sessions Table
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  topic TEXT,
  score INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  accuracy FLOAT DEFAULT 0,
  main_gap TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Friend's Planner Tasks Table
CREATE TABLE IF NOT EXISTS planner_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  day TEXT,
  name TEXT,
  duration TEXT,
  type TEXT DEFAULT 'practice',
  completed BOOLEAN DEFAULT FALSE,
  week_start DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Friend's Materials Table
CREATE TABLE IF NOT EXISTS materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT,
  type TEXT DEFAULT 'Text',
  status TEXT DEFAULT 'ready',
  raw_content TEXT,
  summary TEXT,
  key_concepts TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Friend's Insights Table
CREATE TABLE IF NOT EXISTS insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT,
  title TEXT,
  description TEXT,
  action TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Non-Destructive Synchronization Views
-- Maps rich learner_progress to friend's topics table without data loss
CREATE OR REPLACE VIEW view_friend_topics AS
SELECT 
  id,
  user_id,
  name,
  mastery,
  status,
  subject
FROM topics;
