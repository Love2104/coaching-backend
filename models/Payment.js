const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  amount: {
    type: Number,
    required: [true, 'Payment amount is required'],
    min: [0, 'Amount cannot be negative']
  },
  currency: {
    type: String,
    default: 'INR'
  },
  paymentMethod: {
    type: String,
    enum: ['online', 'offline'],
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'pending'
  },
  // Online payment fields (Razorpay)
  razorpayOrderId: {
    type: String,
    default: null
  },
  razorpayPaymentId: {
    type: String,
    default: null
  },
  razorpaySignature: {
    type: String,
    default: null
  },
  // Offline payment fields
  offlineDetails: {
    bankName: {
      type: String,
      default: null
    },
    transactionId: {
      type: String,
      default: null
    },
    transactionDate: {
      type: Date,
      default: null
    },
    screenshot: {
      type: String, // file path
      default: null
    },
    notes: {
      type: String,
      default: null
    }
  },
  // Admin approval for offline payments
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  },
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Refund information
  refundAmount: {
    type: Number,
    default: 0
  },
  refundReason: {
    type: String,
    default: null
  },
  refundedAt: {
    type: Date,
    default: null
  },
  refundedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true
});

// Indexes
paymentSchema.index({ student: 1 });
paymentSchema.index({ course: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ paymentMethod: 1 });
paymentSchema.index({ razorpayOrderId: 1 });
paymentSchema.index({ razorpayPaymentId: 1 });
paymentSchema.index({ createdAt: -1 });

// Compound index for unique payment per student per course
paymentSchema.index({ student: 1, course: 1, status: 1 });

// Method to approve offline payment
paymentSchema.methods.approve = function(adminId) {
  this.status = 'completed';
  this.approvedBy = adminId;
  this.approvedAt = new Date();
  return this.save();
};

// Method to reject offline payment
paymentSchema.methods.reject = function(adminId, reason) {
  this.status = 'failed';
  this.rejectedBy = adminId;
  this.rejectedAt = new Date();
  this.rejectionReason = reason;
  return this.save();
};

// Method to process refund
paymentSchema.methods.processRefund = function(adminId, amount, reason) {
  this.status = 'refunded';
  this.refundAmount = amount || this.amount;
  this.refundReason = reason;
  this.refundedBy = adminId;
  this.refundedAt = new Date();
  return this.save();
};

// Static method to get revenue stats
paymentSchema.statics.getRevenueStats = function(startDate, endDate) {
  const matchStage = {
    status: 'completed',
    createdAt: {
      $gte: startDate || new Date(0),
      $lte: endDate || new Date()
    }
  };

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$paymentMethod',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);
};

// Static method to get monthly revenue
paymentSchema.statics.getMonthlyRevenue = function(year) {
  return this.aggregate([
    {
      $match: {
        status: 'completed',
        createdAt: {
          $gte: new Date(year, 0, 1),
          $lt: new Date(year + 1, 0, 1)
        }
      }
    },
    {
      $group: {
        _id: {
          month: { $month: '$createdAt' },
          paymentMethod: '$paymentMethod'
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { '_id.month': 1 }
    }
  ]);
};

module.exports = mongoose.model('Payment', paymentSchema);