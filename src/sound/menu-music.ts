import { AudioPreferences } from './audio-preferences';

const TRACK = '/music/menu-oste.ogg';
const FADE_OUT_SECONDS = 2.5;
const MIX_GAIN = 0.45;

/** One decoded loop across menu routes; never recreated by mission EventBus teardown. */
export class MenuMusic {
  private static instance_: MenuMusic | null = null;
  private ctx_: AudioContext | null = null;
  private gain_: GainNode | null = null;
  private source_: AudioBufferSourceNode | null = null;
  private loading_: Promise<void> | null = null;
  private active_ = false;
  private disposed_ = false;
  private idleTimer_: ReturnType<typeof setTimeout> | null = null;
  private readonly unsubscribe_: () => void;
  private readonly unlock_ = (): void => {
    if (this.active_ && !document.hidden) void this.play_();
  };
  private readonly visibility_ = (): void => {
    if (document.hidden) {
      if (this.ctx_?.state === 'running') void this.ctx_.suspend().catch(() => {});
    } else if (this.active_) {
      void this.play_();
    }
  };

  private constructor() {
    this.unsubscribe_ = AudioPreferences.getInstance().onChange(() => {
      this.applyGain_();
      if (this.active_) void this.play_();
    });
    window.addEventListener('pointerdown', this.unlock_, true);
    window.addEventListener('keydown', this.unlock_, true);
    document.addEventListener('visibilitychange', this.visibility_);
  }

  static getInstance(): MenuMusic {
    MenuMusic.instance_ ??= new MenuMusic();
    return MenuMusic.instance_;
  }

  setActive(active: boolean): void {
    this.active_ = active;
    if (this.idleTimer_) clearTimeout(this.idleTimer_);
    this.idleTimer_ = null;
    if (active) {
      void this.play_();
    } else {
      this.applyGain_();
      // Keep the loop position for return to menus, but release audio processing.
      this.idleTimer_ = setTimeout(
        () => {
          if (!this.active_ && this.ctx_?.state === 'running') void this.ctx_.suspend().catch(() => {});
        },
        FADE_OUT_SECONDS * 1000 + 50
      );
    }
  }

  private async play_(): Promise<void> {
    if (this.disposed_ || !this.active_ || document.hidden || AudioPreferences.getInstance().volume('music') === 0) return;
    if (!this.ctx_) {
      if (typeof window.AudioContext !== 'function') return;
      try {
        this.ctx_ = new window.AudioContext();
        this.gain_ = this.ctx_.createGain();
        this.gain_.gain.value = 0;
        this.gain_.connect(this.ctx_.destination);
      } catch {
        return;
      }
    }
    const ctx = this.ctx_;
    // Called synchronously from pointer/key handlers as well as route changes.
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    this.loading_ ??= this.load_(ctx);
    await this.loading_;
    // Allow a later gesture to retry a failed asset request.
    if (!this.source_) this.loading_ = null;
    if (!this.disposed_) this.applyGain_();
  }

  private async load_(ctx: AudioContext): Promise<void> {
    try {
      const response = await fetch(TRACK);
      if (!response.ok) return;
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      if (this.disposed_ || ctx.state === 'closed') return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.gain_!);
      source.start();
      this.source_ = source;
    } catch {
      // A missing soundtrack must never prevent navigation or mission launch.
    }
  }

  private applyGain_(): void {
    if (!this.ctx_ || !this.gain_ || this.ctx_.state === 'closed') return;
    const gain = this.gain_.gain;
    const now = this.ctx_.currentTime;
    gain.cancelScheduledValues(now);
    if (this.active_) {
      gain.setValueAtTime(MIX_GAIN * AudioPreferences.getInstance().volume('music'), now);
    } else {
      gain.setValueAtTime(gain.value, now);
      gain.linearRampToValueAtTime(0, now + FADE_OUT_SECONDS);
    }
  }

  static destroy(): void {
    const instance = MenuMusic.instance_;
    if (!instance) return;
    instance.disposed_ = true;
    instance.unsubscribe_();
    if (instance.idleTimer_) clearTimeout(instance.idleTimer_);
    window.removeEventListener('pointerdown', instance.unlock_, true);
    window.removeEventListener('keydown', instance.unlock_, true);
    document.removeEventListener('visibilitychange', instance.visibility_);
    instance.source_?.stop();
    void instance.ctx_?.close().catch(() => {});
    MenuMusic.instance_ = null;
  }
}
