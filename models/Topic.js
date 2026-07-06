const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
  topicName: {
    type: String,
    required: true,
  },
  description: {
    type: String,
  },
  contextPrompt: {
    type: String,
    required: true,
  }
});

module.exports = mongoose.model('Topic', topicSchema);
