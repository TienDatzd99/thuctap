require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const OpenAI = require('openai');
const { createClient } = require('@deepgram/sdk');
const { Translate } = require('@google-cloud/translate').v2;
const upload = multer();
const mongoose = require('mongoose')

const app = express();
const PORT = process.env.PORT || 4000;
const PYTHON_TTS_URL = process.env.PYTHON_TTS_URL || 'http://localhost:5000';

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const { generateText: geminiGenerate, translateStub } = require('./providers/gemini')

app.use(cors());
app.use(express.json());

app.get('/api/ping', (req, res) => res.json({ ok: true, ts: Date.now() }));

// Transcribe audio using Deepgram (200 hours free/month)
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    console.log('[Transcribe] Received audio file:', req.file.size, 'bytes');

    // Initialize Deepgram client
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

    // Transcribe using Deepgram
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      req.file.buffer,
      {
        model: 'nova-2',
        language: 'en',
        smart_format: true,
      }
    );

    if (error) {
      throw error;
    }

    const transcript = result.results.channels[0].alternatives[0].transcript;
    console.log('[Transcribe] Result:', transcript);

    res.json({ text: transcript });
  } catch (error) {
    console.error('[Transcribe] Error:', error);
    res.status(500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// Check available models
app.get('/api/models', async (req, res) => {
  try {
    const response = await axios.get('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });

    // Filter for realtime models
    const realtimeModels = response.data.data.filter(model =>
      model.id.includes('realtime')
    );

    res.json({
      allModels: response.data.data.map(m => m.id),
      realtimeModels: realtimeModels.map(m => m.id),
      hasRealtimeAccess: realtimeModels.length > 0
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

// Conversation memory store (in-memory, simple)
const conversations = new Map()

// Simple LLM with context awareness
app.post('/api/llm', async (req, res) => {
  try {
    const { text, mode, provider, userId, voicePersonality } = req.body || {}
    if (!text) return res.status(400).json({ error: 'text required' })

    // For now default provider => gemini
    const useProvider = provider || 'gemini'

    if (useProvider === 'gemini') {
      // Get conversation history for context
      const conversationId = userId || 'default'
      if (!conversations.has(conversationId)) conversations.set(conversationId, [])
      const history = conversations.get(conversationId)

      // If translate mode, use translation
      if (mode === 'translate') {
        console.log('[Translation] Request received:', text)

        try {
          // Use MyMemory Translation API (FREE, no key needed)
          console.log('[Translation] Calling MyMemory Translation API...')
          const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|vi`;
          const response = await axios.get(url);

          if (response.data.responseStatus === 200) {
            const translation = response.data.responseData.translatedText;
            console.log('[Translation] Result:', translation)
            return res.json({ translation });
          } else {
            throw new Error('Translation API returned non-200 status');
          }
        } catch (error) {
          console.error('[Translation] Translation error:', error.response?.data || error.message)
          // Fallback to stub
          const translation = translateStub(text)
          return res.json({ translation })
        }
      }

      // If suggestions mode, generate conversation suggestions
      if (mode === 'suggestions') {
        console.log('[Suggestions] Generating based on context...')
        console.log('[Suggestions] History length:', req.body.history?.length || 0)

        try {
          const history = req.body.history || [];
          const conversationContext = history.length > 0
            ? history.map(m => `${m.role}: ${m.text}`).join('\n')
            : `Last message: ${text}`;

          console.log('[Suggestions] Context:', conversationContext.substring(0, 200) + '...')

          const prompt = `You are suggesting responses for a student learning English.

CONVERSATION:
${conversationContext}

YOUR TASK: Generate 3 different responses the student could say next.

FORMAT EXAMPLE (if AI asks "What's your favorite food?"):
I really love Vietnamese pho
Pizza is my favorite food
I enjoy trying different cuisines

RULES:
- Each line = one complete response (5-15 words)
- All 3 responses must answer/respond to the last message
- Use natural, conversational English
- NO explanations, NO numbering, NO extra text
- Just 3 plain responses, one per line

Generate 3 responses now:`;

          const suggestions = await geminiGenerate({
            text: prompt,
            maxOutputTokens: 1024  // Increase to ensure 3 complete responses (was 512 default)
          });
          console.log('[Suggestions] Gemini response:', suggestions.substring(0, 300))

          const suggestionList = suggestions.trim().split('\n')
            .map(s => s.replace(/^[0-9.\-*]+\s*/, '').trim())
            .filter(s => s && s.length > 5 && !s.toLowerCase().includes('example'))
            .slice(0, 3);

          if (suggestionList.length >= 3) {
            console.log('[Suggestions] Generated successfully:', suggestionList)
            return res.json({ suggestions: suggestionList });
          } else {
            console.warn('[Suggestions] Not enough suggestions, using fallback')
            throw new Error('Insufficient suggestions');
          }
        } catch (error) {
          console.error('[Suggestions] Error details:', error.message)

          // Diverse fallback suggestions pool
          const fallbackPool = [
            "Tell me more about that",
            "That sounds interesting!",
            "What do you think about it?",
            "Can you give me an example?",
            "Have you tried that before?",
            "What's your favorite part?",
            "How did that make you feel?",
            "Do you do that often?",
            "That's really cool!",
            "I'd like to know more",
            "What happened next?",
            "Have you always liked that?",
            "Why do you enjoy that?",
            "Could you explain more?",
            "That's a great point!"
          ];

          // Randomly pick 3 different suggestions
          const shuffled = fallbackPool.sort(() => Math.random() - 0.5);
          const randomSuggestions = shuffled.slice(0, 3);

          console.log('[Suggestions] Using random fallback:', randomSuggestions)
          return res.json({ suggestions: randomSuggestions });
        }
      }

      // Build context-aware prompt with personality
      const personality = voicePersonality || 'maya'
      const contextPrompt = buildContextPrompt(text, history, personality)

      const reply = await geminiGenerate({ text: contextPrompt })

      // Store in conversation history
      history.push({ role: 'user', text })
      history.push({ role: 'assistant', text: reply })

      // Keep only last 10 messages (5 turns)
      if (history.length > 10) history.splice(0, history.length - 10)

      return res.json({ reply })
    }

    // fallback: echo
    return res.json({ reply: `AI (stub) reply to: ${text}` })
  } catch (err) {
    console.error('LLM error', err && err.message)
    return res.status(500).json({ error: err.message || 'llm error' })
  }
})

function buildContextPrompt(currentText, history, personality) {
  // Define personality traits
  const personalities = {
    maya: {
      trait: 'friendly, encouraging, and supportive English teacher',
      style: 'warm, patient, uses encouraging phrases like "Great job!", "That\'s interesting!", asks follow-up questions. IMPORTANT: Keep responses under 15 words for quick conversation flow'
    },
    miles: {
      trait: 'professional, clear, and direct conversation partner',
      style: 'articulate, focused, gives structured responses, provides examples. IMPORTANT: Keep responses under 15 words for quick conversation flow'
    }
  }

  const p = personalities[personality] || personalities.maya

  let prompt = `You are ${p.trait}. Your style: ${p.style}.\n\n`

  // Add recent conversation context
  if (history.length > 0) {
    prompt += 'Recent conversation:\n'
    history.slice(-6).forEach(msg => {
      prompt += `${msg.role === 'user' ? 'User' : 'You'}: ${msg.text}\n`
    })
    prompt += '\n'
  }

  prompt += `User: ${currentText}\nYou:`

  return prompt
}

// ==================== OpenAI Realtime API ====================

// Create ephemeral token for client WebRTC connection
app.post('/api/realtime-token', async (req, res) => {
  try {
    const { voicePersonality, userId, model } = req.body || {};

    // If model is Gemini, return API key directly (client-side WebSocket)
    if (model === 'gemini') {
      if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'your_google_api_key_here') {
        return res.status(500).json({
          error: 'Google API Key not configured. Please add GOOGLE_API_KEY to .env file.'
        });
      }

      return res.json({
        provider: 'gemini',
        apiKey: process.env.GOOGLE_API_KEY,
        voicePersonality
      });
    }

    // OpenAI Realtime API flow
    // Define personality-based system instructions
    const personalities = {
      maya: {
        instructions: `You are Maya, a friendly English teacher. Keep responses very brief (5-10 words). 
Always respond with audio. Say things like "Hi!", "Tell me more!", "That's great!".`
      },
      miles: {
        instructions: `You are Miles, a professional conversation partner. Keep responses very brief (5-10 words).
Always respond with audio. Use clear, direct language.`
      }
    };

    const personality = personalities[voicePersonality || 'maya'];

    // Create Realtime session with OpenAI
    const response = await axios.post(
      'https://api.openai.com/v1/realtime/sessions',
      {
        model: 'gpt-realtime-mini-2025-12-15',
        voice: voicePersonality === 'miles' ? 'alloy' : 'shimmer',
        instructions: personality.instructions,
        modalities: ['audio', 'text'],
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        temperature: 0.8,
        max_response_output_tokens: 150
        // Temporarily disable transcription to avoid 429 rate limits
        // input_audio_transcription: {
        //   model: 'whisper-1'
        // }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Return ephemeral token to client
    res.json({
      token: response.data.client_secret.value,
      sessionId: response.data.id,
      expiresAt: response.data.client_secret.expires_at
    });

  } catch (err) {
    console.error('Realtime token error:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to create realtime session',
      details: err.response?.data || err.message
    });
  }
});

// get suggestion stub (called after silence)
app.get('/api/get-suggestion', (req, res) => {
  res.json({ suggestion: 'Try describing your answer in one more sentence, or give an example.' });
});

// vocab capture stub
app.post('/api/vocab', (req, res) => {
  const { word, context, userId } = req.body || {};
  if (!word) return res.status(400).json({ error: 'word required' });
  // In a real app, save to DB. Here we just echo.
  res.json({ ok: true, saved: { word, context, userId, ts: Date.now() } });
});

// simple audio upload endpoint (for future STT server-side)
app.post('/api/upload-audio', upload.single('file'), (req, res) => {
  // Save file and call STT provider. Stub for now.
  res.json({ ok: true, message: 'audio received (stub)' });
});

// TTS endpoint - synthesize speech using CSM-1B Python service
app.post('/api/tts/synthesize', async (req, res) => {
  try {
    const { text, voice, context } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    // Call Python TTS service
    const response = await axios.post(`${PYTHON_TTS_URL}/synthesize`, {
      text,
      voice: voice || 'maya',
      context: context || []
    }, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30s timeout for audio generation
      validateStatus: (status) => status < 600 // Accept all status codes to handle errors
    });

    // Check if we got audio back
    if (response.status === 200) {
      // Send audio file back to frontend
      res.set('Content-Type', 'audio/wav');
      res.send(Buffer.from(response.data));
    } else if (response.status === 501) {
      // CSM-1B not available, return error so frontend falls back to browser TTS
      const errorData = JSON.parse(Buffer.from(response.data).toString());
      res.status(501).json(errorData);
    } else {
      throw new Error(`TTS service returned status ${response.status}`);
    }
  } catch (err) {
    console.error('TTS synthesis error:', err.message);

    // Return 501 to indicate TTS unavailable (frontend will use browser TTS)
    res.status(501).json({
      error: 'TTS service unavailable',
      fallback: 'use_browser_tts',
      details: err.message
    });
  }
});

// Check TTS service health
app.get('/api/tts/health', async (req, res) => {
  try {
    const response = await axios.get(`${PYTHON_TTS_URL}/health`, { timeout: 5000 });
    res.json(response.data);
  } catch (err) {
    res.status(503).json({
      status: 'unavailable',
      error: err.message,
      python_service: PYTHON_TTS_URL
    });
  }
});

app.listen(PORT, () => console.log(`Backend listening on http://localhost:${PORT}`));
