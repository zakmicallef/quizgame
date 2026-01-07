import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const AVATAR_COLORS = ['#f43f5e', '#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b']

export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    const { gameCode, playerName } = await request.json()

    if (!gameCode || !playerName || playerName.trim().length < 1) {
      return NextResponse.json({ error: 'Game code and player name required' }, { status: 400 })
    }

    // Find game by code
    const { data: game, error: gameError } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('code', gameCode.toUpperCase())
      .single()

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    if (game.status !== 'waiting') {
      return NextResponse.json({ error: 'Game already started' }, { status: 400 })
    }

    // Check current player count (max 4 players + 1 projector)
    const { data: existingPlayers, error: countError } = await supabase
      .from('players')
      .select('id, is_projector')
      .eq('game_id', game.id)

    if (countError) {
      return NextResponse.json({ error: 'Failed to check players' }, { status: 500 })
    }

    const playerCount = existingPlayers?.filter(p => !p.is_projector).length || 0

    if (playerCount >= 4) {
      return NextResponse.json({ error: 'Game is full (4 players max)' }, { status: 400 })
    }

    // Assign color based on join order
    const colorIndex = (playerCount + 1) % AVATAR_COLORS.length

    // Create player
    const { data: player, error: playerError } = await supabase
      .from('players')
      .insert({
        game_id: game.id,
        name: playerName.trim(),
        is_projector: false,
        avatar_color: AVATAR_COLORS[colorIndex],
      })
      .select()
      .single()

    if (playerError) {
      console.error('Player creation error:', playerError)
      return NextResponse.json({ error: 'Failed to join game' }, { status: 500 })
    }

    return NextResponse.json({
      game,
      player,
      isProjector: false,
    })
  } catch (err) {
    console.error('Join game error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}



