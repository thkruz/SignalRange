import { Auth } from '@app/user-account/auth';

/**
 * Service that manages developer menu access based on user whitelist.
 * Checks if current user ID is in the PUBLIC_DEV_USER_IDS environment variable.
 */
export class DevMenuService {
  private static instance_: DevMenuService;
  private isDev_: boolean = false;
  private onChangeCallbacks_: Array<(isDev: boolean) => void> = [];

  private constructor() {
    // Initial check
    Auth.getCurrentUser().then((user) => {
      this.checkWhitelist_(user?.id ?? null);
    });

    // Listen for auth changes
    Auth.onAuthStateChange((_event, user) => {
      this.checkWhitelist_(user?.id ?? null);
    });
  }

  static getInstance(): DevMenuService {
    DevMenuService.instance_ ??= new DevMenuService();

    return DevMenuService.instance_;
  }

  /**
   * Returns true if the current user is a developer (on the whitelist).
   */
  isDev(): boolean {
    return this.isDev_;
  }

  /**
   * Register a callback to be notified when dev status changes.
   */
  onChange(callback: (isDev: boolean) => void): void {
    this.onChangeCallbacks_.push(callback);
  }

  private checkWhitelist_(userId: string | null): void {
    const previousState = this.isDev_;

    if (!userId) {
      this.isDev_ = false;
    } else {
      const whitelistedIds = (process.env.PUBLIC_DEV_USER_IDS || '')
        .split(',')
        .map((id) => id.trim())
        .filter((id) => id.length > 0);
      this.isDev_ = whitelistedIds.includes(userId);
    }

    // Notify listeners if state changed
    if (previousState !== this.isDev_) {
      for (const callback of this.onChangeCallbacks_) {
        callback(this.isDev_);
      }
    }
  }
}
