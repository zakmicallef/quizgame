import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function generateIcebreakerQuestions(): Promise<string[]> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a fun party game host. Generate exactly 3 creative, engaging questions to help players get to know each other's entertainment preferences and hobbies. 
        
Questions should be:
- Fun and lighthearted (not too personal)
- About entertainment, hobbies, pop culture, or leisure activities
- Open-ended but with short answer potential
- Varied (don't repeat similar topics)

Examples of good questions:
- "If you could only watch one TV show for the rest of your life, what would it be?"
- "What's your guilty pleasure hobby that you don't tell many people about?"
- "If you were a video game character, what type of game would you be in?"

Return ONLY a JSON array with exactly 3 question strings, no other text.`
      },
      {
        role: 'user',
        content: 'Generate 3 fun icebreaker questions about entertainment and hobbies.'
      }
    ],
    temperature: 0.9,
    max_tokens: 500,
  })

  const content = response.choices[0]?.message?.content || '[]'
  
  try {
    // Parse the JSON array from the response
    const questions = JSON.parse(content)
    if (Array.isArray(questions) && questions.length === 3) {
      return questions
    }
    throw new Error('Invalid response format')
  } catch {
    // Fallback questions if parsing fails
    return [
      "If you could master any hobby instantly, what would it be?",
      "What movie or show have you rewatched the most times?",
      "What's a hobby you've always wanted to try but haven't yet?"
    ]
  }
}

// Type for player icebreaker data
type PlayerIcebreakerData = {
  playerId: string
  playerName: string
  answers: { question: string; answer: string }[]
}

// Type for generated quiz question
export type QuizQuestion = {
  aboutPlayerId: string
  aboutPlayerName: string
  questionText: string
  correctAnswer: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
}

// Generate quiz questions based on all players' icebreaker answers
export async function generateQuizQuestions(
  playersData: PlayerIcebreakerData[]
): Promise<QuizQuestion[]> {
  const QUESTIONS_PER_PLAYER = 4
  const allQuestions: QuizQuestion[] = []

  // Generate questions for each player
  for (const playerData of playersData) {
    const playerQuestions = await generateQuestionsForPlayer(playerData, playersData)
    allQuestions.push(...playerQuestions)
  }

  // Interleave questions so they alternate between players
  const interleavedQuestions: QuizQuestion[] = []
  for (let round = 0; round < QUESTIONS_PER_PLAYER; round++) {
    for (const playerData of playersData) {
      const playerQuestion = allQuestions.find(
        (q, idx) =>
          q.aboutPlayerId === playerData.playerId &&
          allQuestions.filter((pq, pidx) => pq.aboutPlayerId === playerData.playerId && pidx < idx).length === round
      )
      if (playerQuestion) {
        interleavedQuestions.push(playerQuestion)
      }
    }
  }

  return interleavedQuestions
}

// Generate 4 quiz questions for a specific player based on their answers
async function generateQuestionsForPlayer(
  player: PlayerIcebreakerData,
  allPlayers: PlayerIcebreakerData[]
): Promise<QuizQuestion[]> {
  const QUESTIONS_PER_PLAYER = 4
  
  // Create a context with all answers for generating plausible wrong options
  const otherPlayersAnswers = allPlayers
    .filter(p => p.playerId !== player.playerId)
    .map(p => p.answers.map(a => a.answer))
    .flat()

  const prompt = `You are creating quiz questions for a fun party game. Based on ${player.playerName}'s answers to icebreaker questions, generate ${QUESTIONS_PER_PLAYER} multiple choice questions where the goal is to guess what ${player.playerName} answered.

${player.playerName}'s answers:
${player.answers.map((a, i) => `Q${i + 1}: "${a.question}"\n${player.playerName}'s answer: "${a.answer}"`).join('\n\n')}

Other players' answers (use these to create plausible wrong options):
${otherPlayersAnswers.slice(0, 10).join(', ')}

IMPORTANT RULES:
1. Create exactly ${QUESTIONS_PER_PLAYER} questions
2. Each question should ask "What did ${player.playerName} answer when asked..." or similar phrasing
3. The correct answer should be ${player.playerName}'s actual answer (can be slightly rephrased for clarity)
4. Wrong options should be plausible (use other players' answers or similar realistic options)
5. Options should be roughly similar in length and style
6. Make questions fun and engaging!

Return ONLY a JSON array with exactly ${QUESTIONS_PER_PLAYER} objects in this format:
[
  {
    "questionText": "What did ${player.playerName} say when asked about their favorite hobby?",
    "correctAnswer": "A",
    "optionA": "The correct answer here",
    "optionB": "Wrong option 1",
    "optionC": "Wrong option 2",
    "optionD": "Wrong option 3"
  }
]

The "correctAnswer" field should be "A", "B", "C", or "D" indicating which option is correct.
RANDOMIZE which option (A, B, C, or D) is correct - don't always make A correct!`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a fun party game host creating engaging quiz questions. Return ONLY valid JSON, no markdown or explanation.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.8,
      max_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content || '[]'
    
    // Try to extract JSON from the response (handle potential markdown code blocks)
    let jsonContent = content
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      jsonContent = jsonMatch[0]
    }

    const questions = JSON.parse(jsonContent)
    
    if (Array.isArray(questions) && questions.length > 0) {
      return questions.slice(0, QUESTIONS_PER_PLAYER).map((q: {
        questionText: string
        correctAnswer: string
        optionA: string
        optionB: string
        optionC: string
        optionD: string
      }) => ({
        aboutPlayerId: player.playerId,
        aboutPlayerName: player.playerName,
        questionText: q.questionText,
        correctAnswer: q.correctAnswer,
        optionA: q.optionA,
        optionB: q.optionB,
        optionC: q.optionC,
        optionD: q.optionD,
      }))
    }
    throw new Error('Invalid response format')
  } catch (error) {
    console.error('Error generating questions for player:', player.playerName, error)
    
    // Generate fallback questions based on available answers
    return player.answers.slice(0, QUESTIONS_PER_PLAYER).map((answer, idx) => ({
      aboutPlayerId: player.playerId,
      aboutPlayerName: player.playerName,
      questionText: `What did ${player.playerName} answer to: "${answer.question}"?`,
      correctAnswer: 'A',
      optionA: answer.answer,
      optionB: otherPlayersAnswers[idx] || 'Something else',
      optionC: otherPlayersAnswers[idx + 1] || 'None of these',
      optionD: otherPlayersAnswers[idx + 2] || 'I don\'t know',
    }))
  }
}

export { openai }

