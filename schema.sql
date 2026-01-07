-- Quiz Game Schema
-- Run this in your Supabase SQL Editor

-- Game sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  current_question_id UUID,
  current_question_number INTEGER DEFAULT 0,
  phase VARCHAR(30) DEFAULT 'lobby' CHECK (phase IN ('lobby', 'asking', 'showing_answers', 'quiz')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  is_projector BOOLEAN DEFAULT FALSE,
  score INTEGER DEFAULT 0,
  avatar_color VARCHAR(20) DEFAULT '#6366f1',
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_code ON game_sessions(code);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (adjust for production)
CREATE POLICY "Allow all on game_sessions" ON game_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on players" ON players FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for players table (for live player joins)
-- This is required for realtime to track all column changes
ALTER TABLE players REPLICA IDENTITY FULL;

-- Enable realtime for game_sessions table (for game status updates)
ALTER TABLE game_sessions REPLICA IDENTITY FULL;

-- Add tables to realtime publication (run this, ignore if already exists)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE players;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE game_sessions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Questions table for storing generated questions
CREATE TABLE IF NOT EXISTS questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  question_number INTEGER NOT NULL,
  question_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Answers table for storing player answers
CREATE TABLE IF NOT EXISTS answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  answer_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(question_id, player_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_questions_game_id ON questions(game_id);
CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_answers_player_id ON answers(player_id);

-- Enable Row Level Security
ALTER TABLE questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (adjust for production)
CREATE POLICY "Allow all on questions" ON questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on answers" ON answers FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for answers table
ALTER TABLE questions REPLICA IDENTITY FULL;
ALTER TABLE answers REPLICA IDENTITY FULL;

-- Add tables to realtime publication
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE questions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE answers;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

