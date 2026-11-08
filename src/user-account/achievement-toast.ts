import { selectionText } from '@app/pages/selection-browser';
import type { AchievementProgress } from './achievement-catalog';
import { achievementBadge } from './profile-record';
import './achievement-toast.css';

type ToastAchievement = Pick<AchievementProgress, 'id' | 'title' | 'description' | 'category'>;
export type AchievementToastStyle = 'compact' | 'card';

/** One notification at a time, independent of mission/modal lifecycles. */
export class AchievementToast {
  static readonly STYLE_STORAGE_KEY = '__SR_ACHIEVEMENT_STYLE__';
  private style_: AchievementToastStyle = this.readStyle_();
  private queue_: ToastAchievement[] = [];
  private current_: HTMLDivElement | null = null;
  private region_: HTMLDivElement | null = null;
  private timer_: ReturnType<typeof setTimeout> | null = null;
  private exiting_ = false;

  get style(): AchievementToastStyle {
    return this.style_;
  }

  setStyle(style: AchievementToastStyle): void {
    this.style_ = style;
    try {
      localStorage.setItem(AchievementToast.STYLE_STORAGE_KEY, style);
    } catch {
      /* Session-only when storage is blocked. */
    }
  }

  private readStyle_(): AchievementToastStyle {
    try {
      return localStorage.getItem(AchievementToast.STYLE_STORAGE_KEY) === 'card' ? 'card' : 'compact';
    } catch {
      return 'compact';
    }
  }

  show(achievement: ToastAchievement): void {
    this.queue_.push(achievement);
    if (!this.current_) this.next_();
  }

  showTest(achievement: ToastAchievement = { id: 'dev-preview', title: 'First shift', description: 'Complete your first mission.', category: 'Service' }): void {
    this.clear();
    this.show(achievement);
  }

  clear(): void {
    if (this.timer_) clearTimeout(this.timer_);
    this.timer_ = null;
    this.queue_ = [];
    this.current_?.remove();
    this.current_ = null;
    this.exiting_ = false;
    this.region_?.remove();
    this.region_ = null;
  }

  private next_(): void {
    const achievement = this.queue_.shift();
    if (!achievement) return;
    if (!this.region_?.isConnected) {
      this.region_ = document.createElement('div');
      this.region_.className = 'achievement-notifications';
      this.region_.setAttribute('role', 'status');
      this.region_.setAttribute('aria-live', 'polite');
      this.region_.setAttribute('aria-atomic', 'true');
      document.body.append(this.region_);
    }
    const toast = document.createElement('div');
    this.region_.dataset.style = this.style_;
    toast.className = 'achievement-toast';
    toast.dataset.style = this.style_;
    toast.title = `${achievement.title} — ${achievement.description}`;
    toast.dataset.achievementId = achievement.id;
    toast.innerHTML = `<div class="achievement-toast__badge">${achievementBadge(achievement)}</div>
      <div class="achievement-toast__copy"><span class="achievement-toast__label">Achievement unlocked</span>
        <strong>${selectionText(achievement.title)}</strong><p>${selectionText(achievement.description)}</p></div>
      <button type="button" class="achievement-toast__dismiss" aria-label="Dismiss achievement">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 4 8 8m-8 0 8-8" /></svg>
      </button>`;
    toast.querySelector('button')!.onclick = () => this.dismiss_();
    this.current_ = toast;
    this.region_.append(toast);
    this.timer_ = setTimeout(() => this.dismiss_(), 6000);
  }

  private dismiss_(): void {
    if (!this.current_ || this.exiting_) return;
    if (this.timer_) clearTimeout(this.timer_);
    this.exiting_ = true;
    this.current_.classList.add('achievement-toast--leaving');
    this.timer_ = setTimeout(() => {
      this.current_?.remove();
      this.current_ = null;
      this.exiting_ = false;
      this.timer_ = null;
      this.next_();
    }, 320);
  }
}

export const achievementToast = new AchievementToast();
