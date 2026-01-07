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

-- Quiz questions table (multiple choice questions about icebreaker answers)
CREATE TABLE IF NOT EXISTS quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID REFERENCES game_sessions(id) ON DELETE CASCADE,
  about_player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  question_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Quiz answers table (player answers to quiz questions)
CREATE TABLE IF NOT EXISTS quiz_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_question_id UUID REFERENCES quiz_questions(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  selected_option TEXT CHECK (selected_option IN ('A', 'B', 'C', 'D')),
  is_correct BOOLEAN,
  answered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(quiz_question_id, player_id)
);

-- Create indexes for quiz tables
CREATE INDEX IF NOT EXISTS idx_quiz_questions_game_id ON quiz_questions(game_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_about_player ON quiz_questions(about_player_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_question_id ON quiz_answers(quiz_question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_answers_player_id ON quiz_answers(player_id);

-- Enable Row Level Security on quiz tables
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_answers ENABLE ROW LEVEL SECURITY;

-- Allow all operations for quiz tables
CREATE POLICY "Allow all on quiz_questions" ON quiz_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on quiz_answers" ON quiz_answers FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for quiz tables
ALTER TABLE quiz_questions REPLICA IDENTITY FULL;
ALTER TABLE quiz_answers REPLICA IDENTITY FULL;

-- Add quiz tables to realtime publication
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE quiz_questions;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE quiz_answers;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Add quiz-related columns to game_sessions for tracking quiz state
ALTER TABLE game_sessions 
ADD COLUMN IF NOT EXISTS current_quiz_question_id UUID,
ADD COLUMN IF NOT EXISTS current_quiz_question_number INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS quiz_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS question_deadline TIMESTAMPTZ;

-- Update phase check to include quiz phases
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_phase_check;
ALTER TABLE game_sessions ADD CONSTRAINT game_sessions_phase_check 
CHECK (phase IN ('lobby', 'asking', 'showing_answers', 'quiz', 'quiz_question', 'quiz_results', 'game_over'));

