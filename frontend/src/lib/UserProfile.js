/**
 * User Profile Manager
 * Tracks user behavior, interests, vocabulary, and speaking patterns
 * for AI personalization
 */

export class UserProfileManager {
  constructor() {
    this.profile = this.loadProfile()
    this.currentSession = {
      startTime: Date.now(),
      pauses: [],
      topics: [],
      interactions: []
    }
  }

  loadProfile() {
    try {
      const saved = localStorage.getItem('userProfile')
      if (saved) {
        const profile = JSON.parse(saved)
        console.log('[UserProfile] Loaded existing profile:', profile)
        return profile
      }
    } catch (err) {
      console.error('[UserProfile] Error loading profile:', err)
    }

    // Default profile for new users
    return {
      version: 1,
      created: Date.now(),
      interests: [], // Topics user frequently discusses
      vocabulary: {
        known: [], // Words user uses confidently
        uncertain: [], // Words user hesitates on
        unknown: [] // Words AI used that user didn't respond to
      },
      speakingPatterns: {
        avgPauseDuration: 0,
        hesitationCount: 0,
        totalInteractions: 0,
        avgResponseTime: 0
      },
      conversationHistory: [], // Last 20 conversations
      preferences: {
        speakingSpeed: 'normal', // slow, normal, fast
        vocabularyLevel: 'intermediate', // beginner, intermediate, advanced
        preferredTopics: [],
        avoidTopics: []
      }
    }
  }

  saveProfile() {
    try {
      localStorage.setItem('userProfile', JSON.stringify(this.profile))
      console.log('[UserProfile] Profile saved')
    } catch (err) {
      console.error('[UserProfile] Error saving profile:', err)
    }
  }

  // Track pause during user speech
  trackPause(durationMs) {
    this.currentSession.pauses.push({
      duration: durationMs,
      timestamp: Date.now()
    })

    // Update average pause duration
    const allPauses = this.currentSession.pauses.map(p => p.duration)
    const avgPause = allPauses.reduce((a, b) => a + b, 0) / allPauses.length
    
    this.profile.speakingPatterns.avgPauseDuration = 
      (this.profile.speakingPatterns.avgPauseDuration * 0.9) + (avgPause * 0.1)
  }

  // Detect if user hesitated (long pause or filler words)
  detectHesitation(text, pauseDurationMs) {
    const hasFillers = /\b(um|uh|er|hmm|well|like|you know)\b/i.test(text)
    const longPause = pauseDurationMs > 2000 // 2 seconds

    if (hasFillers || longPause) {
      this.profile.speakingPatterns.hesitationCount++
      return true
    }
    return false
  }

  // Analyze AI question to extract potential unknown vocabulary
  analyzeAIQuestion(aiText) {
    // Extract complex words (more than 7 letters, not common)
    const words = aiText.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 7)

    // Common words to ignore
    const commonWords = ['something', 'anything', 'everything', 'question', 'important', 'interest', 'favorite']
    
    const complexWords = words.filter(w => !commonWords.includes(w))
    
