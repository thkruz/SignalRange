/**
 * TtsService - Text-to-Speech fallback using Web Speech API
 *
 * Used when audio files fail to load. Provides a singleton interface
 * for speech synthesis with state tracking via events.
 */
class TtsService {
  private static instance: TtsService;
  private isSpeaking_ = false;
  private onSpeechEndCallback_: (() => void) | null = null;
  private preferredVoice_: SpeechSynthesisVoice | null = null;
  private static readonly PREFERRED_VOICE_NAME = 'Rudolph';

  private constructor() {
    // Voices may load asynchronously in some browsers
    if (this.isAvailable()) {
      this.findPreferredVoice_();
      speechSynthesis.addEventListener('voiceschanged', () => {
        this.findPreferredVoice_();
      });
    }
  }

  private findPreferredVoice_(): void {
    const voices = speechSynthesis.getVoices();
    this.preferredVoice_ = voices.find(v => v.name === TtsService.PREFERRED_VOICE_NAME) ?? null;
    if (this.preferredVoice_) {
      console.log(`TTS: Using voice "${this.preferredVoice_.name}"`);
    }
  }

  static getInstance(): TtsService {
    if (!TtsService.instance) {
      TtsService.instance = new TtsService();
    }
    return TtsService.instance;
  }

  /**
   * Check if Web Speech API is available in this browser
   */
  isAvailable(): boolean {
    return 'speechSynthesis' in window;
  }

  /**
   * Speak the provided text
   * @param text Plain text to speak (no HTML)
   * @param onEnd Optional callback when speech ends
   */
  speak(text: string, onEnd?: () => void): void {
    if (!this.isAvailable()) {
      console.warn('Web Speech API not available');
      onEnd?.();
      return;
    }

    // Cancel any ongoing speech
    this.stop();

    const utterance = new SpeechSynthesisUtterance(text);

    // Use preferred voice if available
    if (this.preferredVoice_) {
      utterance.voice = this.preferredVoice_;
    }

    // Configure voice settings
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Event handlers for state tracking
    utterance.onstart = () => {
      this.isSpeaking_ = true;
    };

    utterance.onend = () => {
      this.isSpeaking_ = false;
      this.onSpeechEndCallback_?.();
      this.onSpeechEndCallback_ = null;
    };

    utterance.onerror = (event) => {
      console.error('TTS error:', event.error);
      this.isSpeaking_ = false;
      this.onSpeechEndCallback_?.();
      this.onSpeechEndCallback_ = null;
    };

    this.onSpeechEndCallback_ = onEnd ?? null;

    speechSynthesis.speak(utterance);
  }

  /**
   * Stop current speech
   */
  stop(): void {
    if (this.isAvailable()) {
      speechSynthesis.cancel();
    }
    this.isSpeaking_ = false;
    this.onSpeechEndCallback_ = null;
  }

  /**
   * Check if TTS is currently speaking
   */
  isSpeaking(): boolean {
    return this.isSpeaking_;
  }
}

export default TtsService;
