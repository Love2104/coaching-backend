const express = require('express');
const { body, validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const Course = require('../models/Course');
const User = require('../models/User');
const { protect, requireStudent, requireAdmin } = require('../middleware/auth');
const { uploadSingle, handleUploadError } = require('../middleware/upload');
const { createOrder, verifyPaymentSignature, getPaymentDetails } = require('../utils/razorpay');
const { sendCourseEnrollmentEmail, sendPaymentApprovedEmail, sendPaymentRejectedEmail } = require('../utils/email');

const router = express.Router();

// @desc    Create Razorpay order for course purchase
// @route   POST /api/payments/create-order
// @access  Private (Student only)
router.post('/create-order', protect, requireStudent, [
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

    const { courseId } = req.body;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course || !course.isPublished) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or not available'
      });
    }

    // Check if student has already purchased this course
    if (req.user.hasPurchasedCourse(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'You have already purchased this course'
      });
    }

    // Check if there's already a pending payment
    const existingPayment = await Payment.findOne({
      student: req.user._id,
      course: courseId,
      status: 'pending'
    });

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending payment for this course'
      });
    }

    // Create Razorpay order
    const order = await createOrder(
      course.price,
      'INR',
      `course_${courseId}_${req.user._id}`
    );

    // Create payment record
    const payment = await Payment.create({
      student: req.user._id,
      course: courseId,
      amount: course.price,
      paymentMethod: 'online',
      razorpayOrderId: order.id,
      metadata: {
        courseName: course.title,
        studentName: req.user.name,
        studentEmail: req.user.email
      }
    });

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        paymentId: payment._id,
        course: {
          id: course._id,
          title: course.title,
          price: course.price
        }
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Verify Razorpay payment
// @route   POST /api/payments/verify
// @access  Private (Student only)
router.post('/verify', protect, requireStudent, [
  body('razorpayOrderId').notEmpty().withMessage('Razorpay order ID is required'),
  body('razorpayPaymentId').notEmpty().withMessage('Razorpay payment ID is required'),
  body('razorpaySignature').notEmpty().withMessage('Razorpay signature is required')
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

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    // Find payment record
    const payment = await Payment.findOne({
      razorpayOrderId,
      student: req.user._id,
      status: 'pending'
    }).populate('course', 'title');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment record not found'
      });
    }

    // Verify payment signature
    const isValidSignature = verifyPaymentSignature(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isValidSignature) {
      // Mark payment as failed
      payment.status = 'failed';
      await payment.save();

      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    // Update payment record
    payment.status = 'completed';
    payment.razorpayPaymentId = razorpayPaymentId;
    payment.razorpaySignature = razorpaySignature;
    await payment.save();

    // Enroll student in course
    const user = await User.findById(req.user._id);
    user.enrolledCourses.push({
      course: payment.course._id,
      paymentStatus: 'completed',
      paymentMethod: 'online'
    });
    await user.save();

    // Update course enrollment count
    await Course.findByIdAndUpdate(payment.course._id, {
      $inc: { enrollmentCount: 1 }
    });

    // Send enrollment confirmation email
    try {
      await sendCourseEnrollmentEmail(
        user.email,
        user.name,
        payment.course.title,
        'online'
      );
    } catch (emailError) {
      console.error('Enrollment email error:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified and course enrolled successfully',
      data: {
        paymentId: payment._id,
        courseId: payment.course._id,
        courseName: payment.course.title
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Request offline payment
// @route   POST /api/payments/offline
// @access  Private (Student only)
router.post('/offline', protect, requireStudent, uploadSingle('screenshot'), handleUploadError, [
  body('courseId').isMongoId().withMessage('Valid course ID is required'),
  body('bankName').trim().notEmpty().withMessage('Bank name is required'),
  body('transactionId').trim().notEmpty().withMessage('Transaction ID is required'),
  body('transactionDate').isISO8601().withMessage('Valid transaction date is required'),
  body('notes').optional().trim().isLength({ max: 500 }).withMessage('Notes cannot exceed 500 characters')
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

    const { courseId, bankName, transactionId, transactionDate, notes } = req.body;

    // Check if course exists
    const course = await Course.findById(courseId);
    if (!course || !course.isPublished) {
      return res.status(404).json({
        success: false,
        message: 'Course not found or not available'
      });
    }

    // Check if student has already purchased this course
    if (req.user.hasPurchasedCourse(courseId)) {
      return res.status(400).json({
        success: false,
        message: 'You have already purchased this course'
      });
    }

    // Check if there's already a pending payment
    const existingPayment = await Payment.findOne({
      student: req.user._id,
      course: courseId,
      status: 'pending'
    });

    if (existingPayment) {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending payment for this course'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Payment screenshot is required'
      });
    }

    // Create offline payment record
    const payment = await Payment.create({
      student: req.user._id,
      course: courseId,
      amount: course.price,
      paymentMethod: 'offline',
      offlineDetails: {
        bankName,
        transactionId,
        transactionDate: new Date(transactionDate),
        screenshot: req.file.path,
        notes
      },
      metadata: {
        courseName: course.title,
        studentName: req.user.name,
        studentEmail: req.user.email
      }
    });

    await payment.populate('course', 'title price');
    await payment.populate('student', 'name email');

    res.status(201).json({
      success: true,
      message: 'Offline payment request submitted successfully. It will be reviewed by admin.',
      data: payment
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get payment history
// @route   GET /api/payments/history
// @access  Private (Student - own payments, Admin - course payments, SuperAdmin - all)
router.get('/history', protect, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = 'all',
      paymentMethod = 'all',
      courseId = ''
    } = req.query;

    const skip = (page - 1) * limit;

    // Build query based on user role
    let query = {};

    if (req.user.role === 'student') {
      query.student = req.user._id;
    } else if (req.user.role === 'admin') {
      // Admin can see payments for their courses
      const adminCourses = await Course.find({ instructor: req.user._id }).select('_id');
      const courseIds = adminCourses.map(course => course._id);
      query.course = { $in: courseIds };
    }
    // SuperAdmin can see all payments (no additional query restrictions)

    // Apply filters
    if (status !== 'all') query.status = status;
    if (paymentMethod !== 'all') query.paymentMethod = paymentMethod;
    if (courseId) query.course = courseId;

    const payments = await Payment.find(query)
      .populate('student', 'name email')
      .populate('course', 'title price instructor')
      .populate('approvedBy', 'name')
      .populate('rejectedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments(query);

    res.status(200).json({
      success: true,
      data: payments,
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

// @desc    Get single payment
// @route   GET /api/payments/:id
// @access  Private
router.get('/:id', protect, async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('student', 'name email phone')
      .populate('course', 'title price instructor')
      .populate('approvedBy', 'name email')
      .populate('rejectedBy', 'name email');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check access permissions
    let hasAccess = false;

    if (req.user.role === 'superadmin') {
      hasAccess = true;
    } else if (req.user.role === 'admin') {
      hasAccess = payment.course.instructor.toString() === req.user._id.toString();
    } else if (req.user.role === 'student') {
      hasAccess = payment.student._id.toString() === req.user._id.toString();
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this payment'
      });
    }

    res.status(200).json({
      success: true,
      data: payment
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Approve offline payment
// @route   PUT /api/payments/:id/approve
// @access  Private (Admin/SuperAdmin)
router.put('/:id/approve', protect, requireAdmin, async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate('student', 'name email')
      .populate('course', 'title instructor');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if admin can approve this payment
    if (req.user.role !== 'superadmin' && payment.course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to approve this payment'
      });
    }

    if (payment.paymentMethod !== 'offline') {
      return res.status(400).json({
        success: false,
        message: 'Only offline payments can be approved manually'
      });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Payment is not in pending status'
      });
    }

    // Approve payment
    await payment.approve(req.user._id);

    // Enroll student in course
    const user = await User.findById(payment.student._id);
    
    // Check if already enrolled
    const existingEnrollment = user.enrolledCourses.find(
      enrollment => enrollment.course.toString() === payment.course._id.toString()
    );

    if (!existingEnrollment) {
      user.enrolledCourses.push({
        course: payment.course._id,
        paymentStatus: 'completed',
        paymentMethod: 'offline'
      });
      await user.save();

      // Update course enrollment count
      await Course.findByIdAndUpdate(payment.course._id, {
        $inc: { enrollmentCount: 1 }
      });
    } else {
      // Update existing enrollment
      existingEnrollment.paymentStatus = 'completed';
      await user.save();
    }

    // Send approval email
    try {
      await sendPaymentApprovedEmail(
        payment.student.email,
        payment.student.name,
        payment.course.title,
        payment.amount
      );
    } catch (emailError) {
      console.error('Approval email error:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Payment approved successfully',
      data: payment
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Reject offline payment
// @route   PUT /api/payments/:id/reject
// @access  Private (Admin/SuperAdmin)
router.put('/:id/reject', protect, requireAdmin, [
  body('reason').trim().notEmpty().withMessage('Rejection reason is required')
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

    const { reason } = req.body;

    const payment = await Payment.findById(req.params.id)
      .populate('student', 'name email')
      .populate('course', 'title instructor');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found'
      });
    }

    // Check if admin can reject this payment
    if (req.user.role !== 'superadmin' && payment.course.instructor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reject this payment'
      });
    }

    if (payment.paymentMethod !== 'offline') {
      return res.status(400).json({
        success: false,
        message: 'Only offline payments can be rejected manually'
      });
    }

    if (payment.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Payment is not in pending status'
      });
    }

    // Reject payment
    await payment.reject(req.user._id, reason);

    // Send rejection email
    try {
      await sendPaymentRejectedEmail(
        payment.student.email,
        payment.student.name,
        payment.course.title,
        reason
      );
    } catch (emailError) {
      console.error('Rejection email error:', emailError);
    }

    res.status(200).json({
      success: true,
      message: 'Payment rejected successfully',
      data: payment
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get payment statistics
// @route   GET /api/payments/stats
// @access  Private (Admin/SuperAdmin)
router.get('/stats/overview', protect, requireAdmin, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    // Build date filter
    let dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Build query based on user role
    let matchQuery = { ...dateFilter };

    if (req.user.role === 'admin') {
      // Admin can only see stats for their courses
      const adminCourses = await Course.find({ instructor: req.user._id }).select('_id');
      const courseIds = adminCourses.map(course => course._id);
      matchQuery.course = { $in: courseIds };
    }

    const stats = await Payment.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Get payment method breakdown
    const methodStats = await Payment.aggregate([
      { $match: { ...matchQuery, status: 'completed' } },
      {
        $group: {
          _id: '$paymentMethod',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);

    // Format results
    const formattedStats = {
      total: { count: 0, amount: 0 },
      completed: { count: 0, amount: 0 },
      pending: { count: 0, amount: 0 },
      failed: { count: 0, amount: 0 },
      online: { count: 0, amount: 0 },
      offline: { count: 0, amount: 0 }
    };

    stats.forEach(stat => {
      formattedStats.total.count += stat.count;
      formattedStats.total.amount += stat.totalAmount;
      
      if (formattedStats[stat._id]) {
        formattedStats[stat._id] = {
          count: stat.count,
          amount: stat.totalAmount
        };
      }
    });

    methodStats.forEach(stat => {
      if (formattedStats[stat._id]) {
        formattedStats[stat._id] = {
          count: stat.count,
          amount: stat.totalAmount
        };
      }
    });

    res.status(200).json({
      success: true,
      data: formattedStats
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Export payments to CSV
// @route   GET /api/payments/export/csv
// @access  Private (SuperAdmin only)
router.get('/export/csv', protect, async (req, res, next) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'SuperAdmin access required'
      });
    }

    const { startDate, endDate, status = 'all', paymentMethod = 'all' } = req.query;

    // Build query
    let query = {};

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    if (status !== 'all') query.status = status;
    if (paymentMethod !== 'all') query.paymentMethod = paymentMethod;

    const payments = await Payment.find(query)
      .populate('student', 'name email')
      .populate('course', 'title')
      .sort({ createdAt: -1 });

    // Prepare CSV data
    const csvData = payments.map(payment => ({
      'Payment ID': payment._id,
      'Student Name': payment.student.name,
      'Student Email': payment.student.email,
      'Course Title': payment.course.title,
      'Amount': payment.amount,
      'Currency': payment.currency,
      'Payment Method': payment.paymentMethod,
      'Status': payment.status,
      'Created At': payment.createdAt.toISOString(),
      'Razorpay Order ID': payment.razorpayOrderId || '',
      'Razorpay Payment ID': payment.razorpayPaymentId || '',
      'Bank Name': payment.offlineDetails?.bankName || '',
      'Transaction ID': payment.offlineDetails?.transactionId || ''
    }));

    // Convert to CSV
    const createCsvWriter = require('csv-writer').createObjectCsvWriter;
    const csvWriter = createCsvWriter({
      path: 'temp_payments.csv',
      header: Object.keys(csvData[0] || {}).map(key => ({ id: key, title: key }))
    });

    await csvWriter.writeRecords(csvData);

    // Send file
    res.download('temp_payments.csv', 'payments_export.csv', (err) => {
      if (err) {
        console.error('CSV download error:', err);
      }
      // Clean up temp file
      require('fs').unlinkSync('temp_payments.csv');
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;