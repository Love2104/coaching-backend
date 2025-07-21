const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  selectedOption: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  marksObtained: {
    type: Number,
    default: 0
  },
  timeTaken: {
    type: Number, // in seconds
    default: 0
  }
});

const testResultSchema = new mongoose.Schema({
  test: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },
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
  answers: [answerSchema],
  totalMarks: {
    type: Number,
    required: true
  },
  marksObtained: {
    type: Number,
    required: true
  },
  percentage: {
    type: Number,
    required: true
  },
  isPassed: {
    type: Boolean,
    required: true
  },
  timeTaken: {
    type: Number, // in minutes
    required: true
  },
  startedAt: {
    type: Date,
    required: true
  },
  submittedAt: {
    type: Date,
    required: true
  },
  attemptNumber: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    enum: ['completed', 'abandoned', 'timeout'],
    default: 'completed'
  }
}, {
  timestamps: true
});

// Indexes
testResultSchema.index({ test: 1, student: 1 });
testResultSchema.index({ student: 1 });
testResultSchema.index({ course: 1 });
testResultSchema.index({ percentage: -1 });

// Compound index for unique attempts per test per student
testResultSchema.index({ test: 1, student: 1, attemptNumber: 1 }, { unique: true });

// Calculate percentage and pass status before saving
testResultSchema.pre('save', function(next) {
  if (this.totalMarks > 0) {
    this.percentage = Math.round((this.marksObtained / this.totalMarks) * 100);
  } else {
    this.percentage = 0;
  }
  next();
});

// Static method to get student's best result for a test
testResultSchema.statics.getBestResult = function(testId, studentId) {
  return this.findOne({
    test: testId,
    student: studentId
  }).sort({ percentage: -1, marksObtained: -1 });
};

// Static method to get student's attempt count for a test
testResultSchema.statics.getAttemptCount = function(testId, studentId) {
  return this.countDocuments({
    test: testId,
    student: studentId
  });
};

// Method to get performance analytics
testResultSchema.methods.getAnalytics = function() {
  const correctAnswers = this.answers.filter(answer => answer.isCorrect).length;
  const totalQuestions = this.answers.length;
  const accuracy = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
  
  return {
    totalQuestions,
    correctAnswers,
    incorrectAnswers: totalQuestions - correctAnswers,
    accuracy: Math.round(accuracy),
    averageTimePerQuestion: totalQuestions > 0 ? Math.round(this.timeTaken / totalQuestions) : 0
  };
};

module.exports = mongoose.model('TestResult', testResultSchema);