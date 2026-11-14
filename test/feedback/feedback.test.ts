import { Feedback } from '../../src/feedback/feedback';
import { FeedbackSubmitError } from '../../src/feedback/feedback-service';
import { setMenuPause } from '../../src/game-menu/menu-pause';
import { SimClock } from '../../src/simulation/sim-clock';

const mocks = vi.hoisted(() => ({
  isDev: false,
  devChanged: () => {},
  authChanged: (_event: string, _user: { id: string; is_anonymous?: boolean } | null) => {},
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
    getCurrentUser: async () => null,
    getValidAccessToken: async () => 'jwt',
    onAuthStateChange: (callback: typeof mocks.authChanged) => {
      mocks.authChanged = callback;
      return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
    },
  },
}));
vi.mock('@app/user-account/supabase-client', () => ({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_ANON_KEY: 'anon' }));
vi.mock('../../src/feedback/feedback-capture', () => ({ captureFeedbackScreen: mocks.captureScreen, captureFeedbackState: mocks.captureState }));
vi.mock('../../src/feedback/feedback-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/feedback/feedback-service')>()),
  submitFeedback: mocks.submit,
}));
vi.mock('@app/sound/sound-manager', () => ({ default: { getInstance: () => ({ setMenuPaused: vi.fn() }) } }));
vi.mock('@app/sound/ambience', () => ({ Ambience: { setMenuPaused: vi.fn() } }));

const SHOT = 'data:image/jpeg;base64,/9j/2Q==';
const snapshot = () => ({
  capturedAt: '2026-11-14T10:00:00.000Z',
  version: '1.1.0',
  commit: 'abcdef1',
  route: '/campaigns/nats',
  scenarioId: 'nats-1',
  gameState: {},
});

