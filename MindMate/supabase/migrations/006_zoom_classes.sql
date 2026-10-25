-- =============================================================================
-- Migration 006: Zoom Classes Scheduling & Planner Sync
-- Additive migration only. Preserves all existing tables and data.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.zoom_classes (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  instructor_name TEXT DEFAULT '',
  scheduled_date TEXT NOT NULL, -- YYYY-MM-DD in local schedule
  start_time TEXT NOT NULL,     -- HH:mm (24h)
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes >= 15 AND duration_minutes <= 360),
  meeting_url TEXT NOT NULL,
  topic_id TEXT DEFAULT 'python-functions',
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed', 'cancelled')),
  planner_task_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_zoom_classes_user_date
  ON public.zoom_classes (user_id, scheduled_date, start_time);

CREATE INDEX IF NOT EXISTS idx_zoom_classes_user_status
  ON public.zoom_classes (user_id, status);

ALTER TABLE public.zoom_classes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'zoom_classes'
      AND policyname = 'Users can view their own zoom classes'
  ) THEN
    CREATE POLICY "Users can view their own zoom classes"
      ON public.zoom_classes FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'zoom_classes'
      AND policyname = 'Users can insert their own zoom classes'
  ) THEN
    CREATE POLICY "Users can insert their own zoom classes"
      ON public.zoom_classes FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'zoom_classes'
      AND policyname = 'Users can update their own zoom classes'
  ) THEN
    CREATE POLICY "Users can update their own zoom classes"
      ON public.zoom_classes FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'zoom_classes'
      AND policyname = 'Users can delete their own zoom classes'
  ) THEN
    CREATE POLICY "Users can delete their own zoom classes"
      ON public.zoom_classes FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
