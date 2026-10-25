-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- PROFILES (linked to Supabase auth)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  email TEXT,
  goal TEXT,
  learning_style TEXT DEFAULT 'Examples first',
  preferred_session TEXT DEFAULT '30-45 min',
  streak INTEGER DEFAULT 0,
  overall_mastery FLOAT DEFAULT 0,
  learning_efficiency FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TOPICS
CREATE TABLE IF NOT EXISTS topics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  mastery FLOAT DEFAULT 0,
  status TEXT DEFAULT 'not-started',
  subject TEXT DEFAULT 'General',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- CHAT MESSAGES
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  topic TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- QUIZ SESSIONS
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  topic TEXT,
  score INTEGER DEFAULT 0,
  total INTEGER DEFAULT 0,
  accuracy FLOAT DEFAULT 0,
  main_gap TEXT,
  completed_at TIMESTAMPTZ DEFAULT NOW()
);

-- PLANNER TASKS
CREATE TABLE IF NOT EXISTS planner_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  day TEXT,
  name TEXT,
  duration TEXT,
  type TEXT DEFAULT 'practice',
  completed BOOLEAN DEFAULT FALSE,
  week_start DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MATERIALS
CREATE TABLE IF NOT EXISTS materials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT,
  type TEXT DEFAULT 'Text',
  status TEXT DEFAULT 'ready',
  raw_content TEXT,
  summary TEXT,
  key_concepts TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INSIGHTS
CREATE TABLE IF NOT EXISTS insights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  type TEXT,
  title TEXT,
  description TEXT,
  action TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ROW LEVEL SECURITY
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE planner_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE insights ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES (users access only their own data)
CREATE POLICY "Users own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users own topics" ON topics FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own chat" ON chat_messages FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own quiz" ON quiz_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own planner" ON planner_tasks FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own materials" ON materials FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users own insights" ON insights FOR ALL USING (auth.uid() = user_id);

-- AUTO-CREATE PROFILE ON SIGNUP
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  default_topics TEXT[] := ARRAY['Variables','Conditions','Loops','Functions','OOP','DBMS'];
  t TEXT;
BEGIN
  INSERT INTO profiles (id, name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'name', NEW.email);

  FOREACH t IN ARRAY default_topics LOOP
    INSERT INTO topics (user_id, name) VALUES (NEW.id, t)
    ON CONFLICT (user_id, name) DO NOTHING;
  END LOOP;

  INSERT INTO insights (user_id, type, title, description, action) VALUES
    (NEW.id, 'behavior', 'Performance drops in long sessions',
     'Your accuracy drops after 45+ minute sessions. Shorter focused sessions improve retention.',
     'Adjust schedule'),
    (NEW.id, 'mastery', 'Start your learning journey',
     'Complete your first quiz to see personalized insights here.',
     'Take a quiz');

  INSERT INTO planner_tasks (user_id, day, name, duration, type) VALUES
    (NEW.id, 'Mon', 'Python Functions', '25 min', 'practice'),
    (NEW.id, 'Tue', 'OOP Recovery', '30 min', 'recovery'),
    (NEW.id, 'Wed', 'DBMS Review', '25 min', 'review'),
    (NEW.id, 'Thu', 'Quiz Session', '20 min', 'quiz'),
    (NEW.id, 'Fri', 'Mock Assessment', '40 min', 'assessment');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
