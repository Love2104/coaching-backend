const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Notification title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  message: {
    type: String,
    required: [true, 'Notification message is required'],
    trim: true,
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  type: {
    type: String,
    enum: ['info', 'success', 'warning', 'error', 'announcement'],
    default: 'info'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Target audience
  targetType: {
    type: String,
    enum: ['all_students', 'all_admins', 'specific_user', 'course_students', 'all_users'],
    required: true
  },
  targetUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  targetCourse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null
  },
  // Delivery options
  sendEmail: {
    type: Boolean,
    default: false
  },
  sendPush: {
    type: Boolean,
    default: true
  },
  // Scheduling
  scheduledFor: {
    type: Date,
    default: null
  },
  isScheduled: {
    type: Boolean,
    default: false
  },
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  isSent: {
    type: Boolean,
    default: false
  },
  sentAt: {
    type: Date,
    default: null
  },
  // Read tracking
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  // Expiry
  expiresAt: {
    type: Date,
    default: null
  },
  // Action button (optional)
  actionButton: {
    text: {
      type: String,
      default: null
    },
    url: {
      type: String,
      default: null
    }
  },
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ createdBy: 1 });
notificationSchema.index({ targetType: 1 });
notificationSchema.index({ targetUsers: 1 });
notificationSchema.index({ targetCourse: 1 });
notificationSchema.index({ isActive: 1, isSent: 1 });
notificationSchema.index({ scheduledFor: 1 });
notificationSchema.index({ expiresAt: 1 });
notificationSchema.index({ priority: -1, createdAt: -1 });

// Method to mark as read by user
notificationSchema.methods.markAsRead = function(userId) {
  const existingRead = this.readBy.find(read => read.user.toString() === userId.toString());
  
  if (!existingRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    return this.save();
  }
  
  return Promise.resolve(this);
};

// Method to check if user has read notification
notificationSchema.methods.isReadBy = function(userId) {
  return this.readBy.some(read => read.user.toString() === userId.toString());
};

// Method to get target users based on targetType
notificationSchema.methods.getTargetUsers = async function() {
  const User = mongoose.model('User');
  const Course = mongoose.model('Course');
  
  let users = [];
  
  switch (this.targetType) {
    case 'all_students':
      users = await User.find({ role: 'student', isActive: true });
      break;
      
    case 'all_admins':
      users = await User.find({ role: { $in: ['admin', 'superadmin'] }, isActive: true });
      break;
      
    case 'all_users':
      users = await User.find({ isActive: true });
      break;
      
    case 'specific_user':
      users = await User.find({ _id: { $in: this.targetUsers }, isActive: true });
      break;
      
    case 'course_students':
      if (this.targetCourse) {
        const course = await Course.findById(this.targetCourse);
        if (course) {
          users = await User.find({
            'enrolledCourses.course': this.targetCourse,
            'enrolledCourses.paymentStatus': 'completed',
            isActive: true
          });
        }
      }
      break;
  }
  
  return users;
};

// Static method to get notifications for user
notificationSchema.statics.getForUser = function(userId, options = {}) {
  const {
    page = 1,
    limit = 20,
    unreadOnly = false,
    type = null
  } = options;
  
  const skip = (page - 1) * limit;
  
  // Build match query
  const matchQuery = {
    isActive: true,
    isSent: true,
    $or: [
      { targetType: 'all_users' },
      { targetType: 'all_students', targetUsers: userId },
      { targetType: 'all_admins', targetUsers: userId },
      { targetType: 'specific_user', targetUsers: userId },
      { targetType: 'course_students', targetUsers: userId }
    ]
  };
  
  if (type) {
    matchQuery.type = type;
  }
  
  if (unreadOnly) {
    matchQuery['readBy.user'] = { $ne: userId };
  }
  
  // Check for expired notifications
  const now = new Date();
  matchQuery.$or.push({
    expiresAt: { $exists: false }
  }, {
    expiresAt: { $gte: now }
  });
  
  return this.find(matchQuery)
    .populate('createdBy', 'name email')
    .populate('targetCourse', 'title')
    .sort({ priority: -1, createdAt: -1 })
    .skip(skip)
    .limit(limit);
};

// Method to mark as sent
notificationSchema.methods.markAsSent = function() {
  this.isSent = true;
  this.sentAt = new Date();
  return this.save();
};

module.exports = mongoose.model('Notification', notificationSchema);