    return {
      complexWords,
      questionText: aiText
    }
  }

  // Track user response to AI question
  trackInteraction(aiQuestion, userResponse, responsTimeMs, hadHesitation) {
    const interaction = {
      timestamp: Date.now(),
      aiQuestion,
      userResponse,
      responseTime: responsTimeMs,
      hadHesitation
    }

    this.currentSession.interactions.push(interaction)
    this.profile.speakingPatterns.totalInteractions++

    // If user hesitated, mark AI's words as potentially unknown
    if (hadHesitation) {
      const analysis = this.analyzeAIQuestion(aiQuestion)
      analysis.complexWords.forEach(word => {
        if (!this.profile.vocabulary.uncertain.includes(word)) {
          this.profile.vocabulary.uncertain.push(word)
          console.log('[UserProfile] Uncertain vocabulary:', word)
        }
      })
    }

    // Update average response time
    this.profile.speakingPatterns.avgResponseTime = 
      (this.profile.speakingPatterns.avgResponseTime * 0.9) + (responsTimeMs * 0.1)
  }

  // Extract topics from conversation
  extractTopics(text) {
    const topicKeywords = {
      'technology': ['computer', 'software', 'programming', 'technology', 'ai', 'app', 'website'],
      'food': ['food', 'restaurant', 'cooking', 'eat', 'meal', 'dinner', 'breakfast'],
      'travel': ['travel', 'trip', 'vacation', 'country', 'city', 'visit', 'tour'],
      'work': ['work', 'job', 'career', 'office', 'business', 'company', 'project'],
      'hobbies': ['hobby', 'sport', 'music', 'movie', 'book', 'game', 'reading'],
      'education': ['study', 'learn', 'school', 'university', 'course', 'class', 'teach'],
      'family': ['family', 'parent', 'child', 'brother', 'sister', 'relative'],
      'health': ['health', 'exercise', 'fitness', 'doctor', 'hospital', 'medicine']
    }

    const lowerText = text.toLowerCase()
    const detectedTopics = []

    for (const [topic, keywords] of Object.entries(topicKeywords)) {
      const matches = keywords.filter(kw => lowerText.includes(kw))
      if (matches.length > 0) {
        detectedTopics.push(topic)
      }
    }

    return detectedTopics
  }

  // Update interests based on conversation
  updateInterests(conversationText) {
    const topics = this.extractTopics(conversationText)
    
    topics.forEach(topic => {
      const existing = this.profile.interests.find(i => i.topic === topic)
      if (existing) {
        existing.count++
        existing.lastMentioned = Date.now()
      } else {
        this.profile.interests.push({
          topic,
          count: 1,
          lastMentioned: Date.now()
        })
      }
    })

    // Sort by count
    this.profile.interests.sort((a, b) => b.count - a.count)
    
    console.log('[UserProfile] Updated interests:', this.profile.interests.slice(0, 3))
  }

  // End session and save
  endSession() {
    // Save conversation summary
    const summary = {
      timestamp: this.currentSession.startTime,
      duration: Date.now() - this.currentSession.startTime,
      interactionCount: this.currentSession.interactions.length,
      topicsDiscussed: [...new Set(this.currentSession.topics)],
      avgPauseDuration: this.currentSession.pauses.length > 0 
        ? this.currentSession.pauses.reduce((a, b) => a + b.duration, 0) / this.currentSession.pauses.length
        : 0
    }

    this.profile.conversationHistory.unshift(summary)
    // Keep only last 20 sessions
    this.profile.conversationHistory = this.profile.conversationHistory.slice(0, 20)

    this.saveProfile()
    console.log('[UserProfile] Session ended, profile saved')
  }

  // Generate personalized system prompt for AI
  getPersonalizedSystemPrompt() {
    const topInterests = this.profile.interests.slice(0, 3).map(i => i.topic)
    const uncertainWords = this.profile.vocabulary.uncertain.slice(-10) // Last 10 uncertain words
    const vocabLevel = this.profile.preferences.vocabularyLevel
    const avgPause = this.profile.speakingPatterns.avgPauseDuration

    let prompt = `You are a friendly English conversation partner helping a Vietnamese student practice English.

STUDENT PROFILE:
- Vocabulary Level: ${vocabLevel}
- Speaking Pattern: ${avgPause > 2000 ? 'Needs time to think, speak slowly' : avgPause > 1000 ? 'Normal pace' : 'Quick thinker'}
- Interests: ${topInterests.length > 0 ? topInterests.join(', ') : 'Still learning about student'}
`

    if (uncertainWords.length > 0) {
      prompt += `- May struggle with words: ${uncertainWords.slice(0, 5).join(', ')}

`
    }

    prompt += `INSTRUCTIONS:
- Use ${vocabLevel} level vocabulary
- ${avgPause > 2000 ? 'Speak slowly and clearly, give student time to think' : 'Use natural conversational pace'}
- ${topInterests.length > 0 ? `Occasionally mention topics like ${topInterests.join(' or ')} that student enjoys` : 'Ask about student\'s interests'}
- If student seems confused, rephrase with simpler words
- Be encouraging and patient
- Keep responses conversational and friendly (2-3 sentences max)
`

    return prompt
  }

  // Get profile summary for display
  getProfileSummary() {
    return {
      totalSessions: this.profile.conversationHistory.length,
      topInterests: this.profile.interests.slice(0, 5),
      vocabularyLevel: this.profile.preferences.vocabularyLevel,
      totalInteractions: this.profile.speakingPatterns.totalInteractions,
      avgResponseTime: Math.round(this.profile.speakingPatterns.avgResponseTime / 1000),
      uncertainWords: this.profile.vocabulary.uncertain.length
    }
  }

  // Reset profile (for testing)
  resetProfile() {
    localStorage.removeItem('userProfile')
    this.profile = this.loadProfile()
    console.log('[UserProfile] Profile reset')
  }
}
