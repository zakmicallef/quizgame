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
      return NextResponse.json({ error: 'Only the host can advance the quiz' }, { status: 403 })
    }

    // Get all quiz questions for this game
    const { data: quizQuestions } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('game_id', game.id)
      .order('question_order', { ascending: true })

    if (!quizQuestions || quizQuestions.length === 0) {
      return NextResponse.json({ error: 'No quiz questions found' }, { status: 404 })
    }

    const totalQuestions = quizQuestions.length
    const currentQuestionNumber = game.current_quiz_question_number || 0
    const currentQuestion = quizQuestions.find(q => q.question_order === currentQuestionNumber)

    // Handle show_results action - calculate and apply scores
    if (action === 'show_results') {
      if (!currentQuestion) {
        return NextResponse.json({ error: 'Current question not found' }, { status: 404 })
      }

      // Get all answers for current question
      const { data: answers } = await supabase
        .from('quiz_answers')
        .select('*, players(*)')
        .eq('quiz_question_id', currentQuestion.id)

      // Get all non-projector players
      const { data: allPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', game.id)
        .eq('is_projector', false)

      // Calculate score changes
      const scoreChanges: { playerId: string; change: number; reason: string }[] = []
      const aboutPlayerId = currentQuestion.about_player_id
      const aboutPlayerAnswer = answers?.find(a => a.player_id === aboutPlayerId)
      
      // Check if everyone ran out of time (no answers)
      const answeredPlayerIds = answers?.map(a => a.player_id) || []
      const allTimedOut = allPlayers?.every(p => !answeredPlayerIds.includes(p.id))

      if (allTimedOut) {
        // Everyone timed out - the associated player loses 1 point
        scoreChanges.push({
          playerId: aboutPlayerId,
          change: -1,
          reason: 'Everyone ran out of time'
        })
      } else {
        // Process each player's answer
        for (const p of allPlayers || []) {
          const playerAnswer = answers?.find(a => a.player_id === p.id)
          
          if (p.id === aboutPlayerId) {
            // This is the player the question is about
            if (playerAnswer) {
              if (playerAnswer.is_correct) {
                // Associated player answered correctly - bonus!
                scoreChanges.push({
                  playerId: p.id,
                  change: 2,
                  reason: 'Correctly answered about yourself'
                })
              } else {
                // Associated player answered incorrectly - penalty
                scoreChanges.push({
                  playerId: p.id,
                  change: -1,
                  reason: 'Incorrectly answered about yourself'
                })
              }
            } else {
              // Associated player didn't answer (timed out) - penalty
              scoreChanges.push({
                playerId: p.id,
                change: -1,
                reason: 'Ran out of time on your own question'
              })
            }
          } else {
            // Regular player
            if (playerAnswer && playerAnswer.is_correct) {
              // Correct guess
              scoreChanges.push({
                playerId: p.id,
                change: 1,
                reason: 'Correct guess'
              })
            }
            // Wrong answer or timeout = no change for regular players (only associated player gets penalty)
          }
        }
      }

      // Apply score changes
      for (const change of scoreChanges) {
        const targetPlayer = allPlayers?.find(p => p.id === change.playerId)
        if (targetPlayer) {
          await supabase
            .from('players')
            .update({ score: Math.max(0, targetPlayer.score + change.change) })
            .eq('id', change.playerId)
        }
      }

      // Update game to quiz_results phase
      const { data: updatedGame, error: updateError } = await supabase
        .from('game_sessions')
        .update({ phase: 'quiz_results' })
        .eq('id', game.id)
        .select()
        .single()

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update game' }, { status: 500 })
      }

      return NextResponse.json({ 
        game: updatedGame, 
        action: 'show_results',
        scoreChanges,
        correctAnswer: currentQuestion.correct_answer
      })
    }

    // Handle next_question action
    if (action === 'next_question') {
      const nextQuestionNumber = currentQuestionNumber + 1

      if (nextQuestionNumber > totalQuestions) {
        // All questions done, move to game_over phase
        const { data: updatedGame, error: updateError } = await supabase
          .from('game_sessions')
          .update({
            phase: 'game_over',
            current_quiz_question_number: totalQuestions,
            question_deadline: null,
          })
          .eq('id', game.id)
          .select()
          .single()

        if (updateError) {
          return NextResponse.json({ error: 'Failed to update game' }, { status: 500 })
        }

        return NextResponse.json({ game: updatedGame, action: 'game_over', finished: true })
      }

      // Move to next question
      const nextQuestion = quizQuestions.find(q => q.question_order === nextQuestionNumber)
      const deadline = new Date(Date.now() + 20000) // 20 seconds from now

      const { data: updatedGame, error: updateError } = await supabase
        .from('game_sessions')
        .update({
          phase: 'quiz_question',
          current_quiz_question_id: nextQuestion?.id,
          current_quiz_question_number: nextQuestionNumber,
          question_deadline: deadline.toISOString(),
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
        totalQuestions,
        deadline: deadline.toISOString(),
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('Quiz next error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}


