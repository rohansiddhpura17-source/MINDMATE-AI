-- Migration 003: Complete Planner and Friends functionality
-- Additive and safe schema updates for MindMate

-- 1. PLANNER TASKS TABLE & ENHANCEMENTS
CREATE TABLE IF NOT EXISTS planner_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  day TEXT NOT NULL,
  name TEXT NOT NULL,
  duration TEXT NOT NULL DEFAULT '30 min',
  type TEXT NOT NULL DEFAULT 'practice',
  completed BOOLEAN DEFAULT FALSE,
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  week_start DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure additive columns exist if table was already created
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium';
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE planner_tasks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Enable RLS on planner_tasks
ALTER TABLE planner_tasks ENABLE ROW LEVEL SECURITY;

-- Planner RLS Policies
DROP POLICY IF EXISTS "Users own planner" ON planner_tasks;
DROP POLICY IF EXISTS "Users can view own planner tasks" ON planner_tasks;
DROP POLICY IF EXISTS "Users can insert own planner tasks" ON planner_tasks;
DROP POLICY IF EXISTS "Users can update own planner tasks" ON planner_tasks;
DROP POLICY IF EXISTS "Users can delete own planner tasks" ON planner_tasks;

CREATE POLICY "Users can view own planner tasks"
  ON planner_tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own planner tasks"
  ON planner_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own planner tasks"
  ON planner_tasks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own planner tasks"
  ON planner_tasks FOR DELETE
  USING (auth.uid() = user_id);


-- 2. PROFILES PUBLIC DISCOVERY POLICY (Allow study peer networking)
-- Safe update so users can search each other by name or email
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
    ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Users own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can read all profiles" ON profiles;
    DROP POLICY IF EXISTS "Users can update only their own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;

    CREATE POLICY "Users can read all profiles"
      ON profiles FOR SELECT
      USING (auth.role() = 'authenticated');

    CREATE POLICY "Users can update only their own profile"
      ON profiles FOR UPDATE
      USING (auth.uid() = id);

    CREATE POLICY "Users can insert their own profile"
      ON profiles FOR INSERT
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;


-- 3. FRIEND REQUESTS AND FRIENDSHIPS TABLE
CREATE TABLE IF NOT EXISTS friend_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_friend_request UNIQUE(sender_id, receiver_id)
);

ALTER TABLE friend_requests ENABLE ROW LEVEL SECURITY;

-- Friend Requests RLS Policies
DROP POLICY IF EXISTS "Users can view friend requests they sent or received" ON friend_requests;
DROP POLICY IF EXISTS "Users can send friend requests" ON friend_requests;
DROP POLICY IF EXISTS "Users can update their friend requests" ON friend_requests;
DROP POLICY IF EXISTS "Users can delete their friend requests" ON friend_requests;

CREATE POLICY "Users can view friend requests they sent or received"
  ON friend_requests FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users can send friend requests"
  ON friend_requests FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND sender_id <> receiver_id);

CREATE POLICY "Users can update their friend requests"
  ON friend_requests FOR UPDATE
  USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

CREATE POLICY "Users can delete their friend requests"
  ON friend_requests FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Indexes for optimal performance
CREATE INDEX IF NOT EXISTS idx_planner_tasks_user_day ON planner_tasks(user_id, day);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender ON friend_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver ON friend_requests(receiver_id);
