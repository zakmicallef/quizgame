import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function generateGameCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

const AVATAR_COLORS = ['#f43f5e', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b']

export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    const { playerName } = await request.json()

    if (!playerName || playerName.trim().length < 1) {
      return NextResponse.json({ error: 'Player name required' }, { status: 400 })
    }

    // Generate unique game code
    let code = generateGameCode()
    let attempts = 0
    
    while (attempts < 10) {
      const { data: existing } = await supabase
        .from('game_sessions')
        .select('id')
        .eq('code', code)
        .single()
      
      if (!existing) break
      code = generateGameCode()
      attempts++
    }

    // Create game session
    const { data: game, error: gameError } = await supabase
      .from('game_sessions')
      .insert({ code, status: 'waiting' })
      .select()
      .single()

    if (gameError) {
      console.error('Game creation error:', gameError)
      return NextResponse.json({ error: 'Failed to create game' }, { status: 500 })
    }

    // Create projector player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        game_id: game.id,
        name: playerName.trim(),
        is_projector: true,
        avatar_color: AVATAR_COLORS[0],
      })
      .select()
      .single()

    if (playerError) {
      console.error('Player creation error:', playerError)
      return NextResponse.json({ error: 'Failed to create player' }, { status: 500 })
    }

    return NextResponse.json({
      game,
      player,
      isProjector: true,
    })
  } catch (err) {
    console.error('Create game error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


