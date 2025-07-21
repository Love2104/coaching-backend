const express = require('express');
const { body, validationResult } = require('express-validator');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Course = require('../models/Course');
const { protect, requireAdmin } = require('../middleware/auth');
const { sendEmail } = require('../utils/email');

const router = express.Router();

// @desc    Get notifications for current user
// @route   GET /api/notifications
// @access  Private
router.get('/', protect, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      unreadOnly = 'false',
      type = null
    } = req.query;

    const notifications = await Notification.getForUser(req.user._id, {
      page: parseInt(page),
      limit: parseInt(limit),
      unreadOnly: unreadOnly === 'true',
      type
    });

    // Add read status for each notification
    const notificationsWithReadStatus = notifications.map(notification => {
      const notificationObj = notification.toObject();
      notificationObj.isRead = notification.isReadBy(req.user._id);
      return notificationObj;
    });

    res.status(200).json({
      success: true,
      data: notificationsWithReadStatus
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get all notifications (Admin/SuperAdmin)
// @route   GET /api/notifications/all
// @access  Private (Admin/SuperAdmin)
router.get('/all', protect, requireAdmin, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      targetType = 'all',
      type = 'all',
      isSent = 'all',
      search = ''
    } = req.query;

    const skip = (page - 1) * limit;

    // Build query
    let query = {};

    // Admin can only see notifications they created
    if (req.user.role === 'admin') {
      query.createdBy = req.user._id;
    }

    if (targetType !== 'all') query.targetType = targetType;
    if (type !== 'all') query.type = type;
    if (isSent !== 'all') query.isSent = isSent === 'true';

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { message: { $regex: search, $options: 'i' } }
      ];
    }

    const notifications = await Notification.find(query)
      .populate('createdBy', 'name email')
      .populate('targetCourse', 'title')
      .populate('targetUsers', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);

    res.status(200).json({
      success: true,
      data: notifications,
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

// @desc    Create notification
// @route   POST /api/notifications
// @access  Private (Admin/SuperAdmin)
router.post('/', protect, requireAdmin, [
  body('title').trim().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
  body('message').trim().isLength({ min: 10, max: 1000 }).withMessage('Message must be between 10 and 1000 characters'),
  body('type').isIn(['info', 'success', 'warning', 'error', 'announcement']).withMessage('Invalid notification type'),
  body('targetType').isIn(['all_students', 'all_admins', 'specific_user', 'course_students', 'all_users']).withMessage('Invalid target type'),
  body('targetUsers').optional().isArray().withMessage('Target users must be an array'),
  body('targetCourse').optional().isMongoId().withMessage('Valid course ID is required'),
  body('sendEmail').optional().isBoolean().withMessage('sendEmail must be a boolean'),
  body('scheduledFor').optional().isISO8601().withMessage('Valid scheduled date is required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
  body('expiresAt').optional().isISO8601().withMessage('Valid expiry date is required')
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

    const {
      title,
      message,
      type,
      targetType,
      targetUsers = [],
      targetCourse,
      sendEmail = false,
      scheduledFor,
      priority = 'medium',
      expiresAt,
      actionButton
    } = req.body;

    // Validate target type specific requirements
    if (targetType === 'specific_user' && (!targetUsers || targetUsers.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Target users are required for specific_user target type'
      });
    }

    if (targetType === 'course_students' && !targetCourse) {
      return res.status(400).json({
        success: false,
        message: 'Target course is required for course_students target type'
      });
    }

    // Validate course access for admin
    if (targetCourse && req.user.role === 'admin') {
      const course = await Course.findById(targetCourse);
      if (!course || course.instructor.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to send notifications for this course'
        });
      }
    }

    // Validate target users exist
    if (targetUsers.length > 0) {
      const users = await User.find({ _id: { $in: targetUsers } });
      if (users.length !== targetUsers.length) {
        return res.status(400).json({
          success: false,
          message: 'Some target users do not exist'
        });
      }
    }

    const notificationData = {
      title,
      message,
      type,
      createdBy: req.user._id,
      targetType,
      targetUsers,
      targetCourse,
      sendEmail,
      priority,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      isScheduled: !!scheduledFor,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      actionButton
    };

    const notification = await Notification.create(notificationData);

    // If not scheduled, send immediately
    if (!scheduledFor) {
      await sendNotificationNow(notification);
    }

    await notification.populate('createdBy', 'name email');
    await notification.populate('targetCourse', 'title');

    res.status(201).json({
      success: true,
      message: scheduledFor ? 'Notification scheduled successfully' : 'Notification sent successfully',
      data: notification
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to send notification immediately
async function sendNotificationNow(notification) {
  try {
    // Get target users
    const targetUsers = await notification.getTargetUsers();

    // Send emails if enabled
    if (notification.sendEmail && targetUsers.length > 0) {
      const emailPromises = targetUsers.map(user => {
        const emailOptions = {
          email: user.email,
          subject: notification.title,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>${notification.title}</h2>
              <p>${notification.message}</p>
              ${notification.actionButton ? `
                <a href="${notification.actionButton.url}" 
                   style="background-color: #007bff; color: white; padding: 10px 20px; 
                          text-decoration: none; border-radius: 5px; display: inline-block; margin: 20px 0;">
                  ${notification.actionButton.text}
                </a>
              ` : ''}
              <p>Best regards,<br>Coaching Platform Team</p>
            </div>
          `
        };

        return sendEmail(emailOptions).catch(error => {
          console.error(`Email error for user ${user.email}:`, error);
        });
      });

      await Promise.allSettled(emailPromises);
    }

    // Mark as sent
    await notification.markAsSent();
  } catch (error) {
    console.error('Error sending notification:', error);
  }
}

// @desc    Update notification
// @route   PUT /api/notifications/:id
// @access  Private (Admin/SuperAdmin - own notifications only for Admin)
router.put('/:id', protect, requireAdmin, [
  body('title').optional().trim().isLength({ min: 5, max: 200 }).withMessage('Title must be between 5 and 200 characters'),
  body('message').optional().trim().isLength({ min: 10, max: 1000 }).withMessage('Message must be between 10 and 1000 characters'),
  body('type').optional().isIn(['info', 'success', 'warning', 'error', 'announcement']).withMessage('Invalid notification type'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']).withMessage('Invalid priority'),
  body('expiresAt').optional().isISO8601().withMessage('Valid expiry date is required'),
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

    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if user can update this notification
    if (req.user.role !== 'superadmin' && notification.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this notification'
      });
    }

    // Don't allow updating sent notifications
    if (notification.isSent) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update sent notifications'
      });
    }

    const allowedFields = ['title', 'message', 'type', 'priority', 'expiresAt', 'isActive', 'actionButton'];
    const updateData = {};

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (req.body.expiresAt) {
      updateData.expiresAt = new Date(req.body.expiresAt);
    }

    const updatedNotification = await Notification.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email').populate('targetCourse', 'title');

    res.status(200).json({
      success: true,
      message: 'Notification updated successfully',
      data: updatedNotification
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private (Admin/SuperAdmin - own notifications only for Admin)
router.delete('/:id', protect, requireAdmin, async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if user can delete this notification
    if (req.user.role !== 'superadmin' && notification.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this notification'
      });
    }

    await Notification.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
router.put('/:id/read', protect, async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await notification.markAsRead(req.user._id);

    res.status(200).json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
router.put('/read-all/mark', protect, async (req, res, next) => {
  try {
    // Get all unread notifications for user
    const notifications = await Notification.getForUser(req.user._id, {
      unreadOnly: true,
      limit: 1000 // Large limit to get all unread
    });

    // Mark all as read
    const markReadPromises = notifications.map(notification => 
      notification.markAsRead(req.user._id)
    );

    await Promise.all(markReadPromises);

    res.status(200).json({
      success: true,
      message: `${notifications.length} notifications marked as read`
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get notification statistics
// @route   GET /api/notifications/stats
// @access  Private (Admin/SuperAdmin)
router.get('/stats/overview', protect, requireAdmin, async (req, res, next) => {
  try {
    // Build query based on user role
    let query = {};
    if (req.user.role === 'admin') {
      query.createdBy = req.user._id;
    }

    const stats = await Notification.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          sent: {
            $sum: {
              $cond: [{ $eq: ['$isSent', true] }, 1, 0]
            }
          },
          scheduled: {
            $sum: {
              $cond: [{ $eq: ['$isScheduled', true] }, 1, 0]
            }
          },
          active: {
            $sum: {
              $cond: [{ $eq: ['$isActive', true] }, 1, 0]
            }
          }
        }
      }
    ]);

    // Get type breakdown
    const typeStats = await Notification.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    const result = stats[0] || {
      total: 0,
      sent: 0,
      scheduled: 0,
      active: 0
    };

    result.byType = {};
    typeStats.forEach(stat => {
      result.byType[stat._id] = stat.count;
    });

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Send scheduled notifications (cron job endpoint)
// @route   POST /api/notifications/send-scheduled
// @access  Private (SuperAdmin only)
router.post('/send-scheduled', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'SuperAdmin access required'
      });
    }

    const now = new Date();

    // Find scheduled notifications that are due
    const dueNotifications = await Notification.find({
      isScheduled: true,
      isSent: false,
      isActive: true,
      scheduledFor: { $lte: now }
    });

    let sentCount = 0;

    for (const notification of dueNotifications) {
      try {
        await sendNotificationNow(notification);
        sentCount++;
      } catch (error) {
        console.error(`Error sending notification ${notification._id}:`, error);
      }
    }

    res.status(200).json({
      success: true,
      message: `${sentCount} scheduled notifications sent`,
      data: { sentCount, totalDue: dueNotifications.length }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;