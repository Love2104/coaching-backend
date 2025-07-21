const express = require('express');
const { body, validationResult } = require('express-validator');
const Course = require('../models/Course');
const User = require('../models/User');
const { protect, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { uploadFields, handleUploadError, deleteFile } = require('../middleware/upload');

const router = express.Router();

// @desc    Get all courses
// @route   GET /api/courses
// @access  Public
router.get('/', async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      category = '',
      subject = '',
      level = '',
      search = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      published = 'true'
    } = req.query;

    const skip = (page - 1) * limit;

    // Build query
    let query = {};

    // Only show published courses for non-admin users
    if (!req.user || req.user.role === 'student') {
      query.isPublished = true;
    } else if (published !== 'all') {
      query.isPublished = published === 'true';
    }

    // Admin can only see their own courses (unless SuperAdmin)
    if (req.user && req.user.role === 'admin') {
      query.instructor = req.user._id;
    }

    // Filters
    if (category) query.category = { $regex: category, $options: 'i' };
    if (subject) query.subject = { $regex: subject, $options: 'i' };
    if (level) query.level = level;

    // Search
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    // Sort options
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const courses = await Course.find(query)
      .populate('instructor', 'name email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Course.countDocuments(query);

    res.status(200).json({
      success: true,
      data: courses,
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

// @desc    Get single course
// @route   GET /api/courses/:id
// @access  Public
router.get('/:id', async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('instructor', 'name email avatar');

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user can access course details
    if (!course.isPublished && (!req.user || (req.user.role !== 'superadmin' && course.instructor._id.toString() !== req.user._id.toString()))) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user has access to course materials
    let hasAccess = false;
    if (req.user) {
      hasAccess = course.canUserAccess(req.user);
    }

    // Hide materials if user doesn't have access
    const courseData = course.toObject();
    if (!hasAccess) {
      courseData.materials = [];
    }

    res.status(200).json({
      success: true,
      data: {
        ...courseData,
        hasAccess
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create course
// @route   POST /api/courses
// @access  Private (Admin/SuperAdmin)
router.post('/', protect, requireAdmin, uploadFields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'syllabus', maxCount: 1 }
]), handleUploadError, [
  body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
  body('description').trim().isLength({ min: 10, max: 2000 }).withMessage('Description must be between 10 and 2000 characters'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('subject').trim().notEmpty().withMessage('Subject is required'),
  body('price').isNumeric().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('duration').isInt({ min: 1 }).withMessage('Duration must be at least 1 hour'),
  body('level').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid level')
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

    const courseData = {
      ...req.body,
      instructor: req.user._id
    };

    // Handle file uploads
    if (req.files) {
      if (req.files.thumbnail) {
        courseData.thumbnail = req.files.thumbnail[0].path;
      }
      if (req.files.syllabus) {
        courseData.syllabus = req.files.syllabus[0].path;
      }
    }

    // Parse arrays if they come as strings
    if (typeof req.body.tags === 'string') {
      courseData.tags = req.body.tags.split(',').map(tag => tag.trim());
    }
    if (typeof req.body.prerequisites === 'string') {
      courseData.prerequisites = req.body.prerequisites.split(',').map(prereq => prereq.trim());
    }
    if (typeof req.body.learningOutcomes === 'string') {
      courseData.learningOutcomes = req.body.learningOutcomes.split(',').map(outcome => outcome.trim());
    }

    const course = await Course.create(courseData);
    await course.populate('instructor', 'name email');

    res.status(201).json({
      success: true,
      message: 'Course created successfully',
      data: course
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update course
// @route   PUT /api/courses/:id
// @access  Private (Admin/SuperAdmin - own courses only for Admin)
router.put('/:id', protect, requireAdmin, uploadFields([
  { name: 'thumbnail', maxCount: 1 },
  { name: 'syllabus', maxCount: 1 }
]), handleUploadError, [
  body('title').optional().trim().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
  body('description').optional().trim().isLength({ min: 10, max: 2000 }).withMessage('Description must be between 10 and 2000 characters'),
  body('price').optional().isNumeric().isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('duration').optional().isInt({ min: 1 }).withMessage('Duration must be at least 1 hour'),
  body('level').optional().isIn(['beginner', 'intermediate', 'advanced']).withMessage('Invalid level')
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

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user can update this course
    if (req.user.role !== 'superadmin' && course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this course'
      });
    }

    const updateData = { ...req.body };

    // Handle file uploads
    if (req.files) {
      if (req.files.thumbnail) {
        // Delete old thumbnail
        if (course.thumbnail) {
          deleteFile(course.thumbnail);
        }
        updateData.thumbnail = req.files.thumbnail[0].path;
      }
      if (req.files.syllabus) {
        // Delete old syllabus
        if (course.syllabus) {
          deleteFile(course.syllabus);
        }
        updateData.syllabus = req.files.syllabus[0].path;
      }
    }

    // Parse arrays if they come as strings
    if (typeof req.body.tags === 'string') {
      updateData.tags = req.body.tags.split(',').map(tag => tag.trim());
    }
    if (typeof req.body.prerequisites === 'string') {
      updateData.prerequisites = req.body.prerequisites.split(',').map(prereq => prereq.trim());
    }
    if (typeof req.body.learningOutcomes === 'string') {
      updateData.learningOutcomes = req.body.learningOutcomes.split(',').map(outcome => outcome.trim());
    }

    const updatedCourse = await Course.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('instructor', 'name email');

    res.status(200).json({
      success: true,
      message: 'Course updated successfully',
      data: updatedCourse
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete course
// @route   DELETE /api/courses/:id
// @access  Private (Admin/SuperAdmin - own courses only for Admin)
router.delete('/:id', protect, requireAdmin, async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user can delete this course
    if (req.user.role !== 'superadmin' && course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this course'
      });
    }

    // Delete associated files
    if (course.thumbnail) {
      deleteFile(course.thumbnail);
    }
    if (course.syllabus) {
      deleteFile(course.syllabus);
    }

    // Delete course materials files
    course.materials.forEach(material => {
      if (material.type !== 'link' && material.url) {
        deleteFile(material.url);
      }
    });

    await Course.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Course deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Add course material
// @route   POST /api/courses/:id/materials
// @access  Private (Admin/SuperAdmin - own courses only for Admin)
router.post('/:id/materials', protect, requireAdmin, uploadFields([
  { name: 'material', maxCount: 1 }
]), handleUploadError, [
  body('title').trim().notEmpty().withMessage('Material title is required'),
  body('type').isIn(['pdf', 'video', 'link']).withMessage('Invalid material type'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
  body('order').optional().isInt({ min: 0 }).withMessage('Order must be a positive integer')
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

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user can update this course
    if (req.user.role !== 'superadmin' && course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add materials to this course'
      });
    }

    const { title, type, description = '', order = 0 } = req.body;
    let url = req.body.url;

    // Handle file upload
    if (req.files && req.files.material) {
      url = req.files.material[0].path;
    }

    // Validate URL for link type
    if (type === 'link' && !url) {
      return res.status(400).json({
        success: false,
        message: 'URL is required for link type materials'
      });
    }

    const material = {
      title,
      type,
      url,
      description,
      order
    };

    course.materials.push(material);
    await course.save();

    res.status(201).json({
      success: true,
      message: 'Material added successfully',
      data: course.materials[course.materials.length - 1]
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update course material
// @route   PUT /api/courses/:id/materials/:materialId
// @access  Private (Admin/SuperAdmin - own courses only for Admin)
router.put('/:id/materials/:materialId', protect, requireAdmin, [
  body('title').optional().trim().notEmpty().withMessage('Material title cannot be empty'),
  body('description').optional().trim().isLength({ max: 500 }).withMessage('Description cannot exceed 500 characters'),
  body('order').optional().isInt({ min: 0 }).withMessage('Order must be a positive integer')
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

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user can update this course
    if (req.user.role !== 'superadmin' && course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update materials in this course'
      });
    }

    const material = course.materials.id(req.params.materialId);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }

    // Update material fields
    const allowedFields = ['title', 'description', 'order', 'url'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        material[field] = req.body[field];
      }
    });

    await course.save();

    res.status(200).json({
      success: true,
      message: 'Material updated successfully',
      data: material
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete course material
// @route   DELETE /api/courses/:id/materials/:materialId
// @access  Private (Admin/SuperAdmin - own courses only for Admin)
router.delete('/:id/materials/:materialId', protect, requireAdmin, async (req, res, next) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user can update this course
    if (req.user.role !== 'superadmin' && course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete materials from this course'
      });
    }

    const material = course.materials.id(req.params.materialId);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }

    // Delete file if it's not a link
    if (material.type !== 'link' && material.url) {
      deleteFile(material.url);
    }

    course.materials.pull(req.params.materialId);
    await course.save();

    res.status(200).json({
      success: true,
      message: 'Material deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Publish/Unpublish course
// @route   PUT /api/courses/:id/publish
// @access  Private (Admin/SuperAdmin - own courses only for Admin)
router.put('/:id/publish', protect, requireAdmin, [
  body('isPublished').isBoolean().withMessage('isPublished must be a boolean')
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

    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }

    // Check if user can update this course
    if (req.user.role !== 'superadmin' && course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to publish/unpublish this course'
      });
    }

    course.isPublished = req.body.isPublished;
    await course.save();

    res.status(200).json({
      success: true,
      message: `Course ${course.isPublished ? 'published' : 'unpublished'} successfully`,
      data: course
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get course categories
// @route   GET /api/courses/categories/list
// @access  Public
router.get('/categories/list', async (req, res, next) => {
  try {
    const categories = await Course.distinct('category', { isPublished: true });
    
    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get course subjects
// @route   GET /api/courses/subjects/list
// @access  Public
router.get('/subjects/list', async (req, res, next) => {
  try {
    const { category } = req.query;
    
    let query = { isPublished: true };
    if (category) {
      query.category = category;
    }
    
    const subjects = await Course.distinct('subject', query);
    
    res.status(200).json({
      success: true,
      data: subjects
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;