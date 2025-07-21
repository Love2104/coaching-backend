const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: [true, 'Question text is required'],
    trim: true
  },
  options: [{
    type: String,
    required: true,
    trim: true
  }],
  correctAnswer: {
    type: String,
    required: [true, 'Correct answer is required'],
    trim: true
  },
  explanation: {
    type: String,
    trim: true,
    default: ''
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  }
});

const testSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Test title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true
  },
  topic: {
    type: String,
    trim: true
  },
  questions: [questionSchema],
  totalQuestions: {
    type: Number,
    default: 0
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  isAIGenerated: {
    type: Boolean,
    default: true
  },
  aiPrompt: {
    type: String,
    default: null
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: String,
    default: 'AI Generator'
  }
}, {
  timestamps: true
});

// Update total questions before saving
testSchema.pre('save', function(next) {
  if (this.questions && this.questions.length > 0) {
    this.totalQuestions = this.questions.length;
  }
  next();
});

module.exports = mongoose.model('Test', testSchema);