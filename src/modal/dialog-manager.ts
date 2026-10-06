import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { CountdownHold } from '@app/objectives/countdown-hold';
import SoundManager from '@app/sound/sound-manager';
import { Character, CharacterCompany, CharacterNames, CharacterTitles, Emotion, getCharacterAvatarUrl } from './character-enum';
import { DialogHistoryManager } from './dialog-history-manager';
import './dialog-manager.css';

/**
 * Strip HTML tags from text for TTS fallback
 */
function stripHtmlTags(htmlContent: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = htmlContent;
  return temp.textContent || temp.innerText || '';
}

interface QueuedDialog {
  text: string;
  character: Character;
  audioUrl: string;
  title: string;
  emotion?: Emotion;
}

declare global {
  interface Window {
    AUTO_CLOSE_DIALOGS?: boolean;
  }
}

export class DialogManager {
  /**
   * How long a new dialog ignores click/Space/Enter, ms. Dialogs open at
   * objective boundaries while the operator is mid-click on a panel; without
   * the guard that click would dismiss a line nobody read. Covers the 300 ms
   * fade-in plus a beat.
   */
  static readonly REVEAL_DELAY_MS = 600;

  private static instance: DialogManager;
  private dialogElement: HTMLDivElement | null = null;
  private holdStartTime: number | null = null;
  private animationFrameId: number | null = null;
  currentAudioUrl: string | null = null;
  private isHolding: boolean = false;
  private dialogQueue_: QueuedDialog[] = [];
  private isTtsActive_ = false;
  /** True once the dialog has been on screen for REVEAL_DELAY_MS; click/keys close it from then on */
  private isRevealed_ = false;
  /** A press began on the overlay, so its release may count as a click */
  private isPressed_ = false;
  private revealTimeoutId_: number | null = null;
  private readonly boundKeydown_ = this.handleKeydown_.bind(this);

  private constructor() {}

  static getInstance(): DialogManager {
    if (!DialogManager.instance) {
      DialogManager.instance = new DialogManager();
    }
    return DialogManager.instance;
  }

  isShowing(): boolean {
    return this.dialogElement !== null;
  }

