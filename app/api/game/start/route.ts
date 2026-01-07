import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    const { gameCode, playerId } = await request.json()

    if (!gameCode) {
      return NextResponse.json({ error: 'Game code required' }, { status: 400 })
    }

    // Find the game
    const { data: game, error: gameError } = await supabase
      .from('game_sessions')
      .select('*')
      .eq('code', gameCode.toUpperCase())
      .single()

    if (gameError || !game) {
      return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    }

    // Verify the requester is the host (projector)
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .eq('game_id', game.id)
      .single()

    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found in game' }, { status: 404 })
    }

    if (!player.is_projector) {
      return NextResponse.json({ error: 'Only the host can start the game' }, { status: 403 })
    }

    // Check if game is in waiting state
    if (game.status !== 'waiting') {
      return NextResponse.json({ error: 'Game already started or finished' }, { status: 400 })
    }

    // Update game status to 'playing'
    const { data: updatedGame, error: updateError } = await supabase
      .from('game_sessions')
      .update({ status: 'playing' })
      .eq('id', game.id)
      .select()
      .single()

    if (updateError) {
      console.error('Failed to start game:', updateError)
      return NextResponse.json({ error: 'Failed to start game' }, { status: 500 })
    }

    return NextResponse.json({ game: updatedGame })
  } catch (err) {
    console.error('Start game error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

