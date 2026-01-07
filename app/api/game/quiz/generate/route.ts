import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateQuizQuestions } from '@/lib/openai'

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
      return NextResponse.json({ error: 'Only the host can generate quiz questions' }, { status: 403 })
    }

    // Check if quiz questions already exist
    const { data: existingQuizQuestions } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('game_id', game.id)
      .order('question_order', { ascending: true })

    if (existingQuizQuestions && existingQuizQuestions.length > 0) {
      return NextResponse.json({ quizQuestions: existingQuizQuestions })
    }

    // Get all non-projector players
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', game.id)
      .eq('is_projector', false)

    if (playersError || !players || players.length === 0) {
      return NextResponse.json({ error: 'No players found' }, { status: 404 })
    }

    // Get all icebreaker questions
    const { data: icebreakerQuestions } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', game.id)
      .order('question_number', { ascending: true })

    if (!icebreakerQuestions || icebreakerQuestions.length === 0) {
      return NextResponse.json({ error: 'No icebreaker questions found' }, { status: 404 })
    }

    // Get all answers with player info
    const questionIds = icebreakerQuestions.map(q => q.id)
    const { data: allAnswers } = await supabase
      .from('answers')
      .select('*, players(*)')
      .in('question_id', questionIds)

    if (!allAnswers || allAnswers.length === 0) {
      return NextResponse.json({ error: 'No icebreaker answers found' }, { status: 404 })
    }

    // Build player data for quiz generation
    const playersData = players.map(p => {
      const playerAnswers = allAnswers
        .filter(a => a.player_id === p.id)
        .map(a => {
          const question = icebreakerQuestions.find(q => q.id === a.question_id)
          return {
            question: question?.question_text || '',
            answer: a.answer_text
          }
        })

      return {
        playerId: p.id,
        playerName: p.name,
        answers: playerAnswers
      }
    })

    // Filter out players with no answers
    const playersWithAnswers = playersData.filter(p => p.answers.length > 0)

    if (playersWithAnswers.length === 0) {
      return NextResponse.json({ error: 'No player answers to base quiz on' }, { status: 400 })
    }

    // Generate quiz questions using OpenAI
    const quizQuestions = await generateQuizQuestions(playersWithAnswers)

    // Store quiz questions in database
    const questionsToInsert = quizQuestions.map((q, index) => ({
      game_id: game.id,
      about_player_id: q.aboutPlayerId,
      question_text: q.questionText,
      correct_answer: q.correctAnswer,
      option_a: q.optionA,
      option_b: q.optionB,
      option_c: q.optionC,
      option_d: q.optionD,
      question_order: index + 1,
    }))

    const { data: insertedQuestions, error: insertError } = await supabase
      .from('quiz_questions')
      .insert(questionsToInsert)
      .select()

    if (insertError) {
      console.error('Failed to insert quiz questions:', insertError)
      return NextResponse.json({ error: 'Failed to save quiz questions' }, { status: 500 })
    }

    // Update game to quiz_question phase with question 1
    const firstQuestion = insertedQuestions?.find(q => q.question_order === 1)
    const deadline = new Date(Date.now() + 20000) // 20 seconds from now

    await supabase
      .from('game_sessions')
      .update({
        phase: 'quiz_question',
        current_quiz_question_id: firstQuestion?.id,
        current_quiz_question_number: 1,
        quiz_started_at: new Date().toISOString(),
        question_deadline: deadline.toISOString(),
      })
      .eq('id', game.id)

    return NextResponse.json({ quizQuestions: insertedQuestions })
  } catch (err) {
    console.error('Generate quiz questions error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET endpoint to fetch quiz questions for a game
export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const gameCode = searchParams.get('gameCode')

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

    // Get quiz questions for this game with player info
    const { data: quizQuestions, error: questionsError } = await supabase
      .from('quiz_questions')
      .select(`
        *,
        players:about_player_id (
          id,
          name,
          avatar_color
        )
      `)
      .eq('game_id', game.id)
      .order('question_order', { ascending: true })

    if (questionsError) {
      console.error('Failed to fetch quiz questions:', questionsError)
      return NextResponse.json({ error: 'Failed to fetch quiz questions' }, { status: 500 })
    }

    return NextResponse.json({ quizQuestions: quizQuestions || [] })
  } catch (err) {
    console.error('Fetch quiz questions error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}



