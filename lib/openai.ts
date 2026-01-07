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
// Creates trivia questions about the things players mentioned
export async function generateQuizQuestions(
  playersData: PlayerIcebreakerData[]
): Promise<QuizQuestion[]> {
  const QUESTIONS_PER_PLAYER = 2
  const allQuestions: QuizQuestion[] = []

  // Generate questions for each player
  for (const playerData of playersData) {
    const playerQuestions = await generateQuestionsForPlayer(playerData, playersData)
    allQuestions.push(...playerQuestions)
  }

  // Interleave questions so they alternate between players
  // Round 1: Player A Q1, Player B Q1, Player C Q1...
  // Round 2: Player A Q2, Player B Q2, Player C Q2...
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

// Generate 2 quiz questions for a specific player based on their answers
// Questions are TRIVIA about the things they mentioned (movies, hobbies, etc.)
async function generateQuestionsForPlayer(
  player: PlayerIcebreakerData,
  allPlayers: PlayerIcebreakerData[]
): Promise<QuizQuestion[]> {
  const QUESTIONS_PER_PLAYER = 2
  
  // Collect all other players' answers for variety
  const otherPlayersAnswers = allPlayers
    .filter(p => p.playerId !== player.playerId)
    .map(p => p.answers.map(a => a.answer))
    .flat()

  const prompt = `You are creating trivia quiz questions for a fun party game. ${player.playerName} answered some icebreaker questions about their interests. Your job is to create TRIVIA questions about the things they mentioned.

${player.playerName}'s answers:
${player.answers.map((a, i) => `Q${i + 1}: "${a.question}"\n${player.playerName}'s answer: "${a.answer}"`).join('\n\n')}

TASK: Generate ${QUESTIONS_PER_PLAYER} trivia questions ABOUT the subjects/topics that ${player.playerName} mentioned. The person who gave this answer should have an advantage because they know about their favorite things!

EXAMPLES:
- If they said their favorite movie is "The Matrix" → Ask: "In The Matrix, what color pill does Morpheus offer Neo to show him the truth?" (Answer: Red)
- If they said their hobby is "playing guitar" → Ask: "How many strings does a standard acoustic guitar have?" (Answer: 6)
- If they said their favorite show is "Breaking Bad" → Ask: "What is the street name of the blue meth that Walter White produces in Breaking Bad?" (Answer: Blue Sky)
- If they said they like "hiking" → Ask: "What is the longest hiking trail in the United States?" (Answer: Pacific Crest Trail / Appalachian Trail)

IMPORTANT RULES:
1. Create exactly ${QUESTIONS_PER_PLAYER} questions
2. Questions should be TRIVIA about the thing they mentioned, NOT asking what they answered
3. Questions should be at a casual/fun difficulty - not too obscure
4. Frame the question to mention who it's about, e.g., "${player.playerName} said they love [topic]. [Trivia question about that topic]?"
5. Make the wrong options plausible but clearly wrong to someone who knows the subject
6. RANDOMIZE which option (A, B, C, or D) is correct!

Return ONLY a JSON array with exactly ${QUESTIONS_PER_PLAYER} objects:
[
  {
    "questionText": "${player.playerName} said their favorite movie is X. In that movie, [trivia question]?",
    "correctAnswer": "B",
    "optionA": "Wrong but plausible option",
    "optionB": "The correct answer",
    "optionC": "Wrong but plausible option",
    "optionD": "Wrong but plausible option"
  }
]`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a fun trivia game host. Create engaging trivia questions about specific topics. The questions should test knowledge ABOUT the subject, not just recall what someone said. Return ONLY valid JSON, no markdown or explanation.'
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
    
    // Generate fallback questions - still try to make them about the topic
    return player.answers.slice(0, QUESTIONS_PER_PLAYER).map((answer) => ({
      aboutPlayerId: player.playerId,
      aboutPlayerName: player.playerName,
      questionText: `${player.playerName} mentioned "${answer.answer}". What do you know about it?`,
      correctAnswer: 'A',
      optionA: 'It\'s something they enjoy',
      optionB: otherPlayersAnswers[0] || 'Something else',
      optionC: otherPlayersAnswers[1] || 'None of these',
      optionD: otherPlayersAnswers[2] || 'I don\'t know',
    }))
  }
}

export { openai }