  show(text: string, character: Character, audioUrl: string, title: string = 'Dialog', emotion?: Emotion): void {
    // If a dialog is currently showing, queue this one
    if (this.dialogElement) {
      this.dialogQueue_.push({ text, character, audioUrl, title, emotion });
      return;
    }

    // Objective countdowns stop while a dialog is on screen (released when the queue drains)
    CountdownHold.set('dialog', true);

    // Track this dialog in history
    DialogHistoryManager.getInstance().addEntry(text, character, audioUrl, title, emotion);

    const avatarUrl = getCharacterAvatarUrl(character, emotion);
    const characterName = CharacterNames[character];
    const characterTitle = CharacterTitles[character];
    const characterCompany = CharacterCompany[character];
    this.currentAudioUrl = audioUrl;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = html`
      <div class="dialog-box">
        <div class="dialog-content">
          <div class="dialog-avatar-container col-4">
            <div class="dialog-avatar">
              <img src="${avatarUrl}" alt="${character}" onerror="this.onerror=null; this.src='/images/placeholder-avatar.png';" />
            </div>
            <div class="dialog-character-info">
              <div class="dialog-character-name">${characterName}</div>
              <div class="dialog-character-title">${characterTitle}</div>
              <div class="dialog-character-company">${characterCompany}</div>
              <div class="dialog-tts-indicator" style="display: none;">
                <span class="dialog-tts-badge">TTS</span>
              </div>
            </div>
          </div>
          <div class="dialog-text-container col-8">
            <div class="dialog-text">${text}</div>
            <div class="dialog-continue-hint">Click or press Space to continue</div>
          </div>
          <div class="dialog-skip-indicator">
            <div class="dialog-skip-text">Hold to Skip</div>
            <svg class="dialog-skip-progress" viewBox="0 0 36 36">
              <circle class="dialog-skip-progress-bg" cx="18" cy="18" r="16" />
              <circle class="dialog-skip-progress-fill" cx="18" cy="18" r="16" />
            </svg>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.dialogElement = overlay;

    // Start with hidden state for fade-in
    requestAnimationFrame(() => {
      overlay.classList.add('dialog-visible');
    });

    // Play audio with TTS fallback
    const plainText = stripHtmlTags(text);
    SoundManager.getInstance().playCustom(audioUrl, plainText, (isTts) => {
      this.isTtsActive_ = isTts;
      this.updateTtsIndicator_();
    });

    // Debug: auto-close dialogs for faster testing
    if (window.AUTO_CLOSE_DIALOGS) {
      this.hide();
      return;
    }

    // Add event listeners for hold-to-skip
    this.attachHoldToSkipListeners();

    // Click, Space or Enter close the dialog once it has been on screen briefly
    this.isRevealed_ = false;
    this.isPressed_ = false;
    this.revealTimeoutId_ = window.setTimeout(() => {
      this.revealTimeoutId_ = null;
      this.isRevealed_ = true;
      overlay.classList.add('dialog-revealed');
    }, DialogManager.REVEAL_DELAY_MS);
    // Capture phase so a focused panel input can't swallow the key first
    document.addEventListener('keydown', this.boundKeydown_, true);

    // Focus for accessibility
    overlay.tabIndex = -1;
    overlay.focus();
  }

  private handleKeydown_(e: KeyboardEvent): void {
    if (!this.dialogElement || !this.isRevealed_) return;
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    this.hide();
  }

  private attachHoldToSkipListeners(): void {
    if (!this.dialogElement) return;

    const overlay = this.dialogElement;
    const skipIndicator = qs('.dialog-skip-indicator', overlay as unknown as HTMLElement);

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      this.isPressed_ = true;
      this.startHoldTimer();
      skipIndicator.classList.add('dialog-skip-visible');
    };

    const handleMouseUp = () => {
      const wasPressed = this.isPressed_;
      this.isPressed_ = false;
      this.cancelHoldTimer();
      skipIndicator.classList.remove('dialog-skip-visible');
      // A release that didn't finish the hold is a click: close once revealed
      if (wasPressed && this.isRevealed_) {
        this.hide();
      }
    };

    const handleMouseLeave = () => {
      this.isPressed_ = false;
      this.cancelHoldTimer();
      skipIndicator.classList.remove('dialog-skip-visible');
    };

    overlay.addEventListener('mousedown', handleMouseDown);
    overlay.addEventListener('mouseup', handleMouseUp);
    overlay.addEventListener('mouseleave', handleMouseLeave);

    // Store references for cleanup
    (overlay as any)._holdListeners = {
      mousedown: handleMouseDown,
      mouseup: handleMouseUp,
      mouseleave: handleMouseLeave,
    };
  }

  private startHoldTimer(): void {
    this.isHolding = true;
    this.holdStartTime = Date.now();

    // Use shorter duration if audio has finished to avoid accidental clicks
    const isAudioPlaying = SoundManager.getInstance().isCustomAudioPlaying();
    const holdDuration = isAudioPlaying ? 1500 : 250; // 1.5 seconds while playing, 250ms when finished

    const updateProgress = () => {
      if (!this.isHolding || !this.holdStartTime) return;

      const elapsed = Date.now() - this.holdStartTime;
      const progress = Math.min(elapsed / holdDuration, 1);

      // Update circular progress indicator
      if (this.dialogElement) {
        const progressFill: SVGCircleElement = this.dialogElement.querySelector('.dialog-skip-progress-fill');
        if (progressFill) {
          const circumference = 2 * Math.PI * 16; // r=16
          const offset = circumference * (1 - progress);
          progressFill.style.strokeDashoffset = offset.toString();
        }
      }

      if (progress >= 1) {
        // Hold completed - close dialog
        this.hide();
      } else {
        this.animationFrameId = requestAnimationFrame(updateProgress);
      }
    };

    this.animationFrameId = requestAnimationFrame(updateProgress);
  }

  private cancelHoldTimer(): void {
    this.isHolding = false;
    this.holdStartTime = null;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Reset progress indicator
    if (this.dialogElement) {
      const progressFill: SVGCircleElement = this.dialogElement.querySelector('.dialog-skip-progress-fill');
      if (progressFill) {
        const circumference = 2 * Math.PI * 16;
        progressFill.style.strokeDashoffset = circumference.toString();
      }
    }
  }

  private updateTtsIndicator_(): void {
    if (!this.dialogElement) return;
    const indicator = this.dialogElement.querySelector<HTMLElement>('.dialog-tts-indicator');
    if (indicator) {
      indicator.style.display = this.isTtsActive_ ? 'block' : 'none';
    }
  }

  hide(): void {
    if (!this.dialogElement) return;

    // Stop audio
    SoundManager.getInstance().stopCustom();
    this.currentAudioUrl = null;
    this.isTtsActive_ = false;

    // Cancel any ongoing hold timer
    this.cancelHoldTimer();

    // Stop listening for click-to-continue
    document.removeEventListener('keydown', this.boundKeydown_, true);
    if (this.revealTimeoutId_ !== null) {
      clearTimeout(this.revealTimeoutId_);
      this.revealTimeoutId_ = null;
    }
    this.isRevealed_ = false;
    this.isPressed_ = false;

    // Remove event listeners
    const overlay = this.dialogElement;
    const listeners = (overlay as any)._holdListeners;
    if (listeners) {
      overlay.removeEventListener('mousedown', listeners.mousedown);
      overlay.removeEventListener('mouseup', listeners.mouseup);
      overlay.removeEventListener('mouseleave', listeners.mouseleave);
    }

    // Fade out
    overlay.classList.remove('dialog-visible');

    // Remove element after fade out animation
    setTimeout(() => {
      if (overlay.parentElement) {
        overlay.remove();
      }
      if (this.dialogElement === overlay) {
        this.dialogElement = null;
      }

      // Emit dismissed event
      EventBus.getInstance().emit(Events.DIALOG_DISMISSED);

      // Keep holding through the gap before a queued dialog
      if (this.dialogQueue_.length === 0) {
        CountdownHold.set('dialog', false);
      }

      // Process next queued dialog
      this.processQueue_();
    }, 300); // Match CSS transition duration
  }

  private processQueue_(): void {
    const next = this.dialogQueue_.shift();
    if (!next) return;

    // Small delay to let fade-out complete visually
    setTimeout(() => {
      this.show(next.text, next.character, next.audioUrl, next.title, next.emotion);
    }, 50);
  }

  clearQueue(): void {
    this.dialogQueue_ = [];
    if (!this.dialogElement) {
      CountdownHold.set('dialog', false);
    }
  }
}
