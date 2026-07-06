const fetch = globalThis.fetch || require('node-fetch')

async function callOpenAI({ text, mode }){
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not set')

  // Build messages depending on mode
  let messages = []
  if (mode === 'translate'){
    messages = [
      { role: 'system', content: 'You are a helpful translator. Translate the user content to Vietnamese preserving meaning and tone.' },
      { role: 'user', content: text }
    ]
  } else {
    messages = [ { role: 'user', content: text } ]
  }

  const payload = {
    model: 'gpt-3.5-turbo',
    messages,
    max_tokens: 800,
    temperature: 0.7
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok){
    const txt = await res.text()
    throw new Error(`OpenAI error ${res.status}: ${txt}`)
  }

  const data = await res.json()
  const reply = data?.choices?.[0]?.message?.content || null
  return reply
}

module.exports = { callOpenAI }
