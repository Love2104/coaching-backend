const express = require('express');
const { body, validationResult } = require('express-validator');
const Test = require('../models/Test');
const TestResult = require('../models/TestResult');
const Course = require('../models/Course');
const { protect, requireAdmin, requireStudent } = require('../middleware/auth');

const router = express.Router();

// @desc    Generate AI-based mock test (placeholder)
// @route   POST /api/tests/generate
// @access  Private (Admin/SuperAdmin)
router.post('/generate', protect, requireAdmin, [
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('topic').optional().trim(),
  body('numQuestions').isInt({ min: 1, max: 50 }).withMessage('Number of questions must be between 1 and 50'),
  body('difficulty').optional().isIn(['easy', 'medium', 'hard']).withMessage('Invalid difficulty level'),
  body('courseId').isMongoId().withMessage('Valid course ID is required')
], async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { subject, topic, numQuestions, difficulty = 'medium', courseId } = req.body;

    // Verify course exists and user has access
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user can create tests for this course
    if (req.user.role !== 'superadmin' && course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create tests for this course'
      });
    }

    // TODO: Integrate with GPT API for actual question generation
    // For now, generate dummy questions
    const dummyQuestions = [];
    
    for (let i = 1; i <= numQuestions; i++) {
      dummyQuestions.push({
        question: `Sample ${subject} question ${i} about ${topic || 'general concepts'}?`,
        options: [
          { text: `Option A for question ${i}`, isCorrect: i % 4 === 1 },
          { text: `Option B for question ${i}`, isCorrect: i % 4 === 2 },
          { text: `Option C for question ${i}`, isCorrect: i % 4 === 3 },
          { text: `Option D for question ${i}`, isCorrect: i % 4 === 0 }
        ],
        explanation: `This is the explanation for question ${i}`,
        difficulty,
        marks: 1
      });
    }

    // Create test
    const test = await Test.create({
      title: `AI Generated Test - ${subject}${topic ? ` (${topic})` : ''}`,
      description: `Auto-generated test for ${subject}${topic ? ` focusing on ${topic}` : ''}`,
      course: courseId,
      createdBy: req.user._id,
      subject,
      topic,
      questions: dummyQuestions,
      duration: Math.max(numQuestions * 2, 30), // 2 minutes per question, minimum 30 minutes
      passingMarks: Math.ceil(numQuestions * 0.6), // 60% passing
      isAIGenerated: true,
      aiPrompt: `Generate ${numQuestions} ${difficulty} questions for ${subject}${topic ? ` on ${topic}` : ''}`
    });

    await test.populate('course', 'title');
    await test.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'AI test generated successfully',
      data: test
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get all tests
// @route   GET /api/tests
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      courseId = '',
      subject = '',
      published = 'all'
    } = req.query;

    const skip = (page - 1) * limit;

    // Build query based on user role
    let query = {};

    if (req.user.role === 'student') {
      // Students can only see published tests from courses they've purchased
      const user = await req.user.populate('enrolledCourses.course');
      const purchasedCourseIds = user.enrolledCourses
        .filter(enrollment => enrollment.paymentStatus === 'completed')
        .map(enrollment => enrollment.course._id);

      query.course = { $in: purchasedCourseIds };
      query.isPublished = true;
    } else if (req.user.role === 'admin') {
      // Admins can only see tests from their courses
      const adminCourses = await Course.find({ instructor: req.user._id }).select('_id');
      const courseIds = adminCourses.map(course => course._id);
      query.course = { $in: courseIds };
    }
    // SuperAdmin can see all tests (no additional query restrictions)

    // Apply filters
    if (courseId) query.course = courseId;
    if (subject) query.subject = { $regex: subject, $options: 'i' };
    if (published !== 'all') query.isPublished = published === 'true';

    const tests = await Test.find(query)
      .populate('course', 'title instructor')
      .populate('createdBy', 'name email')
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
    next(error);
  }
});

