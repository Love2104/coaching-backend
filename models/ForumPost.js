const mongoose = require('mongoose');

const replySchema = new mongoose.Schema({
  content: {
    type: String,
    required: [true, 'Reply content is required'],
    trim: true,
    maxlength: [2000, 'Reply cannot exceed 2000 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  downvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

const forumPostSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Post title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Post content is required'],
    trim: true,
    maxlength: [5000, 'Content cannot exceed 5000 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    default: null // null means general discussion
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  image: {
    type: String,
    default: null
  },
  upvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  downvotes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  replies: [replySchema],
  isResolved: {
    type: Boolean,
    default: false
  },
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  resolvedAt: {
    type: Date,
    default: null
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  viewCount: {
    type: Number,
    default: 0
  },
  lastActivity: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
forumPostSchema.index({ author: 1 });
forumPostSchema.index({ course: 1 });
forumPostSchema.index({ tags: 1 });
forumPostSchema.index({ isResolved: 1 });
forumPostSchema.index({ isPinned: -1, lastActivity: -1 });
forumPostSchema.index({ createdAt: -1 });

// Update last activity when replies are added
forumPostSchema.pre('save', function(next) {
  if (this.isModified('replies')) {
    this.lastActivity = new Date();
  }
  next();
});

// Virtual for reply count
forumPostSchema.virtual('replyCount').get(function() {
  return this.replies.length;
});

// Virtual for net votes (upvotes - downvotes)
forumPostSchema.virtual('netVotes').get(function() {
  return this.upvotes.length - this.downvotes.length;
});

// Method to check if user has voted
forumPostSchema.methods.getUserVote = function(userId) {
  if (this.upvotes.includes(userId)) return 'upvote';
  if (this.downvotes.includes(userId)) return 'downvote';
  return null;
};

// Method to toggle vote
forumPostSchema.methods.toggleVote = function(userId, voteType) {
  const userIdStr = userId.toString();
  
  // Remove existing votes
  this.upvotes = this.upvotes.filter(id => id.toString() !== userIdStr);
  this.downvotes = this.downvotes.filter(id => id.toString() !== userIdStr);
  
  // Add new vote if different from current
  if (voteType === 'upvote') {
    this.upvotes.push(userId);
  } else if (voteType === 'downvote') {
    this.downvotes.push(userId);
  }
  
  return this.save();
};

// Method to mark as resolved
forumPostSchema.methods.markResolved = function(userId) {
  this.isResolved = true;
  this.resolvedBy = userId;
  this.resolvedAt = new Date();
  return this.save();
};

// Method to add reply
forumPostSchema.methods.addReply = function(replyData) {
  this.replies.push(replyData);
  this.lastActivity = new Date();
  return this.save();
};

module.exports = mongoose.model('ForumPost', forumPostSchema);