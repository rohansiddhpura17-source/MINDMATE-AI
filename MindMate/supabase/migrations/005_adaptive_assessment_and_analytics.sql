-- ==============================================================================
-- MindMate — Migration 005: Adaptive Assessment, Mastery Analytics & Idempotency
-- Additive migration for Member 2 (Adaptive Learning Engine) and
-- Member 3 (Assessment, Learner Data & Analytics).
-- ==============================================================================

-- 1. Extend user_question_attempts with quiz_id, attempt_type, concept_tag,
--    response_duration_ms, session_id, and idempotent client_attempt_id
ALTER TABLE public.user_question_attempts
  ADD COLUMN IF NOT EXISTS quiz_id TEXT,
  ADD COLUMN IF NOT EXISTS attempt_type TEXT DEFAULT 'adaptive',
  ADD COLUMN IF NOT EXISTS concept_tag TEXT,
  ADD COLUMN IF NOT EXISTS response_duration_ms INTEGER,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS client_attempt_id TEXT;

-- Idempotency constraint so offline retries / duplicate submissions do not create duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_question_attempts_client_id
  ON public.user_question_attempts (user_id, client_attempt_id)
  WHERE client_attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_question_attempts_user_topic_time
  ON public.user_question_attempts (user_id, topic_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_question_attempts_session
  ON public.user_question_attempts (user_id, session_id)
  WHERE session_id IS NOT NULL;

-- Ensure complete RLS policies on user_question_attempts (authenticated learner only)
ALTER TABLE public.user_question_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_question_attempts'
      AND policyname = 'Users can delete own question attempts'
  ) THEN
    CREATE POLICY "Users can delete own question attempts"
      ON public.user_question_attempts FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 2. Extend quiz_sessions with attempt metadata & idempotency key
ALTER TABLE public.quiz_sessions
  ADD COLUMN IF NOT EXISTS quiz_id TEXT,
  ADD COLUMN IF NOT EXISTS attempt_type TEXT DEFAULT 'adaptive',
  ADD COLUMN IF NOT EXISTS topic_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS client_session_id TEXT,
  ADD COLUMN IF NOT EXISTS difficulty_start INTEGER,
  ADD COLUMN IF NOT EXISTS difficulty_end INTEGER,
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_sessions_client_session_id
  ON public.quiz_sessions (user_id, client_session_id)
  WHERE client_session_id IS NOT NULL;

-- 3. Extend topics table with auditable mastery evidence columns
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS topic_id TEXT,
  ADD COLUMN IF NOT EXISTS total_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS correct_attempts INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recent_accuracy FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_level TEXT DEFAULT 'insufficient',
  ADD COLUMN IF NOT EXISTS last_practiced_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_topics_user_topic_id
  ON public.topics (user_id, topic_id)
  WHERE topic_id IS NOT NULL;

-- 4. Create learner_recommendations table for persisted, evidence-backed recommendations
CREATE TABLE IF NOT EXISTS public.learner_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  topic_name TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  supporting_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_difficulty TEXT NOT NULL DEFAULT 'medium',
  explanation_strategy TEXT NOT NULL DEFAULT 'step-by-step',
  priority INTEGER NOT NULL DEFAULT 1,
  dismissed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, topic_id, action)
);

ALTER TABLE public.learner_recommendations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'learner_recommendations'
      AND policyname = 'Users can view own recommendations'
  ) THEN
    CREATE POLICY "Users can view own recommendations"
      ON public.learner_recommendations FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'learner_recommendations'
      AND policyname = 'Users can insert own recommendations'
  ) THEN
    CREATE POLICY "Users can insert own recommendations"
      ON public.learner_recommendations FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'learner_recommendations'
      AND policyname = 'Users can update own recommendations'
  ) THEN
    CREATE POLICY "Users can update own recommendations"
      ON public.learner_recommendations FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'learner_recommendations'
      AND policyname = 'Users can delete own recommendations'
  ) THEN
    CREATE POLICY "Users can delete own recommendations"
      ON public.learner_recommendations FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. Atomic RPC to record an attempt and update topic mastery in a single transaction
CREATE OR REPLACE FUNCTION public.record_attempt_and_update_mastery(
  p_client_attempt_id TEXT,
  p_quiz_id TEXT,
  p_attempt_type TEXT,
  p_session_id TEXT,
  p_question_id TEXT,
  p_subject_id TEXT,
  p_topic_id TEXT,
  p_topic_name TEXT,
  p_concept_tag TEXT,
  p_difficulty INTEGER,
  p_question_text TEXT,
  p_selected_option INTEGER,
  p_correct_option INTEGER,
  p_is_correct BOOLEAN,
  p_explanation TEXT,
  p_options JSONB,
  p_response_duration_ms INTEGER,
  p_attempted_at TIMESTAMPTZ,
  p_computed_mastery FLOAT,
  p_computed_status TEXT,
  p_total_attempts INTEGER,
  p_correct_attempts INTEGER,
  p_recent_accuracy FLOAT,
  p_confidence_level TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_attempt_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO public.user_question_attempts (
    user_id,
    client_attempt_id,
    quiz_id,
    attempt_type,
    session_id,
    question_id,
    subject_id,
    topic_id,
    topic_name,
    concept_tag,
    difficulty,
    question_text,
    selected_option,
    correct_option,
    is_correct,
    explanation,
    options,
    response_duration_ms,
    resolved,
    attempted_at
  )
  VALUES (
    v_user_id,
    p_client_attempt_id,
    p_quiz_id,
    COALESCE(p_attempt_type, 'adaptive'),
    p_session_id,
    p_question_id,
    p_subject_id,
    p_topic_id,
    p_topic_name,
    p_concept_tag,
    p_difficulty,
    p_question_text,
    p_selected_option,
    p_correct_option,
    p_is_correct,
    p_explanation,
    COALESCE(p_options, '[]'::jsonb),
    p_response_duration_ms,
    p_is_correct,
    COALESCE(p_attempted_at, NOW())
  )
  ON CONFLICT (user_id, client_attempt_id) WHERE client_attempt_id IS NOT NULL
  DO UPDATE SET
    resolved = EXCLUDED.resolved
  RETURNING id INTO v_attempt_id;

  INSERT INTO public.topics (
    user_id,
    topic_id,
    name,
    subject,
    mastery,
    status,
    total_attempts,
    correct_attempts,
    recent_accuracy,
    confidence_level,
    last_practiced_at,
    updated_at
  )
  VALUES (
    v_user_id,
    p_topic_id,
    p_topic_name,
    p_subject_id,
    p_computed_mastery,
    p_computed_status,
    p_total_attempts,
    p_correct_attempts,
    p_recent_accuracy,
    p_confidence_level,
    COALESCE(p_attempted_at, NOW()),
    NOW()
  )
  ON CONFLICT (user_id, name)
  DO UPDATE SET
    topic_id = EXCLUDED.topic_id,
    mastery = EXCLUDED.mastery,
    status = EXCLUDED.status,
    total_attempts = EXCLUDED.total_attempts,
    correct_attempts = EXCLUDED.correct_attempts,
    recent_accuracy = EXCLUDED.recent_accuracy,
    confidence_level = EXCLUDED.confidence_level,
    last_practiced_at = EXCLUDED.last_practiced_at,
    updated_at = NOW();

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'topic_id', p_topic_id,
    'mastery', p_computed_mastery,
    'confidence_level', p_confidence_level
  );
END;
$$;
