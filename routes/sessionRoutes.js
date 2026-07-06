const express = require('express');
const router = express.Router();
const Session = require('../models/Session');
const Message = require('../models/Message');
const auth = require('../middleware/auth');

// Start a new session
router.post('/start', auth, async (req, res) => {
  try {
    const { topicId, difficulty } = req.body;
    const session = new Session({
      userId: req.user.userId,
      topicId,
      difficulty
    });
    await session.save();
    res.status(201).json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save a message in a session
router.post('/:sessionId/message', auth, async (req, res) => {
  try {
    const { senderRole, textContent, grammarFeedback } = req.body;
    const { sessionId } = req.params;

    // Verify session belongs to user (could add extra check here)
    
    const message = new Message({
      sessionId,
      senderRole,
      textContent,
      grammarFeedback: grammarFeedback || []
    });
    await message.save();
    res.status(201).json(message);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get session messages
router.get('/:sessionId/messages', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const messages = await Message.find({ sessionId }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// End a session
router.put('/:sessionId/end', auth, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await Session.findByIdAndUpdate(sessionId, { endTime: Date.now() }, { new: true });
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
