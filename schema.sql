-- Quiz Game Schema
-- Run this in your Supabase SQL Editor

-- Game sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(6) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  current_question_id UUID,
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

-- Add to realtime publication (run this, ignore if already exists)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE players;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