// @desc    Get single test
// @route   GET /api/tests/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.id)
      .populate('course', 'title instructor')
      .populate('createdBy', 'name email');

    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    // Check access permissions
    let hasAccess = false;

    if (req.user.role === 'superadmin') {
      hasAccess = true;
    } else if (req.user.role === 'admin') {
      hasAccess = test.course.instructor.toString() === req.user._id.toString();
    } else if (req.user.role === 'student') {
      // Check if student has purchased the course and test is published
      hasAccess = test.isPublished && req.user.hasPurchasedCourse(test.course._id);
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this test'
      });
    }

    // For students, return questions without correct answers
    let testData = test.toObject();
    if (req.user.role === 'student') {
      testData.questions = test.getQuestionsForStudent();
    }

    // Check if student has already attempted this test
    if (req.user.role === 'student') {
      const attemptCount = await TestResult.getAttemptCount(test._id, req.user._id);
      testData.attemptCount = attemptCount;
      testData.canAttempt = attemptCount < test.maxAttempts && test.isActive();
    }

    res.status(200).json({
      success: true,
      data: testData
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create test
// @route   POST /api/tests
// @access  Private (Admin/SuperAdmin)
router.post('/', protect, requireAdmin, [
  body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  body('courseId').isMongoId().withMessage('Valid course ID is required'),
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('duration').isInt({ min: 1 }).withMessage('Duration must be at least 1 minute'),
  body('questions').isArray({ min: 1 }).withMessage('At least one question is required'),
  body('questions.*.question').trim().notEmpty().withMessage('Question text is required'),
  body('questions.*.options').isArray({ min: 2, max: 6 }).withMessage('Each question must have 2-6 options'),
  body('questions.*.marks').optional().isInt({ min: 1 }).withMessage('Marks must be at least 1')
], async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { title, description, courseId, subject, topic, duration, questions, passingMarks, maxAttempts = 1, shuffleQuestions = false, showResults = true, showCorrectAnswers = true, startDate, endDate } = req.body;

    // Verify course exists and user has access
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user can create tests for this course
    if (req.user.role !== 'superadmin' && course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create tests for this course'
      });
    }

    // Validate questions
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      
      // Check if at least one option is marked as correct
      const hasCorrectAnswer = question.options.some(option => option.isCorrect);
      if (!hasCorrectAnswer) {
        return res.status(400).json({
          success: false,
          message: `Question ${i + 1} must have at least one correct answer`
        });
      }
    }

    const test = await Test.create({
      title,
      description,
      course: courseId,
      createdBy: req.user._id,
      subject,
      topic,
      questions,
      duration,
      passingMarks: passingMarks || Math.ceil(questions.length * 0.6),
      maxAttempts,
      shuffleQuestions,
      showResults,
      showCorrectAnswers,
      startDate,
      endDate
    });

    await test.populate('course', 'title');
    await test.populate('createdBy', 'name email');

    res.status(201).json({
      success: true,
      message: 'Test created successfully',
      data: test
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update test
// @route   PUT /api/tests/:id
// @access  Private (Admin/SuperAdmin - own tests only for Admin)
router.put('/:id', protect, requireAdmin, [
  body('title').optional().trim().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
  body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  body('duration').optional().isInt({ min: 1 }).withMessage('Duration must be at least 1 minute')
], async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const test = await Test.findById(req.params.id).populate('course');

    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    // Check if user can update this test
    if (req.user.role !== 'superadmin' && test.course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this test'
      });
    }

    // Don't allow updating if test has been attempted
    const attemptCount = await TestResult.countDocuments({ test: test._id });
    if (attemptCount > 0 && req.body.questions) {
      return res.status(400).json({
        success: false,
        message: 'Cannot modify questions after students have attempted the test'
      });
    }

    const allowedFields = ['title', 'description', 'duration', 'passingMarks', 'maxAttempts', 'shuffleQuestions', 'showResults', 'showCorrectAnswers', 'startDate', 'endDate', 'isPublished'];
    const updateData = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    // Allow questions update only if no attempts
    if (attemptCount === 0 && req.body.questions) {
      updateData.questions = req.body.questions;
    }

    const updatedTest = await Test.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('course', 'title').populate('createdBy', 'name email');

    res.status(200).json({
      success: true,
      message: 'Test updated successfully',
      data: updatedTest
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete test
// @route   DELETE /api/tests/:id
// @access  Private (Admin/SuperAdmin - own tests only for Admin)
router.delete('/:id', protect, requireAdmin, async (req, res, next) => {
  try {
    const test = await Test.findById(req.params.id).populate('course');

    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    // Check if user can delete this test
    if (req.user.role !== 'superadmin' && test.course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this test'
      });
    }

    // Delete all test results first
    await TestResult.deleteMany({ test: test._id });

    await Test.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Test deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Submit test answers
// @route   POST /api/tests/:id/submit
// @access  Private (Student only)
router.post('/:id/submit', protect, requireStudent, [
  body('answers').isArray().withMessage('Answers must be an array'),
  body('answers.*.questionId').isMongoId().withMessage('Valid question ID is required'),
  body('answers.*.selectedOption').isMongoId().withMessage('Valid option ID is required'),
  body('timeTaken').isInt({ min: 1 }).withMessage('Time taken must be at least 1 minute')
], async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { answers, timeTaken } = req.body;

    const test = await Test.findById(req.params.id).populate('course');

    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    // Check if student has access to this test
    if (!test.isPublished || !req.user.hasPurchasedCourse(test.course._id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to take this test'
      });
    }

    // Check if test is active
    if (!test.isActive()) {
      return res.status(400).json({
        success: false,
        message: 'Test is not currently active'
      });
    }

    // Check attempt limit
    const attemptCount = await TestResult.getAttemptCount(test._id, req.user._id);
    if (attemptCount >= test.maxAttempts) {
      return res.status(400).json({
        success: false,
        message: 'Maximum attempts exceeded'
      });
    }

    // Grade the test
    let marksObtained = 0;
    const gradedAnswers = [];

    for (const answer of answers) {
      const question = test.questions.id(answer.questionId);
      if (!question) {
        return res.status(400).json({
          success: false,
          message: 'Invalid question ID'
        });
      }

      const selectedOption = question.options.id(answer.selectedOption);
      if (!selectedOption) {
        return res.status(400).json({
          success: false,
          message: 'Invalid option ID'
        });
      }

      const isCorrect = selectedOption.isCorrect;
      const questionMarks = isCorrect ? question.marks : 0;
      marksObtained += questionMarks;

      gradedAnswers.push({
        questionId: answer.questionId,
        selectedOption: answer.selectedOption,
        isCorrect,
        marksObtained: questionMarks,
        timeTaken: answer.timeTaken || 0
      });
    }

    // Calculate percentage and pass status
    const percentage = Math.round((marksObtained / test.totalMarks) * 100);
    const isPassed = marksObtained >= test.passingMarks;

    // Create test result
    const testResult = await TestResult.create({
      test: test._id,
      student: req.user._id,
      course: test.course._id,
      answers: gradedAnswers,
      totalMarks: test.totalMarks,
      marksObtained,
      percentage,
      isPassed,
      timeTaken,
      startedAt: new Date(Date.now() - (timeTaken * 60 * 1000)), // Calculate start time
      submittedAt: new Date(),
      attemptNumber: attemptCount + 1
    });

    await testResult.populate('test', 'title showResults showCorrectAnswers');

    // Prepare response based on test settings
    let responseData = {
      _id: testResult._id,
      marksObtained,
      totalMarks: test.totalMarks,
      percentage,
      isPassed,
      timeTaken,
      attemptNumber: testResult.attemptNumber
    };

    if (test.showResults) {
      responseData.answers = testResult.answers;
    }

    if (test.showCorrectAnswers) {
      responseData.correctAnswers = test.questions.map(q => ({
        questionId: q._id,
        correctOptions: q.options.filter(opt => opt.isCorrect).map(opt => opt._id),
        explanation: q.explanation
      }));
    }

    res.status(201).json({
      success: true,
      message: 'Test submitted successfully',
      data: responseData
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get test results
// @route   GET /api/tests/:id/results
// @access  Private
router.get('/:id/results', protect, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      studentId = ''
    } = req.query;

    const skip = (page - 1) * limit;

    const test = await Test.findById(req.params.id).populate('course');

    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Test not found'
      });
    }

    let query = { test: test._id };

    // Role-based access control
    if (req.user.role === 'student') {
      // Students can only see their own results
      query.student = req.user._id;
    } else if (req.user.role === 'admin') {
      // Admins can only see results from their courses
      if (test.course.instructor.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view results for this test'
        });
      }
    }
    // SuperAdmin can see all results

    // Filter by student if specified (for admin/superadmin)
    if (studentId && req.user.role !== 'student') {
      query.student = studentId;
    }

    const results = await TestResult.find(query)
      .populate('student', 'name email')
      .populate('test', 'title totalMarks')
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await TestResult.countDocuments(query);

    res.status(200).json({
      success: true,
      data: results,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get detailed test result
// @route   GET /api/tests/results/:resultId
// @access  Private
router.get('/results/:resultId', protect, async (req, res, next) => {
  try {
    const result = await TestResult.findById(req.params.resultId)
      .populate('test', 'title questions showCorrectAnswers')
      .populate('student', 'name email')
      .populate('course', 'title');

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Test result not found'
      });
    }

    // Check access permissions
    let hasAccess = false;

    if (req.user.role === 'superadmin') {
      hasAccess = true;
    } else if (req.user.role === 'admin') {
      // Check if admin owns the course
      const test = await Test.findById(result.test._id).populate('course');
      hasAccess = test.course.instructor.toString() === req.user._id.toString();
    } else if (req.user.role === 'student') {
      hasAccess = result.student._id.toString() === req.user._id.toString();
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this result'
      });
    }

    // Add analytics
    const analytics = result.getAnalytics();

    res.status(200).json({
      success: true,
      data: {
        ...result.toObject(),
        analytics
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;