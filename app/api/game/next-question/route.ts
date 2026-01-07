import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    const { gameCode, playerId, action } = await request.json()

    if (!gameCode || !playerId) {
      return NextResponse.json({ error: 'Game code and player ID required' }, { status: 400 })
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

    // Verify the requester is the host
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
      return NextResponse.json({ error: 'Only the host can advance the game' }, { status: 403 })
    }

    // Get all questions for this game
    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', game.id)
      .order('question_number', { ascending: true })

    if (!questions || questions.length === 0) {
      return NextResponse.json({ error: 'No questions found' }, { status: 404 })
    }

    const totalQuestions = questions.length
    const currentQuestionNumber = game.current_question_number || 0

    // Determine next state based on action
    if (action === 'show_answers') {
      // Transition from 'asking' to 'showing_answers'
      const { data: updatedGame, error: updateError } = await supabase
        .from('game_sessions')
        .update({ phase: 'showing_answers' })
        .eq('id', game.id)
        .select()
        .single()

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update game' }, { status: 500 })
      }

      return NextResponse.json({ game: updatedGame, action: 'showing_answers' })
    }

    if (action === 'next_question') {
      const nextQuestionNumber = currentQuestionNumber + 1

      if (nextQuestionNumber > totalQuestions) {
        // All questions done, move to quiz phase
        const { data: updatedGame, error: updateError } = await supabase
          .from('game_sessions')
          .update({ 
            phase: 'quiz',
            current_question_number: totalQuestions
          })
          .eq('id', game.id)
          .select()
          .single()

        if (updateError) {
          return NextResponse.json({ error: 'Failed to update game' }, { status: 500 })
        }

        return NextResponse.json({ game: updatedGame, action: 'quiz_start', finished: true })
      }

      // Move to next question
      const nextQuestion = questions.find(q => q.question_number === nextQuestionNumber)
      
      const { data: updatedGame, error: updateError } = await supabase
        .from('game_sessions')
        .update({ 
          phase: 'asking',
          current_question_number: nextQuestionNumber,
          current_question_id: nextQuestion?.id
        })
        .eq('id', game.id)
        .select()
        .single()

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update game' }, { status: 500 })
      }

      return NextResponse.json({ 
        game: updatedGame, 
        action: 'next_question',
        questionNumber: nextQuestionNumber,
        totalQuestions
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('Next question error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}



