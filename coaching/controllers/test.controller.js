const Test = require('../models/Test');
const { generateMCQQuestions } = require('../utils/gptGenerator');

/**
 * Generate AI-based test using OpenAI GPT
 * @route POST /api/tests/generate
 * @access Public (can be protected later)
 */
const generateAITest = async (req, res) => {
  try {
    const { subject, topic, numberOfQuestions = 5, difficulty = 'medium' } = req.body;

    // Validation
    if (!subject || !topic) {
      return res.status(400).json({
        success: false,
        message: 'Subject and topic are required',
        example: {
          subject: 'Mathematics',
          topic: 'Algebra',
          numberOfQuestions: 5,
          difficulty: 'medium'
        }
      });
    }

    if (numberOfQuestions < 1 || numberOfQuestions > 50) {
      return res.status(400).json({
        success: false,
        message: 'Number of questions must be between 1 and 50'
      });
    }

    if (!['easy', 'medium', 'hard'].includes(difficulty)) {
      return res.status(400).json({
        success: false,
        message: 'Difficulty must be easy, medium, or hard'
      });
    }

    console.log(`🎯 Generating ${numberOfQuestions} ${difficulty} questions for ${subject} - ${topic}`);

    // Generate questions using GPT
    const questions = await generateMCQQuestions(subject, topic, numberOfQuestions, difficulty);

    // Create test object
    const testData = {
      title: `AI Generated Test - ${subject} (${topic})`,
      subject: subject.trim(),
      topic: topic.trim(),
      questions: questions,
      difficulty: difficulty,
      isAIGenerated: true,
      aiPrompt: `Generate ${numberOfQuestions} ${difficulty} questions for ${subject} - ${topic}`
    };

    // Save to database
    const test = await Test.create(testData);

    console.log(`✅ Test created with ID: ${test._id}`);

    // Return response
    res.status(201).json({
      success: true,
      message: `Successfully generated ${questions.length} questions`,
      data: {
        testId: test._id,
        title: test.title,
        subject: test.subject,
        topic: test.topic,
        totalQuestions: test.totalQuestions,
        difficulty: test.difficulty,
        questions: test.questions,
        generatedAt: test.generatedAt
      }
    });

  } catch (error) {
    console.error('❌ Error in generateAITest:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate test',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get all tests
 * @route GET /api/tests
 * @access Public
 */
const getAllTests = async (req, res) => {
  try {
    const { page = 1, limit = 10, subject, difficulty } = req.query;
    
    // Build query
    let query = {};
    if (subject) query.subject = { $regex: subject, $options: 'i' };
    if (difficulty) query.difficulty = difficulty;

    const skip = (page - 1) * limit;

    const tests = await Test.find(query)
      .select('-questions.explanation') // Hide explanations in list view
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Test.countDocuments(query);

    res.status(200).json({
      success: true,
      data: tests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error in getAllTests:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tests',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Get single test by ID
 * @route GET /api/tests/:id
 * @access Public
 */
const getTestById = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeAnswers = 'false' } = req.query;

    const test = await Test.findById(id);

    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    // Hide correct answers and explanations unless specifically requested
    let responseData = test.toObject();
    
    if (includeAnswers !== 'true') {
      responseData.questions = test.questions.map(q => ({
        _id: q._id,
        question: q.question,
        options: q.options,
        difficulty: q.difficulty
        // correctAnswer and explanation hidden
      }));
    }

    res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Error in getTestById:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to fetch test',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * Delete test by ID
 * @route DELETE /api/tests/:id
 * @access Public (can be protected later)
 */
const deleteTest = async (req, res) => {
  try {
    const { id } = req.params;

    const test = await Test.findByIdAndDelete(id);

    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Test deleted successfully',
      data: {
        deletedTestId: id,
        title: test.title
      }
    });

  } catch (error) {
    console.error('❌ Error in deleteTest:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Failed to delete test',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  generateAITest,
  getAllTests,
  getTestById,
  deleteTest
};