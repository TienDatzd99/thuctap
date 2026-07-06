const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session',
    required: true,
  },
  senderRole: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true,
  },
  textContent: {
    type: String,
    required: true,
  },
  grammarFeedback: {
    type: [String], // Array of feedback strings
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('Message', messageSchema);
