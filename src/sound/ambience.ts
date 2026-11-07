import { AudioPreferences } from './audio-preferences';

/**
 * Ops-room ambience: a looping room bed (rack fans and HVAC) under every
 * scenario, plus weather heard through the building. Uses Web Audio so the
 * loops are gapless and layers crossfade. Does nothing where Web Audio is
 * missing (jsdom). The browser keeps the context suspended until the first
 * user gesture; the bed starts then.
 */
export type AmbienceLayer = 'room' | 'rain' | 'wind' | 'storm';

const LAYER_FILES: Record<AmbienceLayer, string> = {
  room: '/sfx/room-bed.mp3',
  rain: '/sfx/rain-bed.mp3',
  wind: '/sfx/wind-bed.mp3',
  storm: '/sfx/storm-bed.mp3',
};

/** Full-level gain per layer; a layer's target is this times its intensity (0..1) */
const LAYER_GAIN: Record<AmbienceLayer, number> = {
  room: 0.35,
  rain: 0.5,
  wind: 0.45,
  storm: 0.55,
};

const THUNDER_FILE = '/sfx/thunder-indoor.mp3';
const THUNDER_GAIN = 0.6;
const FADE_S = 2.5;

interface LayerNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class Ambience {
  private static instance_: Ambience | null = null;

  private ctx_: AudioContext | null = null;
  private master_: GainNode | null = null;
  private readonly buffers_ = new Map<string, Promise<AudioBuffer | null>>();
  private readonly layers_ = new Map<AmbienceLayer, LayerNode>();
  private readonly targets_ = new Map<AmbienceLayer, number>();
  private thunderTimer_: ReturnType<typeof setTimeout> | null = null;
  private active_ = false;
  private readonly unsubscribePrefs_: () => void;
  private readonly boundUnlock_: () => void;

  private constructor() {
    this.boundUnlock_ = this.unlock_.bind(this);
    this.unsubscribePrefs_ = AudioPreferences.getInstance().onChange(() => this.applyMaster_());
  }

  static getInstance(): Ambience {
    Ambience.instance_ ??= new Ambience();

    return Ambience.instance_;
  }

  /** Start the room bed for a scenario. */
  start(): void {
    this.active_ = true;
    this.setLayer('room', 1);
    window.addEventListener('pointerdown', this.boundUnlock_, true);
    window.addEventListener('keydown', this.boundUnlock_, true);
  }

  /** Fade everything out and release the nodes (page teardown). */
  stop(): void {
    this.active_ = false;
    this.targets_.clear();
    this.stopThunder_();
    window.removeEventListener('pointerdown', this.boundUnlock_, true);
    window.removeEventListener('keydown', this.boundUnlock_, true);
    for (const layer of [...this.layers_.keys()]) {
      this.fadeOutLayer_(layer, 0.6);
    }
  }

  /** Set a layer's intensity, 0 (off) to 1 (full). */
  setLayer(layer: AmbienceLayer, intensity: number): void {
    const level = Math.max(0, Math.min(1, intensity));
    if (level === 0) {
      this.targets_.delete(layer);
    } else {
      this.targets_.set(layer, level);
    }
    if (layer === 'storm') {
      if (level > 0) {
        this.scheduleThunder_();
      } else {
        this.stopThunder_();
      }
    }
    void this.apply_(layer);
  }

  static destroy(): void {
    const inst = Ambience.instance_;
    if (!inst) {
      return;
    }
    inst.stop();
    inst.unsubscribePrefs_();
    void inst.ctx_?.close().catch(() => undefined);
    Ambience.instance_ = null;
  }

  private context_(): AudioContext | null {
    if (this.ctx_) {
      return this.ctx_;
    }
    const Ctor = typeof window === 'undefined' ? undefined : window.AudioContext;
    if (!Ctor) {
      return null;
    }
    try {
      this.ctx_ = new Ctor();
    } catch {
      return null;
    }
    this.master_ = this.ctx_.createGain();
    this.master_.connect(this.ctx_.destination);
    this.applyMaster_();

    return this.ctx_;
  }

  private unlock_(): void {
    const ctx = this.context_();
    if (ctx?.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
    }
  }

  private applyMaster_(): void {
    if (!this.ctx_ || !this.master_) {
      return;
    }
    const on = AudioPreferences.getInstance().ambienceEnabled ? 1 : 0;
    this.master_.gain.setTargetAtTime(on, this.ctx_.currentTime, 0.4);
  }

  private load_(url: string): Promise<AudioBuffer | null> {
    const ctx = this.context_();
    if (!ctx) {
      return Promise.resolve(null);
    }
    let pending = this.buffers_.get(url);
    if (!pending) {
      pending = fetch(url)
        .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null);
      this.buffers_.set(url, pending);
    }

    return pending;
  }

  private async apply_(layer: AmbienceLayer): Promise<void> {
    const target = this.targets_.get(layer) ?? 0;
    const existing = this.layers_.get(layer);
    const ctx = this.context_();
    if (!ctx || !this.master_) {
      return;
    }

    if (target === 0) {
      if (existing) {
        this.fadeOutLayer_(layer, FADE_S);
      }
      return;
    }
    if (existing) {
      existing.gain.gain.cancelScheduledValues(ctx.currentTime);
      existing.gain.gain.setTargetAtTime(target * LAYER_GAIN[layer], ctx.currentTime, FADE_S / 3);
      return;
    }

    const buffer = await this.load_(LAYER_FILES[layer]);
    // the target may have changed while the file loaded
    const now = this.targets_.get(layer) ?? 0;
    if (!buffer || now === 0 || !this.active_ || this.layers_.has(layer) || !this.master_) {
      return;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(gain).connect(this.master_);
    // start at a random point so repeated scenarios do not all open the same way
    source.start(0, Math.random() * buffer.duration);
    gain.gain.setTargetAtTime(now * LAYER_GAIN[layer], ctx.currentTime, FADE_S / 3);
    this.layers_.set(layer, { source, gain });
  }

  private fadeOutLayer_(layer: AmbienceLayer, seconds: number): void {
    const node = this.layers_.get(layer);
    if (!node || !this.ctx_) {
      return;
    }
    this.layers_.delete(layer);
    const t = this.ctx_.currentTime;
    node.gain.gain.cancelScheduledValues(t);
    node.gain.gain.setTargetAtTime(0, t, seconds / 3);
    try {
      node.source.stop(t + seconds + 0.2);
    } catch {
      // already stopped
    }
  }

  private scheduleThunder_(): void {
    if (this.thunderTimer_ !== null) {
      return;
    }
    const delayMs = 12000 + Math.random() * 28000;
    this.thunderTimer_ = setTimeout(() => {
      this.thunderTimer_ = null;
      if (!this.active_ || !this.targets_.has('storm')) {
        return;
      }
      void this.playThunder_();
      this.scheduleThunder_();
    }, delayMs);
  }

  private stopThunder_(): void {
    if (this.thunderTimer_ !== null) {
      clearTimeout(this.thunderTimer_);
      this.thunderTimer_ = null;
    }
  }

  private async playThunder_(): Promise<void> {
    const ctx = this.context_();
    const buffer = await this.load_(THUNDER_FILE);
    if (!ctx || !buffer || !this.master_ || ctx.state !== 'running') {
      return;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = THUNDER_GAIN * (0.6 + Math.random() * 0.4) * (this.targets_.get('storm') ?? 1);
    source.connect(gain).connect(this.master_);
    source.start();
  }
}
