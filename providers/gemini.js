const axios = require('axios')

/**
 * Simple English to Vietnamese translations for stub mode
 */
const translations = {
  "Hello! How can I help you today?": "Xin chào! Tôi có thể giúp gì cho bạn hôm nay?",
  "Hi there! What would you like to talk about?": "Chào bạn! Bạn muốn nói về điều gì?",
  "Hey! Nice to meet you. How are you doing?": "Chào! Rất vui được gặp bạn. Bạn khỏe không?",
  "Hello! I'm here to chat. What's on your mind?": "Xin chào! Tôi ở đây để trò chuyện. Bạn đang nghĩ gì?",
  "I'm Maya, your AI conversation partner. What's your name?": "Tôi là Maya, đối tác trò chuyện AI của bạn. Tên bạn là gì?",
  "I'm doing great, thank you for asking! How about you?": "Tôi rất khỏe, cảm ơn bạn đã hỏi! Còn bạn thì sao?",
  "I can have conversations with you, answer questions, and help you practice your English. What would you like to talk about?": "Tôi có thể trò chuyện với bạn, trả lời câu hỏi và giúp bạn luyện tập tiếng Anh. Bạn muốn nói về điều gì?",
  "You're welcome! Happy to help. Is there anything else you'd like to know?": "Không có gì! Rất vui được giúp đỡ. Còn điều gì khác bạn muốn biết không?",
  "Goodbye! It was nice talking with you. Have a great day!": "Tạm biệt! Rất vui được nói chuyện với bạn. Chúc bạn một ngày tốt lành!",
  "That's interesting! Tell me more about that.": "Thật thú vị! Hãy kể cho tôi nghe thêm về điều đó.",
  "I see. Can you elaborate on that?": "Tôi hiểu rồi. Bạn có thể giải thích thêm không?",
  "Hmm, that's a good point. What makes you say that?": "Hmm, đó là một điểm hay. Điều gì khiến bạn nói như vậy?",
  "Interesting perspective! What do you think about it?": "Góc nhìn thú vị! Bạn nghĩ gì về điều đó?",
  "I understand. Is there something specific you'd like to discuss?": "Tôi hiểu rồi. Có điều gì cụ thể bạn muốn thảo luận không?",
  "That's a great question. Let me think... what are your thoughts on it?": "Đó là một câu hỏi hay. Để tôi suy nghĩ... bạn nghĩ sao về điều đó?"
}

/**
 * Translate English to Vietnamese for stub mode
 */
function translateStub(englishText){
  // Direct match
  if (translations[englishText]) return translations[englishText]
  
  // Pattern match for names
  const nameMatch = englishText.match(/Nice to meet you, (\w+)! How can I help you today\?/)
  if (nameMatch) return `Rất vui được gặp bạn, ${nameMatch[1]}! Tôi có thể giúp gì cho bạn hôm nay?`
  
  // Fallback: return original if no translation found
  return englishText + " (chưa có bản dịch)"
}

/**
 * Generate natural stub replies for demo/testing when no API key available
 */
function generateSmartStubReply(userInput){
  const input = String(userInput).toLowerCase().trim()
  
  // Greetings
  if (/^(hi|hello|hey|good morning|good afternoon|good evening)/.test(input)){
    const greetings = [
      "Hello! How can I help you today?",
      "Hi there! What would you like to talk about?",
      "Hey! Nice to meet you. How are you doing?",
      "Hello! I'm here to chat. What's on your mind?"
    ]
    return greetings[Math.floor(Math.random() * greetings.length)]
  }
  
  // Name questions
  if (/what.*your name|who are you|tell me your name/.test(input)){
    return "I'm Maya, your AI conversation partner. What's your name?"
  }
  
  // How are you
  if (/how are you|how do you do|how's it going/.test(input)){
    return "I'm doing great, thank you for asking! How about you?"
  }
  
  // About user
  if (/my name is|i'm |i am |call me/.test(input)){
    const match = input.match(/(?:my name is|i'm|i am|call me)\s+(\w+)/i)
    const name = match ? match[1] : 'there'
    return `Nice to meet you, ${name.charAt(0).toUpperCase() + name.slice(1)}! How can I help you today?`
  }
  
  // Questions about capabilities
  if (/what can you do|your capabilities|help me/.test(input)){
    return "I can have conversations with you, answer questions, and help you practice your English. What would you like to talk about?"
  }
  
  // Thank you
  if (/thank you|thanks|appreciate/.test(input)){
    return "You're welcome! Happy to help. Is there anything else you'd like to know?"
  }
  
  // Goodbye
  if (/bye|goodbye|see you|talk later/.test(input)){
    return "Goodbye! It was nice talking with you. Have a great day!"
  }
  
  // Default conversational responses
  const defaults = [
    "That's interesting! Tell me more about that.",
    "I see. Can you elaborate on that?",
    "Hmm, that's a good point. What makes you say that?",
    "Interesting perspective! What do you think about it?",
    "I understand. Is there something specific you'd like to discuss?",
    "That's a great question. Let me think... what are your thoughts on it?"
  ]
  
  return defaults[Math.floor(Math.random() * defaults.length)]
}

/**
 * Simple Gemini (Generative Language) adapter.
 * Reads API key from process.env.GEMINI_API_KEY or uses provided token.
 * This is a lightweight wrapper that attempts to extract a text reply.
 */
async function generateText({ text, temperature = 0.7, maxOutputTokens = 512, apiKey, oauthToken } = {}){
  if (!text) throw new Error('text required')

  const key = apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY
  const oauth = oauthToken || process.env.GOOGLE_OAUTH_ACCESS_TOKEN

  // If no API key / OAuth token is available, return a safe local stub reply
  if (!key && !oauth){
    console.log('[Gemini] No API key found, using stub reply')
    return Promise.resolve(generateSmartStubReply(text))
  }

  try {
    // Use Gemini 3 Flash Preview
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent`
    
    const body = {
      contents: [{
        parts: [{ text }]
      }],
      generationConfig: {
        temperature,
        maxOutputTokens
      }
    }

    const headers = { 'Content-Type': 'application/json' }
    const params = {}
    if (key) params.key = key
    if (oauth) headers['Authorization'] = `Bearer ${oauth}`

    const resp = await axios.post(url, body, { headers, params, timeout: 20000 })
    const data = resp.data || {}

    // Extract text from Gemini API response
    if (data.candidates && data.candidates[0] && data.candidates[0].content) {
      const content = data.candidates[0].content
      if (content.parts && content.parts[0] && content.parts[0].text) {
        return String(content.parts[0].text)
      }
    }

    console.error('[Gemini] Unexpected response format:', JSON.stringify(data))
    throw new Error('Unexpected API response format')
  } catch (error) {
    console.error('[Gemini] API Error:', error.response?.data || error.message)
    // Return stub reply on error
    return generateSmartStubReply(text)
  }
}

module.exports = { generateText, translateStub }
