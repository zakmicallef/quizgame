import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    const { quizQuestionId, playerId, selectedOption } = await request.json()

    if (!quizQuestionId || !playerId || !selectedOption) {
      return NextResponse.json({ error: 'Quiz question ID, player ID, and selected option required' }, { status: 400 })
    }

    // Validate selected option
    if (!['A', 'B', 'C', 'D'].includes(selectedOption)) {
      return NextResponse.json({ error: 'Invalid option. Must be A, B, C, or D' }, { status: 400 })
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

    // Verify the quiz question exists and get correct answer
    const { data: quizQuestion, error: questionError } = await supabase
      .from('quiz_questions')
      .select('*')
      .eq('id', quizQuestionId)
      .single()

    if (questionError || !quizQuestion) {
      return NextResponse.json({ error: 'Quiz question not found' }, { status: 404 })
    }

    // Check if the answer is correct
    const isCorrect = selectedOption === quizQuestion.correct_answer

    // Check if already answered
    const { data: existingAnswer } = await supabase
      .from('quiz_answers')
      .select('*')
      .eq('quiz_question_id', quizQuestionId)
      .eq('player_id', playerId)
      .single()

    if (existingAnswer) {
      return NextResponse.json({ 
        error: 'Already answered this question',
        answer: existingAnswer 
      }, { status: 400 })
    }

    // Insert the answer
    const { data: insertedAnswer, error: insertError } = await supabase
      .from('quiz_answers')
      .insert({
        quiz_question_id: quizQuestionId,
        player_id: playerId,
        selected_option: selectedOption,
        is_correct: isCorrect,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to save quiz answer:', insertError)
      return NextResponse.json({ error: 'Failed to save answer' }, { status: 500 })
    }

    return NextResponse.json({ 
      answer: insertedAnswer,
      isCorrect,
      correctAnswer: quizQuestion.correct_answer
    })
  } catch (err) {
    console.error('Submit quiz answer error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET endpoint to fetch quiz answers for a question
export async function GET(request: Request) {
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const quizQuestionId = searchParams.get('quizQuestionId')

    if (!quizQuestionId) {
      return NextResponse.json({ error: 'Quiz question ID required' }, { status: 400 })
    }

    // Get all answers for this quiz question with player info
    const { data: answers, error: answersError } = await supabase
      .from('quiz_answers')
      .select(`
        *,
        players (
          id,
          name,
          avatar_color,
          is_projector
        )
      `)
      .eq('quiz_question_id', quizQuestionId)

    if (answersError) {
      console.error('Failed to fetch quiz answers:', answersError)
      return NextResponse.json({ error: 'Failed to fetch answers' }, { status: 500 })
    }

    return NextResponse.json({ answers: answers || [] })
  } catch (err) {
    console.error('Fetch quiz answers error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

