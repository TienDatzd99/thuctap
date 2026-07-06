const mongoose = require('mongoose');

const vocabularySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  word: {
    type: String,
    required: true,
  },
  phonetic: {
    type: String,
  },
  meaning: {
    type: String,
  },
  learningStatus: {
    type: String,
    enum: ['new', 'learning', 'memorized'],
    default: 'new',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('Vocabulary', vocabularySchema);
