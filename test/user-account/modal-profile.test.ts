import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  progress: vi.fn(),
  authChanged: vi.fn(),
  signOut: vi.fn(),
  confirm: vi.fn(),
  deleteAll: vi.fn(),
}));
vi.mock('@app/engine/ui/draggable-modal', () => ({
  DraggableModal: class {
    protected boxEl: HTMLElement | null = null;
    protected getModalContentHtml(): string {
      return '';
    }
    protected onOpen(): void {}
    open(): void {
      if (!this.boxEl) {
        this.boxEl = document.createElement('div');
        this.boxEl.id = 'modal-profile-container';
        this.boxEl.innerHTML = `<div id="modal-profile"><span id="modal-profile-close"></span>${this.getModalContentHtml()}</div>`;
        document.body.append(this.boxEl);
        this.onOpen();
      }
      this.boxEl.style.display = 'block';
    }
    close(): void {
      if (this.boxEl) this.boxEl.style.display = 'none';
    }
  },
}));
vi.mock('@app/engine/ui/modal-confirm', () => ({ ModalConfirm: { getInstance: () => ({ open: mocks.confirm }) } }));
vi.mock('@app/engine/utils/errorManager', () => ({ errorManagerInstance: { error: vi.fn() } }));
vi.mock('@app/sync/storage', () => ({ syncManager: { clearStorage: vi.fn() } }));
vi.mock('@app/user-account/auth', () => ({ Auth: { initializeAuth: mocks.session, onAuthStateChange: mocks.authChanged, signOut: mocks.signOut } }));
vi.mock('@app/user-account/selection-progress-cache', () => ({ selectionProgressCache: { getProgress: mocks.progress } }));
vi.mock('@app/user-account/user-data-service', () => ({ getUserDataService: () => ({ deleteAllProgress: mocks.deleteAll }) }));
vi.mock('@app/campaigns/campaign-manager', () => ({
  CampaignManager: {
    getInstance: () => ({
      getAllCampaigns: () => [
        {
          id: 'sample',
          title: 'Sample campaign',
          scenarios: [{ id: 'sample-1', number: 1, title: 'First mission', missionType: 'Operations' }],
        },
      ],
    }),
  },
}));

import { ModalProfile } from '../../src/user-account/modal-profile';

const user = { id: 'player-a', email: 'operator@example.test', created_at: '2025-02-01T12:00:00Z', user_metadata: { name: 'Test Operator' } };
const progress = {
  summary: { totalScore: 1500, completedScenarioCount: 1 },
  scenarios: [
    {
      scenarioId: 'sample-1',
      completedAt: '2026-01-02T12:00:00Z',
      lastPlayed: '2026-01-02T12:00:00Z',
      score: 1500,
      quizPenalties: 0,
      timePenalties: 0,
    },
  ],
};
const el = (id: string): HTMLElement => document.getElementById(id)!;
const ready = async (): Promise<void> => {
  await vi.waitFor(() => expect(el('profile-panels').hidden).toBe(false));
};

describe('operator profile', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    document.body.innerHTML = '<button id="opener">Profile</button>';
    (ModalProfile as unknown as { instance_: null }).instance_ = null;
    mocks.session.mockResolvedValue(user);
    mocks.progress.mockResolvedValue(progress);
    mocks.signOut.mockResolvedValue({ error: null });
  });

  it('loads cached progress into the service record and real achievements', async () => {
    ModalProfile.getInstance().open();
    await ready();
    expect(el('profile-score').textContent).toBe('1,500');
    expect(el('profile-name').textContent).toBe('Test Operator');
    expect(el('profile-panel-record').textContent).toContain('1 of 1 missions completed');
    expect(el('profile-earned').textContent).toBe('3 / 8');
    expect(el('profile-achievements').textContent).not.toContain('Coming Soon');
    expect(mocks.progress).toHaveBeenCalledTimes(1);
    expect(mocks.session).toHaveBeenCalledTimes(1);
  });

  it('keeps old values hidden during refresh and refreshes on reopening', async () => {
    const modal = ModalProfile.getInstance();
    modal.open();
    await ready();
    modal.close();
    let resolve!: (value: typeof progress) => void;
    mocks.progress.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    modal.open();
    expect(el('profile-panels').hidden).toBe(true);
    expect(el('profile-score').textContent).toBe('—');
    resolve({ ...progress, summary: { totalScore: 2000, completedScenarioCount: 1 } });
    await ready();
    expect(el('profile-score').textContent).toBe('2,000');
  });

  it('shows a retry after a failed download without presenting zero achievements', async () => {
    mocks.progress.mockRejectedValueOnce(new Error('Offline'));
    ModalProfile.getInstance().open();
    await vi.waitFor(() => expect(el('profile-retry').hidden).toBe(false));
    expect(el('profile-panels').hidden).toBe(true);
    expect(el('profile-earned').textContent).toBe('—');
    el('profile-retry').click();
    await ready();
    expect(el('profile-earned').textContent).toBe('3 / 8');
  });

  it('supports keyboard tabs, achievement filters, Escape, and focus return', async () => {
    el('opener').focus();
    ModalProfile.getInstance().open();
    await ready();
    el('profile-tab-record').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(el('profile-tab-achievements'));
    expect(el('profile-panel-record').hidden).toBe(true);
    expect(el('profile-tab-achievements').getAttribute('aria-selected')).toBe('true');
    document.querySelector<HTMLButtonElement>('[data-achievement-filter="locked"]')!.click();
    expect(el('profile-achievements').querySelectorAll('.profile-award--earned')).toHaveLength(0);
    el('profile-tab-achievements').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(el('modal-profile-container').style.display).toBe('none');
    expect(document.activeElement).toBe(el('opener'));
  });

  it('does not render a late response after logout or an account switch', async () => {
    let resolve!: (value: typeof progress) => void;
    mocks.progress.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    ModalProfile.getInstance().open();
    mocks.authChanged.mock.calls[0][0]('SIGNED_OUT', null);
    resolve(progress);
    await Promise.resolve();
    await Promise.resolve();
    expect(el('modal-profile-container').style.display).toBe('none');
    expect(el('profile-name').textContent).not.toBe('Test Operator');
  });

  it('renders account metadata as text rather than HTML', async () => {
    mocks.session.mockResolvedValue({ ...user, user_metadata: { name: '<img src=x onerror=alert(1)>' } });
    ModalProfile.getInstance().open();
    await ready();
    expect(el('profile-name').querySelector('img')).toBeNull();
    expect(el('profile-name').textContent).toContain('<img');
  });

  it('requires the existing destructive confirmation before deleting progress', async () => {
    ModalProfile.getInstance().open();
    await ready();
    el('clear-progress-btn').click();
    expect(mocks.confirm).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isDestructive: true, title: 'Clear All Progress?' }));
    expect(mocks.deleteAll).not.toHaveBeenCalled();
  });

  it('signs out and closes the profile', async () => {
    ModalProfile.getInstance().open();
    await ready();
    el('logout-btn').click();
    await vi.waitFor(() => expect(el('modal-profile-container').style.display).toBe('none'));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });
});
