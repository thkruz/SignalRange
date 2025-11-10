import { qs } from "@app/engine/utils/query-selector";
import { html } from "../engine/utils/development/formatter";
import { BasePage } from "./base-page";

/**
 * Login page implementation
 */
export class LoginPage extends BasePage {
  id = 'login-page';
  private static instance_: LoginPage;

  private constructor() {
    super();
    this.init_('body-content-container', 'add')
  }

  static create(): void {
    if (LoginPage.instance_) {
      throw new Error("LoginPage instance already exists.");
    }

    LoginPage.instance_ = new LoginPage();
  }

  static getInstance(): LoginPage {
    if (!LoginPage.instance_) {
      throw new Error("LoginPage instance does not exist.");
    }

    return this.instance_;
  }

  protected html_ = html`
    <div id="${this.id}" class="login-page">
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

  protected initDom_(parentId: string, type: 'add' | 'replace' = 'replace'): HTMLElement {
    const parentDom = super.initDom_(parentId, type);
    this.dom_ = qs(`#${this.id}`, parentDom);
    this.domCacehe_['login-form'] = qs('#login-form', parentDom);

    return parentDom;
  }

  protected addEventListeners_(): void {
    this.domCacehe_['login-form'].addEventListener('submit', this.handleLogin.bind(this));
  }

  private async handleLogin(event: Event): Promise<void> {
    event.preventDefault();
  }
}