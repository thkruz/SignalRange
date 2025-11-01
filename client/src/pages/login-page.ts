import { AbstractPage } from './abstract-page';

/**
 * Login page implementation
 */
export class LoginPage extends AbstractPage {
  private loginForm: HTMLFormElement | null = null;

  constructor() {
    super('login-page');
  }

  initializeDom(): HTMLElement {
    this.container.innerHTML = `
      <div class="login-page">
      <h1>Login</h1>
      <form id="login-form" class="login-form">
        <div class="form-group">
        <label for="username">Username:</label>
        <input type="text" id="username" name="username" required autocomplete="username">
        </div>
        <div class="form-group">
        <label for="password">Password:</label>
        <input type="password" id="password" name="password" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn-primary">Login</button>
      </form>
      </div>
    `;

    this.loginForm = this.container.querySelector('#login-form');

    return this.container;
  }

  protected setupEventListeners(): void {
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', this.handleLogin.bind(this));
    }
  }

  private async handleLogin(event: Event): Promise<void> {
    event.preventDefault();
    this.clearErrors();

    const formData = this.getFormData('#login-form');
    if (!formData) return;

    const username = formData.get('username') as string;
    const password = formData.get('password') as string;

    // Validate
    if (!this.validateRequired(username, 'Username')) return;
    if (!this.validateRequired(password, 'Password')) return;

    try {
      this.showLoading('Logging in...');

      // Simulate API call
      const response = await this.performLogin(username, password);

      this.hideLoading();

      if (response.success) {
        // Navigate to student page
        globalThis.location.href = '/student';
      } else {
        this.showError('Invalid credentials');
      }
    } catch (error) {
      this.hideLoading();
      this.showError('Login failed. Please try again: ' + (error as Error).message);
    }
  }

  private async performLogin(username: string, password: string): Promise<any> {
    // Replace with actual API call
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: username === 'admin' && password === 'password' });
      }, 1000);
    });
  }

  destroy(): void {
    if (this.loginForm) {
      this.loginForm.removeEventListener('submit', this.handleLogin.bind(this));
    }
    super.destroy();
  }
}