const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate MCQ questions using OpenAI GPT-4
 * @param {string} subject - The subject for questions
 * @param {string} topic - The specific topic
 * @param {number} numberOfQuestions - Number of questions to generate
 * @param {string} difficulty - Difficulty level (easy, medium, hard)
 * @returns {Promise<Array>} Array of question objects
 */
const generateMCQQuestions = async (subject, topic, numberOfQuestions = 5, difficulty = 'medium') => {
  try {
    // Validate inputs
    if (!subject || !topic || numberOfQuestions < 1 || numberOfQuestions > 50) {
      throw new Error('Invalid input parameters');
    }

    // Create the prompt for GPT
    const prompt = `Generate ${numberOfQuestions} multiple choice questions about ${subject} - ${topic} at ${difficulty} difficulty level.

Requirements:
1. Each question should have exactly 4 options (A, B, C, D)
2. Only ONE option should be correct
3. Include a brief explanation for the correct answer
4. Questions should be clear and unambiguous
5. Avoid overly complex or trick questions for ${difficulty} level

Return the response as a valid JSON array with this exact structure:
[
  {
    "question": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "Option B",
    "explanation": "Brief explanation of why this is correct"
  }
]

Subject: ${subject}
Topic: ${topic}
Difficulty: ${difficulty}
Number of questions: ${numberOfQuestions}

Generate ${numberOfQuestions} questions now:`;

    console.log('🤖 Sending request to OpenAI GPT-4...');
    
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are an expert educator and test creator. Generate high-quality multiple choice questions in valid JSON format only. Do not include any text outside the JSON array."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 3000,
      temperature: 0.7,
    });

    const responseText = completion.choices[0].message.content.trim();
    console.log('📝 Raw GPT Response:', responseText);

    // Parse the JSON response
    let questions;
    try {
      // Remove any markdown code blocks if present
      const cleanedResponse = responseText.replace(/```json\n?|\n?```/g, '').trim();
      questions = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('❌ JSON Parse Error:', parseError.message);
      console.error('Raw response:', responseText);
      throw new Error('Failed to parse GPT response as JSON');
    }

    // Validate the response structure
    if (!Array.isArray(questions)) {
      throw new Error('GPT response is not an array');
    }

    // Validate each question
    const validatedQuestions = questions.map((q, index) => {
      if (!q.question || !Array.isArray(q.options) || !q.correctAnswer) {
        throw new Error(`Invalid question structure at index ${index}`);
      }

      if (q.options.length !== 4) {
        throw new Error(`Question ${index + 1} must have exactly 4 options`);
      }

      if (!q.options.includes(q.correctAnswer)) {
        throw new Error(`Question ${index + 1}: correct answer not found in options`);
      }

      return {
        question: q.question.trim(),
        options: q.options.map(opt => opt.trim()),
        correctAnswer: q.correctAnswer.trim(),
        explanation: q.explanation ? q.explanation.trim() : '',
        difficulty: difficulty
      };
    });

    console.log(`✅ Successfully generated ${validatedQuestions.length} questions`);
    return validatedQuestions;

  } catch (error) {
    console.error('❌ Error generating questions:', error.message);
    
    // If it's an OpenAI API error, provide more details
    if (error.response) {
      console.error('OpenAI API Error:', error.response.status, error.response.data);
    }
    
    throw new Error(`Failed to generate questions: ${error.message}`);
  }
};

/**
 * Test the OpenAI connection
 * @returns {Promise<boolean>} True if connection is successful
 */
const testOpenAIConnection = async () => {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: "Say 'Hello, OpenAI connection is working!'" }],
      max_tokens: 20,
    });
    
    console.log('✅ OpenAI Connection Test:', completion.choices[0].message.content);
    return true;
  } catch (error) {
    console.error('❌ OpenAI Connection Test Failed:', error.message);
    return false;
  }
};

module.exports = {
  generateMCQQuestions,
  testOpenAIConnection
};