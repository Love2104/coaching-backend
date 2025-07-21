const express = require('express');
const { body, validationResult } = require('express-validator');
const AdminInviteCode = require('../models/AdminInviteCode');
const User = require('../models/User');
const { protect, requireSuperAdmin } = require('../middleware/auth');
const { sendAdminInviteEmail } = require('../utils/email');

const router = express.Router();

// @desc    Generate admin invite code
// @route   POST /api/invites/admin
// @access  Private (SuperAdmin only)
router.post('/admin', protect, requireSuperAdmin, [
  body('email').optional().isEmail().normalizeEmail().withMessage('Please provide a valid email'),
  body('expiryDays').optional().isInt({ min: 1, max: 30 }).withMessage('Expiry days must be between 1 and 30')
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

    const { email, expiryDays = process.env.INVITE_CODE_EXPIRY_DAYS || 7 } = req.body;

    // If email is provided, check if user already exists
    if (email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email'
        });
      }
    }

    // Generate unique invite code
    let code;
    let isUnique = false;
    
    while (!isUnique) {
      code = AdminInviteCode.generateCode();
      const existingCode = await AdminInviteCode.findOne({ code });
      if (!existingCode) {
        isUnique = true;
      }
    }

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + parseInt(expiryDays));

    // Create invite code
    const inviteCode = await AdminInviteCode.create({
      code,
      email,
      createdBy: req.user._id,
      expiresAt
    });

    // Send email if email is provided
    if (email) {
      try {
        await sendAdminInviteEmail(email, code, req.user.name);
      } catch (emailError) {
        console.error('Invite email error:', emailError);
        // Don't fail invite creation if email fails
      }
    }

    res.status(201).json({
      success: true,
      message: 'Admin invite code generated successfully',
      data: {
        code,
        email,
        expiresAt,
        inviteUrl: `${process.env.FRONTEND_URL}/register/admin?code=${code}`
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get all invite codes
// @route   GET /api/invites/admin
// @access  Private (SuperAdmin only)
router.get('/admin', protect, requireSuperAdmin, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      status = 'all', // all, active, used, expired
      search = ''
    } = req.query;

    const skip = (page - 1) * limit;

    // Build query
    let query = {};

    if (status === 'active') {
      query.isUsed = false;
      query.isActive = true;
      query.expiresAt = { $gt: new Date() };
    } else if (status === 'used') {
      query.isUsed = true;
    } else if (status === 'expired') {
      query.expiresAt = { $lte: new Date() };
      query.isUsed = false;
    }

    if (search) {
      query.$or = [
        { code: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const invites = await AdminInviteCode.find(query)
      .populate('createdBy', 'name email')
      .populate('usedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await AdminInviteCode.countDocuments(query);

    res.status(200).json({
      success: true,
      data: invites,
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

// @desc    Get invite code details
// @route   GET /api/invites/admin/:code
// @access  Public (for registration validation)
router.get('/admin/:code', async (req, res, next) => {
  try {
    const { code } = req.params;

    const invite = await AdminInviteCode.findOne({ code })
      .populate('createdBy', 'name email');

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: 'Invite code not found'
      });
    }

    // Check if code is valid
    const isValid = invite.isValid();

    res.status(200).json({
      success: true,
      data: {
        code: invite.code,
        email: invite.email,
        isValid,
        isUsed: invite.isUsed,
        expiresAt: invite.expiresAt,
        createdBy: invite.createdBy.name,
        createdAt: invite.createdAt
      }
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Deactivate invite code
// @route   PUT /api/invites/admin/:id/deactivate
// @access  Private (SuperAdmin only)
router.put('/admin/:id/deactivate', protect, requireSuperAdmin, async (req, res, next) => {
  try {
    const invite = await AdminInviteCode.findById(req.params.id);

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: 'Invite code not found'
      });
    }

    if (invite.isUsed) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate used invite code'
      });
    }

    invite.isActive = false;
    await invite.save();

    res.status(200).json({
      success: true,
      message: 'Invite code deactivated successfully',
      data: invite
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Resend invite email
// @route   POST /api/invites/admin/:id/resend
// @access  Private (SuperAdmin only)
router.post('/admin/:id/resend', protect, requireSuperAdmin, async (req, res, next) => {
  try {
    const invite = await AdminInviteCode.findById(req.params.id);

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: 'Invite code not found'
      });
    }

    if (!invite.email) {
      return res.status(400).json({
        success: false,
        message: 'No email associated with this invite code'
      });
    }

    if (invite.isUsed) {
      return res.status(400).json({
        success: false,
        message: 'Cannot resend email for used invite code'
      });
    }

    if (!invite.isValid()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot resend email for expired or inactive invite code'
      });
    }

    try {
      await sendAdminInviteEmail(invite.email, invite.code, req.user.name);

      res.status(200).json({
        success: true,
        message: 'Invite email sent successfully'
      });
    } catch (emailError) {
      console.error('Invite email error:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Failed to send invite email'
      });
    }
  } catch (error) {
    next(error);
  }
});

// @desc    Delete invite code
// @route   DELETE /api/invites/admin/:id
// @access  Private (SuperAdmin only)
router.delete('/admin/:id', protect, requireSuperAdmin, async (req, res, next) => {
  try {
    const invite = await AdminInviteCode.findById(req.params.id);

    if (!invite) {
      return res.status(404).json({
        success: false,
        message: 'Invite code not found'
      });
    }

    if (invite.isUsed) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete used invite code'
      });
    }

    await AdminInviteCode.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Invite code deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Get invite statistics
// @route   GET /api/invites/admin/stats
// @access  Private (SuperAdmin only)
router.get('/admin/stats', protect, requireSuperAdmin, async (req, res, next) => {
  try {
    const now = new Date();

    const stats = await AdminInviteCode.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          used: {
            $sum: {
              $cond: [{ $eq: ['$isUsed', true] }, 1, 0]
            }
          },
          active: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$isUsed', false] },
                    { $eq: ['$isActive', true] },
                    { $gt: ['$expiresAt', now] }
                  ]
                },
                1,
                0
              ]
            }
          },
          expired: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$isUsed', false] },
                    { $lte: ['$expiresAt', now] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const result = stats[0] || {
      total: 0,
      used: 0,
      active: 0,
      expired: 0
    };

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;