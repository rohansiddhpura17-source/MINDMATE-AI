-- Safe additive migration for MindMate profile avatars, bio, and settings
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT '/avatars/avatar-01.webp';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS theme TEXT DEFAULT 'light';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
