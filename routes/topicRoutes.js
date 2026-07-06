const express = require('express');
const router = express.Router();
const Topic = require('../models/Topic');

// Get all topics
router.get('/', async (req, res) => {
  try {
    const topics = await Topic.find();
    res.json(topics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new topic (for seeding/admin)
router.post('/', async (req, res) => {
  try {
    const { topicName, description, contextPrompt } = req.body;
    const topic = new Topic({ topicName, description, contextPrompt });
    await topic.save();
    res.status(201).json(topic);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
