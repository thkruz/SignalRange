import { TEAMS } from '../constants';
import { Router } from '../router';
import { html, qs } from '../utils';

/**
 * Login Page
 */
export class Login {
  private readonly element: HTMLElement;
  private readonly router: Router;
  readonly elementId: string = 'login';
  private selectedTeam: number = 1;
  private selectedServer: number = 1;
  parentId: string = `${this.elementId}-page`;

  constructor(parentId: string, router: Router) {
    const parent = document.getElementById(parentId);
    if (!parent) throw new Error(`Parent element ${parentId} not found`);

    this.element = parent;
    this.router = router;

  }

  initialize(): void {
    this.render();
    this.addListeners();
  }

  private render(): void {
    this.element.innerHTML = html`
      <div class="login-container">
        <div class="login-box">
          <h1>IRIS</h1>
          <p>Space Electronic Warfare Sandbox</p>

          <div class="login-form">
            <div class="form-group">
              <label for="team-select">Team:</label>
              <select id="team-select">
                ${TEAMS.map(team => html`
                  <option value="${team.id}">${team.name}</option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label for="server-select">Server:</label>
              <select id="server-select">
                <option value="1">Server 1</option>
                <option value="2">Server 2</option>
              </select>
            </div>

            <button id="join-btn" class="btn-primary">Join</button>
          </div>
        </div>
      </div>
    `;
  }

  private addListeners(): void {
    const joinBtn = qs('#join-btn', this.element);
    const teamSelect = qs<HTMLSelectElement>('#team-select', this.element);
    const serverSelect = qs<HTMLSelectElement>('#server-select', this.element);

    if (teamSelect) {
      teamSelect.addEventListener('change', () => {
        this.selectedTeam = parseInt(teamSelect.value);
      });
    }

    if (serverSelect) {
      serverSelect.addEventListener('change', () => {
        this.selectedServer = parseInt(serverSelect.value);
      });
    }

    if (joinBtn) {
      joinBtn.addEventListener('click', () => {
        this.handleJoin();
      });
    }
  }

  private handleJoin(): void {
    // Store user selection (could use localStorage)
    localStorage.setItem('teamId', this.selectedTeam.toString());
    localStorage.setItem('serverId', this.selectedServer.toString());

    // Navigate to student page
    this.router.navigate('/student');
  }
}