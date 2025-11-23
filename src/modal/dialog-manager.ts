import { html } from '@app/engine/utils/development/formatter';
import { qs } from '@app/engine/utils/query-selector';
import SoundManager from '@app/sound/sound-manager';
import { Character, CharacterAvatars } from './character-enum';
import { DialogHistoryManager } from './dialog-history-manager';
import './dialog-manager.css';

export class DialogManager {
  private static instance: DialogManager;
  private dialogElement: HTMLDivElement | null = null;
  private holdStartTime: number | null = null;
  private animationFrameId: number | null = null;
  currentAudioUrl: string | null = null;
  private isHolding: boolean = false;

  private constructor() { }

  static getInstance(): DialogManager {
    if (!DialogManager.instance) {
      DialogManager.instance = new DialogManager();
    }
    return DialogManager.instance;
  }

  isShowing(): boolean {
    return this.dialogElement !== null;
  }

  show(text: string, character: Character, audioUrl: string, title: string = 'Dialog'): void {
    if (this.dialogElement) {
      this.hide();
    }

    // Track this dialog in history
    DialogHistoryManager.getInstance().addEntry(text, character, audioUrl, title);

    const avatarUrl = CharacterAvatars[character];
    this.currentAudioUrl = audioUrl;

    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    overlay.innerHTML = html`
      <div class="dialog-box">
        <div class="dialog-content">
          <div class="dialog-avatar">
            <img src="${avatarUrl}" alt="${character}" />
          </div>
          <div class="dialog-text-container">
            <div class="dialog-text">${text}</div>
          </div>
        </div>
        <div class="dialog-skip-indicator">
          <div class="dialog-skip-text">Hold to Skip</div>
          <svg class="dialog-skip-progress" viewBox="0 0 36 36">
            <circle class="dialog-skip-progress-bg" cx="18" cy="18" r="16" />
            <circle class="dialog-skip-progress-fill" cx="18" cy="18" r="16" />
          </svg>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    this.dialogElement = overlay;

    // Start with hidden state for fade-in
    requestAnimationFrame(() => {
      overlay.classList.add('dialog-visible');
    });

    // Play audio
    SoundManager.getInstance().playCustom(audioUrl);

    // Add event listeners for hold-to-skip
    this.attachHoldToSkipListeners();

    // Focus for accessibility
    overlay.focus();
  }

  private attachHoldToSkipListeners(): void {
    if (!this.dialogElement) return;

    const overlay = this.dialogElement;
    const skipIndicator = qs('.dialog-skip-indicator', overlay as unknown as HTMLElement);

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      this.startHoldTimer();
      skipIndicator.classList.add('dialog-skip-visible');
    };

    const handleMouseUp = () => {
      this.cancelHoldTimer();
      skipIndicator.classList.remove('dialog-skip-visible');
    };

    const handleMouseLeave = () => {
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
    const holdDuration = isAudioPlaying ? 2000 : 250; // 2 seconds while playing, 250ms when finished

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

  hide(): void {
    if (!this.dialogElement) return;

    // Stop audio
    SoundManager.getInstance().stopCustom();
    this.currentAudioUrl = null;

    // Cancel any ongoing hold timer
    this.cancelHoldTimer();

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
    }, 300); // Match CSS transition duration
  }
}
