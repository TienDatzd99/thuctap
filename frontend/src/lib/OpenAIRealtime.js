/**
 * OpenAI Realtime API WebRTC Client
 * Handles bidirectional audio streaming with OpenAI's Realtime API
 */

const OPENAI_REALTIME_URL = 'https://api.openai.com/v1/realtime';

export class OpenAIRealtimeClient {
  constructor(options = {}) {
    this.token = options.token;
    this.onTranscript = options.onTranscript || (() => {});
    this.onAudioResponse = options.onAudioResponse || (() => {});
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    this.onError = options.onError || (() => {});
    
    this.peerConnection = null;
    this.dataChannel = null;
    this.audioContext = null;
    this.connected = false;
  }

  async connect() {
    try {
      // Create WebRTC peer connection
      this.peerConnection = new RTCPeerConnection();
      
      // Setup audio context for playing responses
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Create data channel for control messages
      this.dataChannel = this.peerConnection.createDataChannel('oai-events');
      
      this.dataChannel.onopen = () => {
        console.log('[Realtime] Data channel opened');
        this.connected = true;
      };
      
      this.dataChannel.onmessage = (event) => {
        this.handleServerEvent(JSON.parse(event.data));
      };
      
      // Add microphone audio track
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 24000
        } 
      });
      
      stream.getTracks().forEach(track => {
        this.peerConnection.addTrack(track, stream);
      });
      
      // Handle incoming audio from OpenAI
      this.peerConnection.ontrack = async (event) => {
        console.log('[Realtime] Received audio track via ontrack event');
        this.setupAudioOutput(event.streams[0]);
      };
      
      // Create offer
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);
      
      console.log('[Realtime] SDP Offer:', offer.sdp);
      
      // Send offer to OpenAI
      const response = await fetch(`${OPENAI_REALTIME_URL}?model=gpt-4o-realtime-preview-2024-12-17`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/sdp'
        },
        body: offer.sdp
      });
      
      const answerSdp = await response.text();
      console.log('[Realtime] SDP Answer:', answerSdp);
      
      await this.peerConnection.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp
      });
      
      // Check if we have remote tracks
      const receivers = this.peerConnection.getReceivers();
      console.log('[Realtime] Receivers after setRemoteDescription:', receivers.length);
      
      // Manually trigger ontrack for existing receivers if ontrack didn't fire
      receivers.forEach(receiver => {
        if (receiver.track && receiver.track.kind === 'audio') {
          console.log('[Realtime] Found existing audio track, manually connecting');
          const stream = new MediaStream([receiver.track]);
          this.setupAudioOutput(stream);
        }
      });
      
      console.log('[Realtime] Connected successfully');
      
    } catch (err) {
      console.error('[Realtime] Connection error:', err);
      this.onError(err);
      throw err;
    }
  }

  async setupAudioOutput(stream) {
    try {
      // Create AudioContext if not exists
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Resume if suspended (browser autoplay policy)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        console.log('[Realtime] AudioContext resumed');
      }
      
      // Connect audio stream to speakers
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.audioContext.destination);
      
      console.log('[Realtime] ✅ Audio connected to speakers');
    } catch (err) {
      console.error('[Realtime] Audio setup failed:', err);
      this.onError(err);
    }
  }

  handleServerEvent(event) {
    console.log('[Realtime] Event:', event.type);
    
    // Debug: log full response.done to see what's inside
    if (event.type === 'response.done') {
      console.log('[Realtime] Response.done full event:', JSON.stringify(event, null, 2));
    }
    
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        this.onSpeechStart();
        break;
        
      case 'input_audio_buffer.speech_stopped':
        this.onSpeechEnd();
        break;
        
      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          this.onTranscript({
            role: 'user',
            text: event.transcript
          });
        }
        break;
        
      case 'conversation.item.input_audio_transcription.failed':
        console.error('[Realtime] Transcription failed:', event);
        // Try to show error to user if callback exists
        if (this.onError) {
          this.onError(`Transcription failed: ${event.error?.message || 'Unknown error'}`);
        }
        break;
        
      case 'response.audio.delta':
        console.log('[Realtime] 🔊 Audio delta received, length:', event.delta?.length || 0);
        break;
        
      case 'response.audio.done':
        console.log('[Realtime] 🔊 Audio done');
        break;
        
      case 'response.audio_transcript.delta':
        if (event.delta) {
          this.onTranscript({
            role: 'assistant',
            text: event.delta,
            isDelta: true
          });
        }
        break;
        
      case 'response.audio_transcript.done':
        if (event.transcript) {
          this.onTranscript({
            role: 'assistant',
            text: event.transcript,
            isFinal: true
          });
        }
        break;
        
      case 'error':
        console.error('[Realtime] Server error:', event.error);
        this.onError(event.error);
        break;
    }
  }

  sendEvent(event) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(event));
    } else {
      console.warn('[Realtime] Data channel not ready');
    }
  }

  updateSession(config) {
    this.sendEvent({
      type: 'session.update',
      session: config
    });
  }

  createResponse() {
    this.sendEvent({
      type: 'response.create'
    });
  }

  disconnect() {
    if (this.dataChannel) {
      this.dataChannel.close();
    }
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.connected = false;
    console.log('[Realtime] Disconnected');
  }
}
