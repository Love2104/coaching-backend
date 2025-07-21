const express = require('express');
const { body, validationResult } = require('express-validator');
const {
  generateAITest,
  getAllTests,
  getTestById,
  deleteTest
} = require('../controllers/test.controller');

const router = express.Router();

// Validation middleware
const validateTestGeneration = [
  body('subject')
    .trim()
    .notEmpty()
    .withMessage('Subject is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Subject must be between 2 and 100 characters'),
  
  body('topic')
    .trim()
    .notEmpty()
    .withMessage('Topic is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Topic must be between 2 and 100 characters'),
  
  body('numberOfQuestions')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Number of questions must be between 1 and 50'),
  
  body('difficulty')
    .optional()
    .isIn(['easy', 'medium', 'hard'])
    .withMessage('Difficulty must be easy, medium, or hard')
];

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

/**
 * @route   POST /api/tests/generate
 * @desc    Generate AI-based MCQ test using OpenAI GPT
 * @access  Public
 * @body    {
 *   "subject": "Mathematics",
 *   "topic": "Algebra",
 *   "numberOfQuestions": 5,
 *   "difficulty": "medium"
 * }
 */
router.post('/generate', validateTestGeneration, handleValidationErrors, generateAITest);

/**
 * @route   GET /api/tests
 * @desc    Get all tests with pagination and filtering
 * @access  Public
 * @query   ?page=1&limit=10&subject=Mathematics&difficulty=medium
 */
router.get('/', getAllTests);

/**
 * @route   GET /api/tests/:id
 * @desc    Get single test by ID
 * @access  Public
 * @query   ?includeAnswers=true (to include correct answers)
 */
router.get('/:id', getTestById);

/**
 * @route   DELETE /api/tests/:id
 * @desc    Delete test by ID
 * @access  Public (can be protected later)
 */
router.delete('/:id', deleteTest);

module.exports = router;