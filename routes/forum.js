const express = require('express');
const { body, validationResult } = require('express-validator');
const ForumPost = require('../models/ForumPost');
const Course = require('../models/Course');
const { protect, requireCoursePurchase, requireAdmin } = require('../middleware/auth');
const { uploadSingle, handleUploadError, deleteFile } = require('../middleware/upload');

const router = express.Router();

// @desc    Get all forum posts
// @route   GET /api/forum
// @access  Private (Students who purchased courses, Admins, SuperAdmin)
router.get('/', protect, async (req, res, next) => {
  try {
    // Check access for students
    if (req.user.role === 'student' && !req.user.hasPurchasedAnyCourse()) {
      return res.status(403).json({
        success: false,
        message: 'You must purchase at least one course to access the forum'
      });
    }

    const {
      page = 1,
      limit = 10,
      courseId = '',
      tags = '',
      search = '',
      resolved = 'all',
      sortBy = 'lastActivity',
      sortOrder = 'desc'
    } = req.query;

    const skip = (page - 1) * limit;

    // Build query
    let query = {};

    // Filter by course
    if (courseId) {
      query.course = courseId;
    }

    // Filter by tags
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim().toLowerCase());
      query.tags = { $in: tagArray };
    }

    // Search in title and content
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by resolved status
    if (resolved !== 'all') {
      query.isResolved = resolved === 'true';
    }

    // For students, only show posts from courses they purchased or general posts
    if (req.user.role === 'student') {
      const user = await req.user.populate('enrolledCourses.course');
      const purchasedCourseIds = user.enrolledCourses
        .filter(enrollment => enrollment.paymentStatus === 'completed')
        .map(enrollment => enrollment.course._id);

      query.$or = [
        { course: null }, // General posts
        { course: { $in: purchasedCourseIds } }
      ];
    }

    // Sort options
    const sortOptions = {};
    if (sortBy === 'lastActivity') {
      sortOptions.isPinned = -1; // Pinned posts first
      sortOptions.lastActivity = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    }

    const posts = await ForumPost.find(query)
      .populate('author', 'name email avatar')
      .populate('course', 'title')
      .populate('resolvedBy', 'name')
      .populate('replies.author', 'name email avatar')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ForumPost.countDocuments(query);

    // Add user vote status to each post
    const postsWithVotes = posts.map(post => {
      const postObj = post.toObject();
      postObj.userVote = post.getUserVote(req.user._id);
      postObj.netVotes = post.netVotes;
      return postObj;
    });

    res.status(200).json({
      success: true,
      data: postsWithVotes,
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

// @desc    Get single forum post
// @route   GET /api/forum/:id
// @access  Private (Students who purchased courses, Admins, SuperAdmin)
router.get('/:id', protect, async (req, res, next) => {
  try {
    const post = await ForumPost.findById(req.params.id)
      .populate('author', 'name email avatar')
      .populate('course', 'title instructor')
      .populate('resolvedBy', 'name')
      .populate('replies.author', 'name email avatar');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Forum post not found'
      });
    }

    // Check access permissions
    let hasAccess = false;

    if (req.user.role === 'superadmin') {
      hasAccess = true;
    } else if (req.user.role === 'admin') {
      // Admins can access posts from their courses or general posts
      hasAccess = !post.course || post.course.instructor.toString() === req.user._id.toString();
    } else if (req.user.role === 'student') {
      // Students can access general posts or posts from purchased courses
      if (!post.course) {
        hasAccess = req.user.hasPurchasedAnyCourse();
      } else {
        hasAccess = req.user.hasPurchasedCourse(post.course._id);
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this post'
      });
    }

    // Increment view count
    post.viewCount += 1;
    await post.save();

    // Add user vote status
    const postObj = post.toObject();
    postObj.userVote = post.getUserVote(req.user._id);
    postObj.netVotes = post.netVotes;

    res.status(200).json({
      success: true,
      data: postObj
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Create forum post
// @route   POST /api/forum
// @access  Private (Students who purchased courses)
router.post('/', protect, requireCoursePurchase, uploadSingle('image'), handleUploadError, [
  body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
  body('content').trim().isLength({ min: 10, max: 5000 }).withMessage('Content must be between 10 and 5000 characters'),
  body('courseId').optional().isMongoId().withMessage('Valid course ID is required'),
  body('tags').optional().isArray().withMessage('Tags must be an array')
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

    const { title, content, courseId, tags = [] } = req.body;

    // Validate course access if courseId is provided
    if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({
          success: false,
          message: 'Course not found'
        });
      }

      // Check if student has purchased the course
      if (!req.user.hasPurchasedCourse(courseId)) {
        return res.status(403).json({
          success: false,
          message: 'You must purchase this course to post in its forum'
        });
      }
    }

    const postData = {
      title,
      content,
      author: req.user._id,
      course: courseId || null,
      tags: Array.isArray(tags) ? tags.map(tag => tag.toLowerCase().trim()) : []
    };

    // Handle image upload
    if (req.file) {
      postData.image = req.file.path;
    }

    const post = await ForumPost.create(postData);
    await post.populate('author', 'name email avatar');
    await post.populate('course', 'title');

    res.status(201).json({
      success: true,
      message: 'Forum post created successfully',
      data: post
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update forum post
// @route   PUT /api/forum/:id
// @access  Private (Post author or SuperAdmin)
router.put('/:id', protect, uploadSingle('image'), handleUploadError, [
  body('title').optional().trim().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
  body('content').optional().trim().isLength({ min: 10, max: 5000 }).withMessage('Content must be between 10 and 5000 characters'),
  body('tags').optional().isArray().withMessage('Tags must be an array')
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

    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Forum post not found'
      });
    }

    // Check if user can update this post
    if (req.user.role !== 'superadmin' && post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this post'
      });
    }

    const allowedFields = ['title', 'content', 'tags'];
    const updateData = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        if (field === 'tags') {
          updateData[field] = Array.isArray(req.body[field]) ? req.body[field].map(tag => tag.toLowerCase().trim()) : [];
        } else {
          updateData[field] = req.body[field];
        }
      }
    });

    // Handle image upload
    if (req.file) {
      // Delete old image
      if (post.image) {
        deleteFile(post.image);
      }
      updateData.image = req.file.path;
    }

    // Mark as edited
    updateData.isEdited = true;
    updateData.editedAt = new Date();

    const updatedPost = await ForumPost.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('author', 'name email avatar').populate('course', 'title');

    res.status(200).json({
      success: true,
      message: 'Forum post updated successfully',
      data: updatedPost
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete forum post
// @route   DELETE /api/forum/:id
// @access  Private (Post author or SuperAdmin)
router.delete('/:id', protect, async (req, res, next) => {
  try {
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Forum post not found'
      });
    }

    // Check if user can delete this post
    if (req.user.role !== 'superadmin' && post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this post'
      });
    }

    // Delete associated image
    if (post.image) {
      deleteFile(post.image);
    }

    await ForumPost.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Forum post deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Vote on forum post
