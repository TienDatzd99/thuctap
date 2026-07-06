const express = require('express');
const router = express.Router();
const Vocabulary = require('../models/Vocabulary');
const auth = require('../middleware/auth');

// Get user's vocabulary list
router.get('/', auth, async (req, res) => {
  try {
    const vocab = await Vocabulary.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    res.json(vocab);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add new vocabulary word
router.post('/', auth, async (req, res) => {
  try {
    const { word, phonetic, meaning } = req.body;
    
    // Check if word already exists for this user
    let vocab = await Vocabulary.findOne({ userId: req.user.userId, word });
    if (vocab) {
      return res.status(400).json({ error: 'Word already in vocabulary list' });
    }

    vocab = new Vocabulary({
      userId: req.user.userId,
      word,
      phonetic,
      meaning
    });
    await vocab.save();
    res.status(201).json(vocab);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update learning status
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { learningStatus } = req.body; // 'new', 'learning', 'memorized'
    const vocab = await Vocabulary.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { learningStatus },
      { new: true }
    );
    if (!vocab) {
      return res.status(404).json({ error: 'Vocabulary not found' });
    }
    res.json(vocab);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
