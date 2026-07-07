/**
 * Gemini Multimodal Live API Client
 * Uses WebSocket for bidirectional audio streaming
 */

import { UserProfileManager } from './UserProfile.js';

export class GeminiRealtimeClient {
  constructor({ apiKey, voicePersonality, onTranscript, onSpeechStart, onSpeechEnd, onError }) {
    this.apiKey = apiKey;
    this.voicePersonality = voicePersonality;
    this.onTranscript = onTranscript;
    this.onSpeechStart = onSpeechStart;
    this.onSpeechEnd = onSpeechEnd;
    this.onError = onError;
    
    this.ws = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.audioQueue = [];
    this.isPlaying = false;
    this.currentTurnHasTranscript = false; // Track if current turn sent transcript
    this.userSpeechDetected = false; // Track if user speech was logged
    this.lastUserSpeechTime = 0;
    this.audioChunksForTranscription = []; // Store audio chunks for transcription
    this.currentAssistantText = ''; // Accumulated transcript
    
    // User profile for personalization
    this.userProfile = new UserProfileManager();
    this.currentInteraction = {
      aiQuestion: '',
      userResponseStart: 0,
      lastPauseStart: 0
    };
  }

  async connect() {
    try {
      console.log('[Gemini] Connecting to Multimodal Live API...');

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000
        }
      });

      // Initialize AudioContext
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 24000
      });

      // Connect to Gemini WebSocket
      const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[Gemini] WebSocket connected');
        this.sendSetup();
        // Audio capture will start after setupComplete
      };

      this.ws.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[Gemini] WebSocket error:', error);
        if (this.onError) this.onError(error);
      };

      this.ws.onclose = (event) => {
        console.log('[Gemini] WebSocket closed, code:', event.code, 'reason:', event.reason);
        if (event.code !== 1000) {
          console.error('[Gemini] Abnormal close! Code:', event.code);
        }
        this.cleanup();
      };

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 10000);
        this.ws.addEventListener('open', () => {
          clearTimeout(timeout);
          resolve();
        }, { once: true });
      });

      console.log('[Gemini] Connected successfully');
    } catch (error) {
      console.error('[Gemini] Connection error:', error);
      if (this.onError) this.onError(error);
      throw error;
    }
  }

  sendSetup() {
    // Voice mapping
    const voiceMap = {
      maya: 'Kore', // Female, friendly
      miles: 'Puck'  // Male, professional
    };

    // Get personalized system instructions
    const systemInstructions = this.userProfile.getPersonalizedSystemPrompt();
    console.log('[Gemini] Using personalized system prompt based on user profile');

    const setupMessage = {
      setup: {
        model: 'models/gemini-2.5-flash-native-audio-preview-12-2025',
        generation_config: {
          response_modalities: ["AUDIO"], 
          speech_config: {
            voice_config: {
              prebuilt_voice_config: {
                voice_name: voiceMap[this.voicePersonality] || 'Kore'
              }
            }
          }
        },
        system_instruction: {
          parts: [{ text: systemInstructions }]
        }
      }
    };

    console.log('[Gemini] Sending setup with personalization');
    this.ws.send(JSON.stringify(setupMessage));
  }

  startAudioCapture() {
    // Use AudioWorklet or ScriptProcessor to get raw PCM data
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(this.mediaStream);
    
    // Create script processor for PCM capture
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (this.ws.readyState !== WebSocket.OPEN) return;
      
      // Get PCM data
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Simple VAD: Check audio level
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        sum += Math.abs(inputData[i]);
      }
      const avgLevel = sum / inputData.length;
      const threshold = 0.01; // Adjust based on testing
      
      // If user is speaking and not yet logged
      if (avgLevel > threshold && !this.userSpeechDetected) {
        this.userSpeechDetected = true;
        this.lastUserSpeechTime = Date.now();
        this.currentInteraction.userResponseStart = Date.now();
        console.log('[Gemini] 🎤 User started speaking');
        
        if (this.onSpeechStart) {
          this.onSpeechStart();
        }
        
        // Send user speech placeholder
        if (this.onTranscript) {
          this.onTranscript({
            role: 'user',
            text: '[Speaking...]',
            isDelta: false,
            isFinal: false
          });
        }
      }
      
      // Detect pause during speech
      const now = Date.now();
      if (this.userSpeechDetected && avgLevel <= threshold) {
        // User paused
        if (!this.currentInteraction.lastPauseStart) {
          this.currentInteraction.lastPauseStart = now;
        }
      } else if (this.userSpeechDetected && avgLevel > threshold) {
        // User resumed speaking after pause
        if (this.currentInteraction.lastPauseStart) {
          const pauseDuration = now - this.currentInteraction.lastPauseStart;
          if (pauseDuration > 500) { // Only track pauses > 500ms
            this.userProfile.trackPause(pauseDuration);
            console.log('[UserProfile] Pause detected:', pauseDuration, 'ms');
          }
          this.currentInteraction.lastPauseStart = 0;
        }
      }
      
      // Update last speech time if still speaking
      if (avgLevel > threshold) {
        this.lastUserSpeechTime = Date.now();
      }
      
      // Convert Float32 to Int16 PCM
      const pcm16 = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // Convert to base64
      const base64Audio = btoa(String.fromCharCode(...new Uint8Array(pcm16.buffer)));
      
      // Send to Gemini
      const message = {
        realtime_input: {
          media_chunks: [{
            mime_type: 'audio/pcm;rate=16000',
            data: base64Audio
          }]
        }
      };
      
      this.ws.send(JSON.stringify(message));
    };
    
    source.connect(processor);
    processor.connect(audioContext.destination);
    
    this.audioProcessor = processor;
    this.processorContext = audioContext;
    
    console.log('[Gemini] Audio capture started (PCM16 format)');
  }

  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  handleServerMessage(data) {
    try {
      // Handle Blob (binary data)
      if (data instanceof Blob) {
        console.log('[Gemini] Received binary data (Blob), size:', data.size);
        // Convert Blob to text and parse
        data.text().then(text => {
          try {
            const message = JSON.parse(text);
            this.processMessage(message);
          } catch (err) {
            console.error('[Gemini] Error parsing Blob as JSON:', err);
          }
        });
        return;
      }

      // Handle text/JSON directly
      const message = JSON.parse(data);
      this.processMessage(message);

    } catch (error) {
      console.error('[Gemini] Error handling message:', error);
    }
  }

  async processMessage(message) {
    console.log('[Gemini] Server message:', message);

    // Handle setup complete
    if (message.setupComplete) {
      console.log('[Gemini] ✅ Setup complete');
      // Start audio capture AFTER server confirms setup
      this.startAudioCapture();
      return;
    }

    // Handle tool call (if any)
    if (message.toolCall) {
      console.log('[Gemini] Tool call:', message.toolCall);
      return;
    }

    // Handle server content (audio/text response)
    if (message.serverContent) {
      console.log('[Gemini] 📨 Server content received');
      
      // Reset user speech flag when AI responds
      if (this.userSpeechDetected) {
        console.log('[Gemini] 🎤 User stopped speaking (AI responding)');
        this.userSpeechDetected = false;
        
        if (this.onSpeechEnd) {
          this.onSpeechEnd();
        }
      }
      
      const parts = message.serverContent.modelTurn?.parts || [];
      console.log('[Gemini] Parts count:', parts.length);
      
      // Process each part independently - don't block each other
      for (const part of parts) {
        console.log('[Gemini] Part type:', Object.keys(part));
        console.log('[Gemini] Part full data:', part); // DEBUG: Log toàn bộ
        
        // XỬ LÝ AUDIO: Always process independently
        if (part.inlineData && part.inlineData.data) {
          console.log('[Gemini] 🔊 Audio data received, mime:', part.inlineData.mimeType);
          if (part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
            this.playAudioChunk(part.inlineData.data);
          }
        }

        // XỬ LÝ TEXT: Display immediately when received (Real-time transcript)
        if (part.text) {
          console.log('[Gemini] 💬 Text delta received:', part.text);
          this.currentAssistantText += part.text; // Accumulate text
          
          if (this.onTranscript) {
            this.onTranscript({
              role: 'assistant',
              text: part.text,                        // Current delta
              fullText: this.currentAssistantText,    // Full accumulated text
              isDelta: true,                          // This is a delta update
              isFinal: false                          // Not final yet
            });
          }
        }
      }
    }

    // Handle turn complete - AI finished speaking
    if (message.serverContent?.turnComplete) {
      console.log('[Gemini] ✅ Turn complete');
      
      // Send final transcript if we have accumulated text
      if (this.currentAssistantText && this.onTranscript) {
        this.onTranscript({
          role: 'assistant',
          text: this.currentAssistantText,
          isDelta: false,
          isFinal: true  // Mark as final
        });
      }
      
      // Transcribe collected audio chunks if no text was received
      if (this.audioChunksForTranscription.length > 0 && !this.currentAssistantText) {
        console.log('[Gemini] 🎙️ Transcribing audio chunks...');
        await this.transcribeAudioChunks();
      }
      
      // Reset for next turn
      this.currentAssistantText = '';
      this.currentTurnHasTranscript = false;
      this.audioChunksForTranscription = [];
    }
  }

  async transcribeAudioChunks() {
    try {
      // Combine all audio chunks
      let totalLength = 0;
      for (const chunk of this.audioChunksForTranscription) {
        totalLength += chunk.length;
      }
      
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of this.audioChunksForTranscription) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      
      // Convert to WAV blob for Web Speech API
      const wavBlob = this.pcmToWav(combined, 24000, 1);
      
      // Use Web Speech API (if available)
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        // Web Speech API doesn't support blob input directly
        // We'll send to backend Whisper API instead
        console.log('[Gemini] 🎙️ Sending to backend for transcription...');
        await this.transcribeViaBackend(wavBlob);
      } else {
        console.log('[Gemini] ⚠️ Speech Recognition not available');
      }
      
      // Clear chunks
      this.audioChunksForTranscription = [];
      
    } catch (error) {
      console.error('[Gemini] ❌ Transcription error:', error);
    }
  }

  async transcribeViaBackend(audioBlob) {
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'audio.wav');
      
      const response = await fetch('http://localhost:4000/api/transcribe', {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        const { text } = await response.json();
        console.log('[Gemini] 💬 Transcribed text:', text);
        
        // Track interaction for personalization
        if (this.currentInteraction.aiQuestion && this.currentInteraction.userResponseStart) {
          const responseTime = Date.now() - this.currentInteraction.userResponseStart;
          const hadHesitation = this.userProfile.detectHesitation(text, responseTime);
          
          this.userProfile.trackInteraction(
            this.currentInteraction.aiQuestion,
            text,
            responseTime,
            hadHesitation
          );
          
          // Update interests from conversation
          const fullConversation = this.currentInteraction.aiQuestion + ' ' + text;
          this.userProfile.updateInterests(fullConversation);
          
          // Reset for next interaction
          this.currentInteraction.aiQuestion = '';
          this.currentInteraction.userResponseStart = 0;
        }
        
        if (this.onTranscript && text) {
          this.onTranscript({
            role: 'assistant',
            text: text,
            isDelta: false,
            isFinal: true
          });
        }
        
        // Store AI question for next interaction
        this.currentInteraction.aiQuestion = text;
      }
    } catch (error) {
      console.error('[Gemini] ❌ Backend transcription error:', error);
    }
  }

  pcmToWav(pcmData, sampleRate, numChannels) {
    const dataLength = pcmData.length;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true); // byte rate
    view.setUint16(32, numChannels * 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Copy PCM data
    const pcm16 = new Int16Array(pcmData.buffer);
    for (let i = 0; i < pcm16.length; i++) {
      view.setInt16(44 + i * 2, pcm16[i], true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  async playAudioChunk(base64Audio) {
    try {
      console.log('[Gemini] 🎵 Attempting to play audio chunk, length:', base64Audio.length);
      
      // Decode base64 to ArrayBuffer
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      console.log('[Gemini] 🎵 Decoded audio bytes:', bytes.length);

      // Convert PCM16 to Float32 for Web Audio API
      const pcm16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm16.length);
      for (let i = 0; i < pcm16.length; i++) {
        float32[i] = pcm16[i] / 32768.0; // Convert Int16 to Float32 [-1, 1]
      }

      // Store audio data for transcription
      this.audioChunksForTranscription.push(bytes);

      // Create AudioBuffer manually (PCM at 24kHz)
      const sampleRate = 24000;
      const audioBuffer = this.audioContext.createBuffer(1, float32.length, sampleRate);
      audioBuffer.getChannelData(0).set(float32);
      
      console.log('[Gemini] 🎵 Audio buffer created, duration:', audioBuffer.duration, 's');
      
      // Add to queue
      this.audioQueue.push(audioBuffer);
      
      console.log('[Gemini] 🎵 Added to queue, queue length:', this.audioQueue.length);
      
      // Start playback if not already playing
      if (!this.isPlaying) {
        this.playNextChunk();
      }
    } catch (error) {
      console.error('[Gemini] ❌ Error playing audio:', error);
    }
  }

  playNextChunk() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      console.log('[Gemini] 🎵 Playback queue empty');
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift();

    console.log('[Gemini] 🔊 Playing chunk, duration:', audioBuffer.duration, 's, remaining in queue:', this.audioQueue.length);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);
    
    source.onended = () => {
      console.log('[Gemini] 🎵 Chunk ended, playing next...');
      this.playNextChunk();
    };

    source.start(0);
  }

  disconnect() {
    console.log('[Gemini] Disconnecting...');
    
    // Save user profile before disconnect
    this.userProfile.endSession();
    console.log('[UserProfile] Session saved, profile summary:', this.userProfile.getProfileSummary());
    
    this.cleanup();
  }

  cleanup() {
    if (this.audioProcessor) {
      this.audioProcessor.disconnect();
    }
    
    if (this.processorContext) {
      this.processorContext.close();
    }

    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
    }

    if (this.ws) {
      this.ws.close();
    }

    if (this.audioContext) {
      this.audioContext.close();
    }

    this.audioQueue = [];
    this.isPlaying = false;
  }
}