describe('Feedback field report', () => {
  let feedback: Feedback;
  const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
  const input = () => $<HTMLTextAreaElement>('#fr-message');
  const send = () => $<HTMLButtonElement>('#fr-send');
  const shot = () => $<HTMLInputElement>('#fr-shot');
  const tab = () => $<HTMLButtonElement>('.fr-tab:not(.fr-tab-contact)');
  const contact = () => $<HTMLAnchorElement>('.fr-tab-contact');
  const dialog = () => $<HTMLDialogElement>('.fr-dialog');
  const type = (message: string) => {
    input().value = message;
    input().dispatchEvent(new Event('input'));
  };
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  const signIn = (id = 'player-a', extra: object = {}) => mocks.authChanged('SIGNED_IN', { id, ...extra });

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    SimClock.reset();
    mocks.isDev = false;
    HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    mocks.captureScreen.mockResolvedValue(SHOT);
    mocks.captureState.mockImplementation(snapshot);
    mocks.submit.mockResolvedValue({ duplicate: false });
    feedback = new Feedback({ edgeLive: true });
  });
  afterEach(() => {
    feedback.dispose();
    vi.useRealTimers();
  });

  it('shows a contact link and no form to signed-out players', () => {
    expect(tab().hidden).toBe(true);
    expect(contact().hidden).toBe(false);
    expect(contact().href).toBe('https://signalrange.space/contact-us');
    expect(contact().rel).toContain('noopener');
    feedback.open();
    expect(dialog().open).toBe(false);
    expect(mocks.captureScreen).not.toHaveBeenCalled();
  });

  it('treats an anonymous session as signed out', () => {
    signIn('guest', { is_anonymous: true });
    expect(tab().hidden).toBe(true);
    expect(contact().hidden).toBe(false);
  });

  it('shows the Feedback entry to every signed-in player, not only developers', () => {
    signIn();
    expect(tab().hidden).toBe(false);
    expect(tab().textContent).toBe('Feedback');
    expect(contact().hidden).toBe(true);
  });

  it('shows only the contact link to a signed-in player while the Edge Function is not live', () => {
    feedback.dispose();
    feedback = new Feedback({ edgeLive: false });
    signIn();
    expect(tab().hidden).toBe(true);
    expect(contact().hidden).toBe(false);
    feedback.open();
    expect(dialog().open).toBe(false);
    mocks.isDev = true;
    mocks.devChanged();
    expect(tab().hidden).toBe(false);
    expect(contact().hidden).toBe(true);
  });

  it('steps aside for other dialogs and never moves into them', async () => {
    signIn();
    const other = document.createElement('dialog');
    document.body.append(other);
    other.setAttribute('open', '');
    await flush();
    expect(tab().hidden).toBe(true);
    expect(tab().parentElement).toBe(document.body);
    other.removeAttribute('open');
    await flush();
    expect(tab().hidden).toBe(false);
    expect(tab().parentElement).toBe(document.body);
  });

  it('opens with the screenshot off and no preview, and pauses the game', async () => {
    signIn();
    tab().click();
    await flush();
    expect(dialog().open).toBe(true);
    expect(shot().checked).toBe(false);
    expect($<HTMLImageElement>('#fr-preview').hidden).toBe(true);
    expect($('#fr-manifest').textContent).toContain('nats-1');
    expect($('#fr-manifest').textContent).not.toMatch(/Screenshot/u);
    expect(send().disabled).toBe(true);
  });

  it('shows the preview, consent text and the attachment line when the screenshot is switched on', async () => {
    signIn();
    feedback.open();
    await flush();
    shot().checked = true;
    shot().dispatchEvent(new Event('change'));
    expect($<HTMLImageElement>('#fr-preview').hidden).toBe(false);
    expect($<HTMLImageElement>('#fr-preview').src).toBe(SHOT);
    expect($('#fr-shot-panel').hidden).toBe(false);
    expect($('#fr-manifest').textContent).toMatch(/Screenshot/u);
  });

  it('counts code points and clamps to the player limit', async () => {
    signIn();
    feedback.open();
    type('a😀b');
    expect($('#fr-count').textContent).toContain('3 / 4,000');
    type('😀'.repeat(4100));
    expect(Array.from(input().value)).toHaveLength(4000);
  });

  it('files a report, shows the confirmation and clears the draft', async () => {
    signIn();
    feedback.open();
    await flush();
    $<HTMLInputElement>('input[value="idea"]').click();
    type('Add a dark mode');
    send().click();
    await flush();
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    const request = mocks.submit.mock.calls[0][0];
    expect(request).toMatchObject({ category: 'idea', message: 'Add a dark mode', screenshot: null });
    expect(request.id).toMatch(/^[0-9a-f-]{36}$/u);
    expect($('#fr-filed').hidden).toBe(false);
    expect($('#fr-filed-no').textContent).toBe(request.id.slice(0, 8).toUpperCase());
    expect(input().value).toBe('');
    $<HTMLButtonElement>('#fr-done').click();
    expect(dialog().open).toBe(false);
    feedback.open();
    expect(input().value).toBe('');
    expect($('#fr-filed').hidden).toBe(true);
  });

  it('draws a new report id after a report is filed', async () => {
    signIn();
    feedback.open();
    await flush();
    type('First');
    send().click();
    await flush();
    $<HTMLButtonElement>('#fr-done').click();
    feedback.open();
    await flush();
    type('Second');
    send().click();
    await flush();
    const [first, second] = mocks.submit.mock.calls.map(([r]) => r);
    expect(second.id).not.toBe(first.id);
  });

  it('keeps the draft and reuses the same id when a retry follows a failure', async () => {
    signIn();
    mocks.submit.mockRejectedValueOnce(new FeedbackSubmitError('server', 503)).mockResolvedValueOnce({ duplicate: false });
    feedback.open();
    await flush();
    type('It broke');
    send().click();
    await flush();
    expect($('#fr-status').textContent).toMatch(/draft is kept/iu);
    expect(send().textContent).toBe('Retry filing');
    expect(input().readOnly).toBe(true);
    send().click();
    await flush();
    const [first, second] = mocks.submit.mock.calls.map(([r]) => r);
    expect(second.id).toBe(first.id);
    expect(second).toEqual(first);
    expect($('#fr-filed').hidden).toBe(false);
  });

  it('counts a 429 down from Retry-After before Retry is allowed', async () => {
    vi.useFakeTimers();
    signIn();
    mocks.submit.mockRejectedValueOnce(new FeedbackSubmitError('rate-limited', 429, 3));
    feedback.open();
    await flush();
    type('Wait for it');
    send().click();
    await flush();
    expect(send().disabled).toBe(true);
    expect(send().textContent).toBe('Retry in 3s');
    vi.advanceTimersByTime(3100);
    expect(send().disabled).toBe(false);
    expect(send().textContent).toBe('Retry filing');
  });

  it('waits a full Retry-After of 3600 s, not 60 s', async () => {
    vi.useFakeTimers();
    signIn();
    mocks.submit.mockRejectedValueOnce(new FeedbackSubmitError('rate-limited', 429, 3600));
    feedback.open();
    await flush();
    type('Hourly limit');
    send().click();
    await flush();
    vi.advanceTimersByTime(61_000);
    expect(send().disabled).toBe(true);
    expect(send().textContent).toBe('Retry in 3539s');
  });

  it('keeps the Retry-After wait through Escape and reopen of the same draft', async () => {
    vi.useFakeTimers();
    signIn();
    mocks.submit.mockRejectedValueOnce(new FeedbackSubmitError('rate-limited', 429, 120));
    feedback.open();
    await flush();
    type('Wait for it');
    send().click();
    await flush();
    dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
    feedback.open();
    expect(send().disabled).toBe(true);
    expect(send().textContent).toMatch(/^Retry in \d+s$/u);
    vi.advanceTimersByTime(121_000);
    expect(send().disabled).toBe(false);
  });

  it('unlocks the form with a new id after a 400 so the operator can edit', async () => {
    signIn();
    mocks.submit.mockRejectedValueOnce(new FeedbackSubmitError('invalid', 400, null, ['unknown-scenario']));
    feedback.open();
    await flush();
    type('Something odd');
    send().click();
    await flush();
    expect(input().readOnly).toBe(false);
    expect($('#fr-status').textContent).toMatch(/rejected/iu);
    send().click();
    await flush();
    const [first, second] = mocks.submit.mock.calls.map(([r]) => r);
    expect(second.id).not.toBe(first.id);
    expect(second.snapshot.scenarioId).toBeNull();
  });

  it('puts the form away on Escape, restores focus and keeps the draft', async () => {
    signIn();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    feedback.open();
    type('Half written');
    const cancel = new Event('cancel', { cancelable: true });
    dialog().dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(dialog().open).toBe(false);
    expect(document.activeElement).toBe(opener);
    feedback.open();
    expect(input().value).toBe('Half written');
  });

  it('does not close on Escape while a report is being sent', async () => {
    signIn();
    let finish: (v: { duplicate: boolean }) => void = () => {};
    mocks.submit.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    feedback.open();
    type('Slow link');
    send().click();
    dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog().open).toBe(true);
    finish({ duplicate: false });
    await flush();
    expect($('#fr-filed').hidden).toBe(false);
  });

  it('discards the draft on request and releases the menu pause', async () => {
    signIn();
    feedback.open();
    type('Never mind');
    $<HTMLButtonElement>('#fr-discard').click();
    expect(dialog().open).toBe(false);
    expect(SimClock.isPaused('menu')).toBe(false);
    feedback.open();
    expect(input().value).toBe('');
  });

  it('releases the pause and drops the unsent capture on Escape', async () => {
    signIn();
    feedback.open();
    await flush();
    expect(SimClock.isPaused('menu')).toBe(true);
    shot().checked = true;
    shot().dispatchEvent(new Event('change'));
    expect($<HTMLImageElement>('#fr-preview').getAttribute('src')).toBe(SHOT);
    dialog().dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(SimClock.isPaused('menu')).toBe(false);
    expect($<HTMLImageElement>('#fr-preview').hasAttribute('src')).toBe(false);
  });

  it('runs the same teardown when the dialog is closed natively during a send', async () => {
    signIn();
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    let finish: (v: { duplicate: boolean }) => void = () => {};
    mocks.submit.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    feedback.open();
    type('Slow link');
    send().click();
    expect(SimClock.isPaused('menu')).toBe(true);
    dialog().close();
    dialog().dispatchEvent(new Event('close'));
    expect(SimClock.isPaused('menu')).toBe(false);
    expect(document.activeElement).toBe(opener);
    finish({ duplicate: false });
    await flush();
    expect(SimClock.isPaused('menu')).toBe(false);
  });

  it('does not send a capture that was taken and then toggled off', async () => {
    signIn();
    feedback.open();
    await flush();
    shot().checked = true;
    shot().dispatchEvent(new Event('change'));
    shot().checked = false;
    shot().dispatchEvent(new Event('change'));
    type('No picture please');
    send().click();
    await flush();
    expect(mocks.submit.mock.calls[0][0].screenshot).toBeNull();
  });

  it('drops a draft when another account signs in', async () => {
    signIn('player-a');
    feedback.open();
    type('Mine');
    signIn('player-b');
    expect(dialog().open).toBe(false);
    feedback.open();
    expect(input().value).toBe('');
  });

  it('turns the screenshot off with a visible note when the capture fails', async () => {
    signIn();
    mocks.captureScreen.mockRejectedValue(new Error('boom'));
    feedback.open();
    await flush();
    expect(shot().disabled).toBe(true);
    expect($('#fr-shot-note').hidden).toBe(false);
    expect($('#fr-shot-note').textContent).toMatch(/left off/u);
  });

  it('uses the developer limit and DEV QA label for developers', () => {
    mocks.isDev = true;
    signIn();
    feedback.open();
    expect($('#fr-tier').hidden).toBe(false);
    expect($('#fr-count').textContent).toContain('/ 10,000');
  });

  it('renders user text as text, never markup', async () => {
    signIn();
    feedback.open();
    await flush();
    type('<img src=x onerror=alert(1)>');
    expect(dialog().querySelector('img[src="x"]')).toBeNull();
  });
});
