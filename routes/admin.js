const express = require('express');
const User = require('../models/User');
const Course = require('../models/Course');
const Payment = require('../models/Payment');
const Test = require('../models/Test');
const TestResult = require('../models/TestResult');
const ForumPost = require('../models/ForumPost');
const { protect, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

const router = express.Router();

// @desc    Get admin dashboard statistics
// @route   GET /api/admin/stats
// @access  Private (Admin/SuperAdmin)
router.get('/stats', protect, requireAdmin, async (req, res, next) => {
  try {
    let stats = {};

    if (req.user.role === 'superadmin') {
      // SuperAdmin sees all statistics
      const [
        totalStudents,
        totalAdmins,
        totalCourses,
        totalTests,
        totalTestAttempts,
        totalForumPosts,
        revenueStats
      ] = await Promise.all([
        User.countDocuments({ role: 'student' }),
        User.countDocuments({ role: 'admin' }),
        Course.countDocuments(),
        Test.countDocuments(),
        TestResult.countDocuments(),
        ForumPost.countDocuments(),
        Payment.aggregate([
          {
            $match: { status: 'completed' }
          },
          {
            $group: {
              _id: '$paymentMethod',
              totalAmount: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          }
        ])
      ]);

      // Format revenue stats
      const revenue = {
        online: { amount: 0, count: 0 },
        offline: { amount: 0, count: 0 },
        total: { amount: 0, count: 0 }
      };

      revenueStats.forEach(stat => {
        revenue[stat._id] = {
          amount: stat.totalAmount,
          count: stat.count
        };
        revenue.total.amount += stat.totalAmount;
        revenue.total.count += stat.count;
      });

      stats = {
        users: {
          totalStudents,
          totalAdmins,
          totalUsers: totalStudents + totalAdmins + 1 // +1 for superadmin
        },
        courses: {
          totalCourses
        },
        tests: {
          totalTests,
          totalAttempts: totalTestAttempts
        },
        forum: {
          totalPosts: totalForumPosts
        },
        revenue
      };
    } else {
      // Admin sees only their own statistics
      const adminCourses = await Course.find({ instructor: req.user._id }).select('_id');
      const courseIds = adminCourses.map(course => course._id);

      const [
        enrolledStudents,
        totalTests,
        totalTestAttempts,
        totalForumPosts,
        revenueStats
      ] = await Promise.all([
        User.countDocuments({
          role: 'student',
          'enrolledCourses.course': { $in: courseIds },
          'enrolledCourses.paymentStatus': 'completed'
        }),
        Test.countDocuments({ course: { $in: courseIds } }),
        TestResult.countDocuments({ course: { $in: courseIds } }),
        ForumPost.countDocuments({ course: { $in: courseIds } }),
        Payment.aggregate([
          {
            $match: { 
              course: { $in: courseIds },
              status: 'completed'
            }
          },
          {
            $group: {
              _id: '$paymentMethod',
              totalAmount: { $sum: '$amount' },
              count: { $sum: 1 }
            }
          }
        ])
      ]);

      // Format revenue stats
      const revenue = {
        online: { amount: 0, count: 0 },
        offline: { amount: 0, count: 0 },
        total: { amount: 0, count: 0 }
      };

      revenueStats.forEach(stat => {
        revenue[stat._id] = {
          amount: stat.totalAmount,
          count: stat.count
        };
        revenue.total.amount += stat.totalAmount;
        revenue.total.count += stat.count;
      });

      stats = {
        courses: {
          totalCourses: adminCourses.length
        },
        students: {
          enrolledStudents
        },
        tests: {
          totalTests,
          totalAttempts: totalTestAttempts
        },
        forum: {
          totalPosts: totalForumPosts
        },
        revenue
      };
    }

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get recent activity
// @route   GET /api/admin/recent-activity
// @access  Private (Admin/SuperAdmin)
router.get('/recent-activity', protect, requireAdmin, async (req, res, next) => {
  try {
    const { limit = 10 } = req.query;
    
    let activities = [];

    if (req.user.role === 'superadmin') {
      // SuperAdmin sees all recent activities
      const [recentUsers, recentCourses, recentPayments, recentTests] = await Promise.all([
        User.find({ role: 'student' })
          .sort({ createdAt: -1 })
          .limit(parseInt(limit) / 4)
          .select('name email createdAt'),
        Course.find()
          .sort({ createdAt: -1 })
          .limit(parseInt(limit) / 4)
          .populate('instructor', 'name')
          .select('title instructor createdAt'),
        Payment.find({ status: 'completed' })
          .sort({ createdAt: -1 })
          .limit(parseInt(limit) / 4)
          .populate('student', 'name')
          .populate('course', 'title')
          .select('student course amount createdAt'),
        TestResult.find()
          .sort({ createdAt: -1 })
          .limit(parseInt(limit) / 4)
          .populate('student', 'name')
          .populate('test', 'title')
          .select('student test percentage createdAt')
      ]);

      // Format activities
      recentUsers.forEach(user => {
        activities.push({
          type: 'user_registration',
          description: `${user.name} registered as a student`,
          timestamp: user.createdAt,
          data: { userName: user.name, userEmail: user.email }
        });
      });

      recentCourses.forEach(course => {
        activities.push({
          type: 'course_created',
          description: `${course.instructor.name} created course "${course.title}"`,
          timestamp: course.createdAt,
          data: { courseTitle: course.title, instructorName: course.instructor.name }
        });
      });

      recentPayments.forEach(payment => {
        activities.push({
          type: 'payment_completed',
          description: `${payment.student.name} purchased "${payment.course.title}" for ₹${payment.amount}`,
          timestamp: payment.createdAt,
          data: { 
            studentName: payment.student.name, 
            courseTitle: payment.course.title, 
            amount: payment.amount 
          }
        });
      });

      recentTests.forEach(result => {
        activities.push({
          type: 'test_completed',
          description: `${result.student.name} completed "${result.test.title}" with ${result.percentage}%`,
          timestamp: result.createdAt,
          data: { 
            studentName: result.student.name, 
            testTitle: result.test.title, 
            percentage: result.percentage 
          }
        });
      });
    } else {
      // Admin sees only activities related to their courses
      const adminCourses = await Course.find({ instructor: req.user._id }).select('_id');
      const courseIds = adminCourses.map(course => course._id);

      const [recentPayments, recentTests] = await Promise.all([
        Payment.find({ 
          course: { $in: courseIds },
          status: 'completed' 
        })
          .sort({ createdAt: -1 })
          .limit(parseInt(limit) / 2)
          .populate('student', 'name')
          .populate('course', 'title')
          .select('student course amount createdAt'),
        TestResult.find({ course: { $in: courseIds } })
          .sort({ createdAt: -1 })
          .limit(parseInt(limit) / 2)
          .populate('student', 'name')
          .populate('test', 'title')
          .select('student test percentage createdAt')
      ]);

      recentPayments.forEach(payment => {
        activities.push({
          type: 'payment_completed',
          description: `${payment.student.name} purchased "${payment.course.title}" for ₹${payment.amount}`,
          timestamp: payment.createdAt,
          data: { 
            studentName: payment.student.name, 
            courseTitle: payment.course.title, 
            amount: payment.amount 
          }
        });
      });

      recentTests.forEach(result => {
        activities.push({
          type: 'test_completed',
          description: `${result.student.name} completed "${result.test.title}" with ${result.percentage}%`,
          timestamp: result.createdAt,
          data: { 
            studentName: result.student.name, 
            testTitle: result.test.title, 
            percentage: result.percentage 
          }
        });
      });
    }

    // Sort all activities by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    activities = activities.slice(0, parseInt(limit));

    res.status(200).json({
      success: true,
      data: activities
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get system health
// @route   GET /api/admin/system-health
// @access  Private (SuperAdmin only)
router.get('/system-health', protect, requireSuperAdmin, async (req, res, next) => {
  try {
    const mongoose = require('mongoose');
    
    const health = {
      database: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        name: mongoose.connection.name
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      },
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };

    res.status(200).json({
      success: true,
      data: health
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;