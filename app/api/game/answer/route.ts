import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    const { questionId, playerId, answer } = await request.json()

    if (!questionId || !playerId || !answer) {
      return NextResponse.json({ error: 'Question ID, player ID, and answer required' }, { status: 400 })
    }

    // Verify the player exists
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .single()

    if (playerError || !player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 })
    }

    // Verify the question exists
    const { data: question, error: questionError } = await supabase
      .from('questions')
      .select('*')
      .eq('id', questionId)
      .single()

    if (questionError || !question) {
      return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    }

    // Insert or update the answer (upsert)
    const { data: savedAnswer, error: answerError } = await supabase
      .from('answers')
      .upsert(
        {
          question_id: questionId,
          player_id: playerId,
          answer_text: answer.trim(),
        },
        {
          onConflict: 'question_id,player_id',
        }
      )
      .select()
      .single()

    if (answerError) {
      console.error('Failed to save answer:', answerError)
      return NextResponse.json({ error: 'Failed to save answer' }, { status: 500 })
    }

    return NextResponse.json({ answer: savedAnswer })
  } catch (err) {
    console.error('Submit answer error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET endpoint to fetch answers for a question
export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const questionId = searchParams.get('questionId')

    if (!questionId) {
      return NextResponse.json({ error: 'Question ID required' }, { status: 400 })
    }

    // Get all answers for this question with player info
    const { data: answers, error: answersError } = await supabase
      .from('answers')
      .select(`
        id,
        answer_text,
        created_at,
        player_id,
        players (
          id,
          name,
          avatar_color,
          is_projector
        )
      `)
      .eq('question_id', questionId)

    if (answersError) {
      console.error('Failed to fetch answers:', answersError)
      return NextResponse.json({ error: 'Failed to fetch answers' }, { status: 500 })
    }

    return NextResponse.json({ answers: answers || [] })
  } catch (err) {
    console.error('Fetch answers error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

