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

export { openai }

