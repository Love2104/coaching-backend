const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Course = require('../models/Course');
const { protect, requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const { uploadSingle, handleUploadError, deleteFile } = require('../middleware/upload');

const router = express.Router();

// @desc    Get all users (with filtering and pagination)
// @route   GET /api/users
// @access  Private (Admin/SuperAdmin)
router.get('/', protect, requireAdmin, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      role = 'all',
      search = '',
      isActive = 'all'
    } = req.query;

    const skip = (page - 1) * limit;

    // Build query
    let query = {};

    // Role filter
    if (role !== 'all') {
      query.role = role;
    }

    // Active status filter
    if (isActive !== 'all') {
      query.isActive = isActive === 'true';
    }

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // SuperAdmin can see all users, Admin can only see students
    if (req.user.role === 'admin') {
      query.role = 'student';
    }

    const users = await User.find(query)
      .select('-password')
      .populate('enrolledCourses.course', 'title price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: users,
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

// @desc    Get user by ID
// @route   GET /api/users/:id
// @access  Private (Admin/SuperAdmin)
router.get('/:id', protect, requireAdmin, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password')
      .populate('enrolledCourses.course', 'title price instructor')
      .populate('inviteCodeUsed', 'code createdAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Admin can only view students
    if (req.user.role === 'admin' && user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this user'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update user
// @route   PUT /api/users/:id
// @access  Private (SuperAdmin only)
router.put('/:id', protect, requireSuperAdmin, [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('phone').optional().isMobilePhone().withMessage('Please provide a valid phone number'),
  body('role').optional().isIn(['student', 'admin', 'superadmin']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean')
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

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent changing SuperAdmin role
    if (user.role === 'superadmin' && req.body.role && req.body.role !== 'superadmin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot change SuperAdmin role'
      });
    }

    // Check if email is already taken
    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await User.findOne({ email: req.body.email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    const allowedFields = ['name', 'email', 'phone', 'role', 'isActive'];
    const fieldsToUpdate = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        fieldsToUpdate[field] = req.body[field];
      }
    });

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      fieldsToUpdate,
      { new: true, runValidators: true }
    ).select('-password');

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: updatedUser
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete user
// @route   DELETE /api/users/:id
// @access  Private (SuperAdmin only)
router.delete('/:id', protect, requireSuperAdmin, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent deleting SuperAdmin
    if (user.role === 'superadmin') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete SuperAdmin'
      });
    }

    // Delete user avatar if exists
    if (user.avatar && !user.avatar.startsWith('http')) {
      deleteFile(user.avatar);
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Upload user avatar
// @route   POST /api/users/:id/avatar
// @access  Private (User can upload own avatar, SuperAdmin can upload any)
router.post('/:id/avatar', protect, uploadSingle('avatar'), handleUploadError, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user can upload avatar (own avatar or SuperAdmin)
    if (req.user._id.toString() !== req.params.id && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload avatar for this user'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image file'
      });
    }

    // Delete old avatar if exists
    if (user.avatar && !user.avatar.startsWith('http')) {
      deleteFile(user.avatar);
    }

    // Update user avatar
    user.avatar = req.file.path;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Avatar uploaded successfully',
      data: {
        avatar: user.avatar
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get user statistics
// @route   GET /api/users/stats
// @access  Private (Admin/SuperAdmin)
router.get('/stats/overview', protect, requireAdmin, async (req, res, next) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 },
          active: {
            $sum: {
              $cond: [{ $eq: ['$isActive', true] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Format stats
    const formattedStats = {
      students: { total: 0, active: 0 },
      admins: { total: 0, active: 0 },
      superadmins: { total: 0, active: 0 }
    };

    stats.forEach(stat => {
      if (stat._id === 'student') {
        formattedStats.students = { total: stat.count, active: stat.active };
      } else if (stat._id === 'admin') {
        formattedStats.admins = { total: stat.count, active: stat.active };
      } else if (stat._id === 'superadmin') {
        formattedStats.superadmins = { total: stat.count, active: stat.active };
      }
    });

    // Get recent registrations (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentRegistrations = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo }
    });

    res.status(200).json({
      success: true,
      data: {
        ...formattedStats,
        recentRegistrations
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get students enrolled in admin's courses
// @route   GET /api/users/my-students
// @access  Private (Admin only)
router.get('/my-students/list', protect, requireAdmin, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      courseId = null,
      search = ''
    } = req.query;

    const skip = (page - 1) * limit;

    // Get admin's courses
    const adminCourses = await Course.find({ instructor: req.user._id }).select('_id');
    const courseIds = adminCourses.map(course => course._id);

    // Build query for students enrolled in admin's courses
    let query = {
      role: 'student',
      'enrolledCourses.course': { $in: courseIds },
      'enrolledCourses.paymentStatus': 'completed'
    };

    // Filter by specific course if provided
    if (courseId) {
      query['enrolledCourses.course'] = courseId;
    }

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const students = await User.find(query)
      .select('-password')
      .populate('enrolledCourses.course', 'title price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: students,
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

module.exports = router;