// @route   POST /api/forum/:id/vote
// @access  Private (Students who purchased courses)
router.post('/:id/vote', protect, requireCoursePurchase, [
  body('voteType').isIn(['upvote', 'downvote', 'remove']).withMessage('Invalid vote type')
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

    const { voteType } = req.body;

    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Forum post not found'
      });
    }

    // Check access permissions (same as viewing post)
    let hasAccess = false;
    if (!post.course) {
      hasAccess = req.user.hasPurchasedAnyCourse();
    } else {
      hasAccess = req.user.hasPurchasedCourse(post.course);
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to vote on this post'
      });
    }

    // Toggle vote
    await post.toggleVote(req.user._id, voteType === 'remove' ? null : voteType);

    res.status(200).json({
      success: true,
      message: 'Vote updated successfully',
      data: {
        upvotes: post.upvotes.length,
        downvotes: post.downvotes.length,
        netVotes: post.netVotes,
        userVote: post.getUserVote(req.user._id)
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Add reply to forum post
// @route   POST /api/forum/:id/replies
// @access  Private (Students who purchased courses, Admins for their courses)
router.post('/:id/replies', protect, [
  body('content').trim().isLength({ min: 5, max: 2000 }).withMessage('Reply content must be between 5 and 2000 characters')
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

    const { content } = req.body;

    const post = await ForumPost.findById(req.params.id).populate('course', 'instructor');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Forum post not found'
      });
    }

    // Check access permissions
    let hasAccess = false;

    if (req.user.role === 'superadmin') {
      hasAccess = true;
    } else if (req.user.role === 'admin') {
      // Admins can reply to posts in their courses or general posts
      hasAccess = !post.course || post.course.instructor.toString() === req.user._id.toString();
    } else if (req.user.role === 'student') {
      // Students need to have purchased courses to access forum
      if (!req.user.hasPurchasedAnyCourse()) {
        return res.status(403).json({
          success: false,
          message: 'You must purchase at least one course to access the forum'
        });
      }

      if (!post.course) {
        hasAccess = true; // General posts
      } else {
        hasAccess = req.user.hasPurchasedCourse(post.course._id);
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reply to this post'
      });
    }

    const replyData = {
      content,
      author: req.user._id
    };

    await post.addReply(replyData);
    await post.populate('replies.author', 'name email avatar');

    const newReply = post.replies[post.replies.length - 1];

    res.status(201).json({
      success: true,
      message: 'Reply added successfully',
      data: newReply
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Update reply
// @route   PUT /api/forum/:id/replies/:replyId
// @access  Private (Reply author or SuperAdmin)
router.put('/:id/replies/:replyId', protect, [
  body('content').trim().isLength({ min: 5, max: 2000 }).withMessage('Reply content must be between 5 and 2000 characters')
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

    const { content } = req.body;

    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Forum post not found'
      });
    }

    const reply = post.replies.id(req.params.replyId);

    if (!reply) {
      return res.status(404).json({
        success: false,
        message: 'Reply not found'
      });
    }

    // Check if user can update this reply
    if (req.user.role !== 'superadmin' && reply.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this reply'
      });
    }

    reply.content = content;
    reply.isEdited = true;
    reply.editedAt = new Date();

    await post.save();
    await post.populate('replies.author', 'name email avatar');

    res.status(200).json({
      success: true,
      message: 'Reply updated successfully',
      data: reply
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete reply
// @route   DELETE /api/forum/:id/replies/:replyId
// @access  Private (Reply author or SuperAdmin)
router.delete('/:id/replies/:replyId', protect, async (req, res, next) => {
  try {
    const post = await ForumPost.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Forum post not found'
      });
    }

    const reply = post.replies.id(req.params.replyId);

    if (!reply) {
      return res.status(404).json({
        success: false,
        message: 'Reply not found'
      });
    }

    // Check if user can delete this reply
    if (req.user.role !== 'superadmin' && reply.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this reply'
      });
    }

    post.replies.pull(req.params.replyId);
    await post.save();

    res.status(200).json({
      success: true,
      message: 'Reply deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Mark post as resolved
// @route   PUT /api/forum/:id/resolve
// @access  Private (Post author, Admins for their course posts, SuperAdmin)
router.put('/:id/resolve', protect, async (req, res, next) => {
  try {
    const post = await ForumPost.findById(req.params.id).populate('course', 'instructor');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Forum post not found'
      });
    }

    // Check if user can resolve this post
    let canResolve = false;

    if (req.user.role === 'superadmin') {
      canResolve = true;
    } else if (req.user.role === 'admin') {
      // Admins can resolve posts in their courses
      canResolve = post.course && post.course.instructor.toString() === req.user._id.toString();
    } else if (req.user.role === 'student') {
      // Students can resolve their own posts
      canResolve = post.author.toString() === req.user._id.toString();
    }

    if (!canResolve) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to resolve this post'
      });
    }

    await post.markResolved(req.user._id);

    res.status(200).json({
      success: true,
      message: 'Post marked as resolved',
      data: {
        isResolved: post.isResolved,
        resolvedBy: req.user.name,
        resolvedAt: post.resolvedAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Pin/Unpin post
// @route   PUT /api/forum/:id/pin
// @access  Private (Admins for their course posts, SuperAdmin)
router.put('/:id/pin', protect, requireAdmin, [
  body('isPinned').isBoolean().withMessage('isPinned must be a boolean')
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

    const { isPinned } = req.body;

    const post = await ForumPost.findById(req.params.id).populate('course', 'instructor');

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Forum post not found'
      });
    }

    // Check if user can pin this post
    if (req.user.role !== 'superadmin' && (!post.course || post.course.instructor.toString() !== req.user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to pin/unpin this post'
      });
    }

    post.isPinned = isPinned;
    await post.save();

    res.status(200).json({
      success: true,
      message: `Post ${isPinned ? 'pinned' : 'unpinned'} successfully`,
      data: {
        isPinned: post.isPinned
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get forum statistics
// @route   GET /api/forum/stats
// @access  Private (Admin/SuperAdmin)
router.get('/stats/overview', protect, requireAdmin, async (req, res, next) => {
  try {
    const stats = await ForumPost.aggregate([
      {
        $group: {
          _id: null,
          totalPosts: { $sum: 1 },
          resolvedPosts: {
            $sum: {
              $cond: [{ $eq: ['$isResolved', true] }, 1, 0]
            }
          },
          totalReplies: {
            $sum: { $size: '$replies' }
          },
          totalViews: { $sum: '$viewCount' }
        }
      }
    ]);

    const result = stats[0] || {
      totalPosts: 0,
      resolvedPosts: 0,
      totalReplies: 0,
      totalViews: 0
    };

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = await ForumPost.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    result.recentActivity = recentActivity;

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;