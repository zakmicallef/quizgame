import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateIcebreakerQuestions } from '@/lib/openai'

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
      return NextResponse.json({ error: 'Only the host can generate questions' }, { status: 403 })
    }

    // Check if questions already exist for this game
    const { data: existingQuestions } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', game.id)
      .order('question_number', { ascending: true })

    if (existingQuestions && existingQuestions.length > 0) {
      return NextResponse.json({ questions: existingQuestions })
    }

    // Generate questions using OpenAI
    const questionTexts = await generateIcebreakerQuestions()

    // Store questions in database
    const questionsToInsert = questionTexts.map((text, index) => ({
      game_id: game.id,
      question_number: index + 1,
      question_text: text,
    }))

    const { data: questions, error: insertError } = await supabase
      .from('questions')
      .insert(questionsToInsert)
      .select()

    if (insertError) {
      console.error('Failed to insert questions:', insertError)
      return NextResponse.json({ error: 'Failed to save questions' }, { status: 500 })
    }

    // Update game to start asking phase with question 1
    await supabase
      .from('game_sessions')
      .update({ 
        phase: 'asking',
        current_question_number: 1,
        current_question_id: questions?.find(q => q.question_number === 1)?.id
      })
      .eq('id', game.id)

    return NextResponse.json({ questions })
  } catch (err) {
    console.error('Generate questions error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET endpoint to fetch questions for a game
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

    // Get questions for this game
    const { data: questions, error: questionsError } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', game.id)
      .order('question_number', { ascending: true })

    if (questionsError) {
      return NextResponse.json({ error: 'Failed to fetch questions' }, { status: 500 })
    }

    return NextResponse.json({ questions: questions || [] })
  } catch (err) {
    console.error('Fetch questions error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

