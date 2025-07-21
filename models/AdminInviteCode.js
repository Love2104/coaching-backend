const mongoose = require('mongoose');
const crypto = require('crypto');

const adminInviteCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: null // Optional - can be sent to specific email
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isUsed: {
    type: Boolean,
    default: false
  },
  usedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  usedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for better performance
adminInviteCodeSchema.index({ code: 1 });
adminInviteCodeSchema.index({ expiresAt: 1 });
adminInviteCodeSchema.index({ isUsed: 1 });

// Generate unique invite code
adminInviteCodeSchema.statics.generateCode = function() {
  return crypto.randomBytes(16).toString('hex').toUpperCase();
};

// Check if code is valid
adminInviteCodeSchema.methods.isValid = function() {
  return !this.isUsed && this.isActive && this.expiresAt > new Date();
};

// Mark code as used
adminInviteCodeSchema.methods.markAsUsed = function(userId) {
  this.isUsed = true;
  this.usedBy = userId;
  this.usedAt = new Date();
  return this.save();
};

module.exports = mongoose.model('AdminInviteCode', adminInviteCodeSchema);