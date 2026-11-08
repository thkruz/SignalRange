import { Feedback } from '../../src/feedback/feedback';
import { setMenuPause } from '../../src/game-menu/menu-pause';
import { SimClock } from '../../src/simulation/sim-clock';

const mocks = vi.hoisted(() => ({
  isDev: true,
  devChanged: () => {},
  authChanged: (_event: string, _user: { id: string } | null) => {},
  captureScreen: vi.fn(),
  captureState: vi.fn(),
  submit: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock('@app/dev-menu/dev-menu-service', () => ({
  DevMenuService: {
    getInstance: () => ({
      isDev: () => mocks.isDev,
      onChange: (callback: () => void) => {
        mocks.devChanged = callback;
        return () => {};
      },
    }),
  },
}));
vi.mock('@app/user-account/auth', () => ({
  Auth: {
    getCurrentUser: async () => ({ id: 'developer-a' }),
    onAuthStateChange: (callback: typeof mocks.authChanged) => {
      mocks.authChanged = callback;
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    },
  },
}));
vi.mock('../../src/feedback/feedback-capture', () => ({ captureFeedbackScreen: mocks.captureScreen, captureFeedbackState: mocks.captureState }));
vi.mock('../../src/feedback/feedback-service', () => ({ submitFeedback: mocks.submit }));
vi.mock('@app/sound/sound-manager', () => ({ default: { getInstance: () => ({ setMenuPaused: vi.fn() }) } }));
vi.mock('@app/sound/ambience', () => ({ Ambience: { setMenuPaused: vi.fn() } }));

describe('Feedback', () => {
  let feedback: Feedback;
  const input = () => document.querySelector<HTMLTextAreaElement>('textarea')!;
  const send = () => document.querySelector<HTMLButtonElement>('.qa-feedback-send')!;
  const screenshotToggle = () => document.querySelector<HTMLInputElement>('#qa-feedback-include-screenshot')!;
  const type = (message: string) => {
    input().value = message;
    input().dispatchEvent(new Event('input'));
  };
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    SimClock.reset();
    mocks.isDev = true;
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    mocks.captureScreen.mockResolvedValue('data:image/jpeg;base64,/9j/2Q==');
    mocks.captureState.mockImplementation(() => ({ route: '/campaigns/nats', gameState: { objectiveStates: [] } }));
    mocks.submit.mockResolvedValue(undefined);
    feedback = new Feedback();
  });
  afterEach(() => {
    feedback.dispose();
  });

  it('hides the tab and refuses opening for non-developers', () => {
    mocks.isDev = false;
    mocks.devChanged();
    feedback.open();
    expect(document.querySelector<HTMLButtonElement>('.qa-feedback-tab')!.hidden).toBe(true);
    expect(mocks.captureScreen).not.toHaveBeenCalled();
  });

  it('captures before covering the screen, freezes the game and preserves existing menu pauses', async () => {
    setMenuPause('existing-menu', true);
    mocks.captureScreen.mockImplementation(() => {
      expect(document.querySelector<HTMLDialogElement>('.qa-feedback-dialog')!.open).toBe(false);
      expect(SimClock.consumeFrame(100)).toBe(0);
      return Promise.resolve('data:image/jpeg;base64,/9j/2Q==');
    });
    feedback.open();
    await flush();
    expect(send().disabled).toBe(true);
    type('  ');
    expect(send().disabled).toBe(true);
    type('Menu is clipped');
    expect(send().disabled).toBe(false);
    document.querySelector<HTMLButtonElement>('.qa-feedback-cancel')!.click();
    expect(SimClock.isPaused('menu')).toBe(true);
    setMenuPause('existing-menu', false);
    expect(SimClock.isPaused('menu')).toBe(false);
  });

  it('retains note and original evidence on failure; retry uses the same receipt', async () => {
    mocks.submit.mockRejectedValueOnce(new Error('Please retry'));
    feedback.open();
    await flush();
    type('Menu is clipped');
    send().click();
    await flush();
    expect(input().value).toBe('Menu is clipped');
    expect(input().disabled).toBe(false);
    expect(input().readOnly).toBe(true);
    expect(document.querySelector('[role="status"]')!.textContent).toContain('retry');
    const first = structuredClone(mocks.submit.mock.calls[0][0]);
    send().click();
    await flush();
    expect(mocks.submit.mock.calls[1][0]).toEqual(first);
    expect(mocks.captureScreen).toHaveBeenCalledTimes(1);
    expect(send().disabled).toBe(true);
    expect(document.querySelector<HTMLDialogElement>('.qa-feedback-dialog')!.open).toBe(false);
    expect(document.querySelector('.qa-feedback-notice')!.textContent).toContain('saved');
    expect(SimClock.isPaused('menu')).toBe(false);
  });

  it('blocks duplicates and dismissal while a request is in flight', async () => {
    mocks.submit.mockReturnValue(new Promise(() => {}));
    feedback.open();
    await flush();
    type('Issue');
    send().click();
    send().click();
    document.querySelector<HTMLDialogElement>('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    expect(input().readOnly).toBe(true);
    expect(input().disabled).toBe(false);
    expect(document.querySelector<HTMLDialogElement>('dialog')!.open).toBe(true);
  });

  it('closes on success, preserves the underlying menu pause and clears its confirmation', async () => {
    vi.useFakeTimers();
    try {
      setMenuPause('existing-menu', true);
      feedback.open();
      await flush();
      type('Issue');
      send().click();
      await flush();
      expect(document.querySelector<HTMLDialogElement>('.qa-feedback-dialog')!.open).toBe(false);
      expect(input().value).toBe('');
      expect(SimClock.isPaused('menu')).toBe(true);
      const notice = document.querySelector<HTMLElement>('.qa-feedback-notice')!;
      expect(notice.hidden).toBe(false);
      vi.advanceTimersByTime(4000);
      expect(notice.hidden).toBe(true);
    } finally {
      setMenuPause('existing-menu', false);
      vi.useRealTimers();
    }
  });

  it('automatically excludes and disables a failed screenshot, submitting diagnostics with the note', async () => {
    mocks.captureScreen.mockRejectedValueOnce(new Error('Canvas error'));
    feedback.open();
    await flush();
    type('Issue');
    expect(screenshotToggle().checked).toBe(false);
    expect(screenshotToggle().disabled).toBe(true);
    expect(document.querySelector('[role="status"]')!.textContent).toContain('failure details');
    expect(send().disabled).toBe(false);
    send().click();
    await flush();
    expect(mocks.submit.mock.calls[0][0].screenshot).toBeNull();
    expect(mocks.submit.mock.calls[0][0].snapshot.gameState).toBeDefined();
    expect(mocks.submit.mock.calls[0][0].snapshot.screenshotCapture).toMatchObject({ status: 'failed', stage: 'render', reason: 'render-failed' });
    feedback.open();
    await flush();
    expect(screenshotToggle().checked).toBe(true);
    expect(screenshotToggle().disabled).toBe(false);
  });

  it('ignores an old capture failure after closing and reopening', async () => {
    let fail!: (error: Error) => void;
    mocks.captureScreen.mockReturnValueOnce(
      new Promise<string>((_resolve, reject) => {
        fail = reject;
      })
    );
    feedback.open();
    document.querySelector<HTMLButtonElement>('.qa-feedback-cancel')!.click();
    feedback.open();
    await flush();
    fail(new Error('Old capture failed'));
    await flush();
    expect(screenshotToggle().checked).toBe(true);
    expect(screenshotToggle().disabled).toBe(false);
    type('New draft');
    send().click();
    await flush();
    expect(mocks.submit.mock.calls[0][0].snapshot.screenshotCapture).toBeUndefined();
    expect(mocks.submit.mock.calls[0][0].screenshot).not.toBeNull();
  });

  it('does not mutate an immutable retry when an excluded screenshot fails late', async () => {
    let fail!: (error: Error) => void;
    mocks.captureScreen.mockReturnValueOnce(
      new Promise<string>((_resolve, reject) => {
        fail = reject;
      })
    );
    mocks.submit.mockRejectedValueOnce(new Error('Please retry'));
    feedback.open();
    screenshotToggle().click();
    type('Audio issue');
    send().click();
    await flush();
    const original = structuredClone(mocks.submit.mock.calls[0][0]);
    fail(new Error('Late failure'));
    await flush();
    send().click();
    await flush();
    expect(mocks.submit.mock.calls[1][0]).toEqual(original);
  });

  it('can exclude and restore the original capture before sending', async () => {
    feedback.open();
    await flush();
    expect(screenshotToggle().checked).toBe(true);
    screenshotToggle().click();
    expect(document.querySelector<HTMLImageElement>('img')!.hidden).toBe(true);
    expect(document.querySelector<HTMLImageElement>('img')!.getAttribute('src')).toBeNull();
    screenshotToggle().click();
    expect(document.querySelector<HTMLImageElement>('img')!.hidden).toBe(false);
    type('Visible issue');
    send().click();
    await flush();
    expect(mocks.submit.mock.calls[0][0].screenshot).toBe('data:image/jpeg;base64,/9j/2Q==');
    expect(mocks.captureScreen).toHaveBeenCalledTimes(1);
  });

  it('sends without waiting for an excluded image, and a late capture cannot change a retry', async () => {
    let complete!: (value: string) => void;
    mocks.captureScreen.mockReturnValue(
      new Promise<string>((resolve) => {
        complete = resolve;
      })
    );
    mocks.submit.mockRejectedValueOnce(new Error('Please retry'));
    feedback.open();
    type('Audio observation');
    screenshotToggle().click();
    send().click();
    await flush();
    expect(screenshotToggle().disabled).toBe(true);
    const first = structuredClone(mocks.submit.mock.calls[0][0]);
    complete('data:image/jpeg;base64,/9j/2Q==');
    await flush();
    expect(document.querySelector<HTMLImageElement>('img')!.hidden).toBe(true);
    send().click();
    await flush();
    expect(mocks.submit.mock.calls[1][0]).toEqual(first);
    expect(first.screenshot).toBeNull();
  });

  it('moves the tab into a native modal so it stays interactive', async () => {
    const menu = document.createElement('dialog');
    document.body.append(menu);
    menu.showModal();
    await flush();
    expect(menu.querySelector('.qa-feedback-tab')).not.toBeNull();
    menu.querySelector<HTMLButtonElement>('.qa-feedback-tab')!.disabled = true;
    menu.close();
    await flush();
    expect(document.querySelector('.qa-feedback-tab')!.parentElement).toBe(document.body);
    expect(document.querySelector<HTMLButtonElement>('.qa-feedback-tab')!.disabled).toBe(false);
  });

  it('clears the draft and releases only its own pause on account change', async () => {
    await flush();
    feedback.open();
    await flush();
    type('Private observation');
    mocks.authChanged('SIGNED_OUT', null);
    expect(document.querySelector<HTMLDialogElement>('.qa-feedback-dialog')!.open).toBe(false);
    expect(input().value).toBe('');
    expect(SimClock.isPaused('menu')).toBe(false);
  });

  it('ignores a late screenshot after closing', async () => {
    let complete!: (value: string) => void;
    mocks.captureScreen.mockReturnValue(
      new Promise<string>((resolve) => {
        complete = resolve;
      })
    );
    feedback.open();
    document.querySelector<HTMLButtonElement>('.qa-feedback-cancel')!.click();
    complete('data:image/jpeg;base64,/9j/2Q==');
    await flush();
    expect(document.querySelector<HTMLImageElement>('.qa-feedback-preview')!.hidden).toBe(true);
    expect(SimClock.isPaused('menu')).toBe(false);
  });
});
