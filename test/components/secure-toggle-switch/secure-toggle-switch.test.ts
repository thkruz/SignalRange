import { SecureToggleSwitch } from '../../../src/components/secure-toggle-switch/secure-toggle-switch';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import SoundManager from '../../../src/sound/sound-manager';
import { Sfx } from '../../../src/sound/sfx-enum';

jest.mock('../../../src/sound/sound-manager');

describe('SecureToggleSwitch', () => {
  let mockSoundManager: jest.Mocked<SoundManager>;
  let container: HTMLElement;

  beforeEach(() => {
    jest.clearAllMocks();
    EventBus.destroy();

    mockSoundManager = {
      play: jest.fn(),
      stop: jest.fn(),
    } as unknown as jest.Mocked<SoundManager>;
    (SoundManager.getInstance as jest.Mock).mockReturnValue(mockSoundManager);

    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  const mountSwitch = (toggle: SecureToggleSwitch): void => {
    container.innerHTML = toggle.html;
  };

  describe('constructor', () => {
    it('should create instance with isUp=true', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('test-switch', callback, true);
      mountSwitch(toggle);

      expect(toggle.html).toContain('id="test-switch"');
      expect(toggle.html).toContain('checked');
      expect(toggle.html).toContain('secure-toggle-switch');
    });

    it('should create instance with isUp=false', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('off-switch', callback, false);
      mountSwitch(toggle);

      expect(toggle.html).toContain('id="off-switch"');
      expect(toggle.html).not.toContain('checked');
    });

    it('should include light element when isLight=true (default)', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('light-switch', callback, true);
      mountSwitch(toggle);

      expect(toggle.html).toContain('class="light"');
    });

    it('should exclude light element when isLight=false', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('no-light-switch', callback, true, false);
      mountSwitch(toggle);

      expect(toggle.html).not.toContain('class="light"');
    });

    it('should include guard checkbox', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('guard-switch', callback, true);
      mountSwitch(toggle);

      expect(toggle.html).toContain('id="guard-switch-guard"');
      expect(toggle.html).toContain('class="guard"');
    });

    it('should register DOM_READY event listener', () => {
      const eventBus = EventBus.getInstance();
      const onSpy = jest.spyOn(eventBus, 'on');

      const callback = jest.fn();
      new SecureToggleSwitch('event-switch', callback, true);

      expect(onSpy).toHaveBeenCalledWith(Events.DOM_READY, expect.any(Function));
    });
  });

  describe('static create', () => {
    it('should create SecureToggleSwitch instance', () => {
      const callback = jest.fn();
      const toggle = SecureToggleSwitch.create('static-switch', callback, true);
      mountSwitch(toggle);

      expect(toggle).toBeInstanceOf(SecureToggleSwitch);
      expect(toggle.html).toContain('id="static-switch"');
    });

    it('should create with isLight=true by default', () => {
      const callback = jest.fn();
      const toggle = SecureToggleSwitch.create('light-default', callback, false);
      mountSwitch(toggle);

      expect(toggle.html).toContain('class="light"');
    });

    it('should create without light when isLight=false', () => {
      const callback = jest.fn();
      const toggle = SecureToggleSwitch.create('no-light-static', callback, true, false);
      mountSwitch(toggle);

      expect(toggle.html).not.toContain('class="light"');
    });
  });

  describe('html getter', () => {
    it('should return HTML string', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('html-switch', callback, true);

      expect(toggle.html).toContain('secure-toggle-switch-wrapper');
      expect(toggle.html).toContain('secure-toggle-switch');
      expect(toggle.html).toContain('guard');
      expect(toggle.html).toContain('switch');
      expect(toggle.html).toContain('knob');
    });
  });

  describe('dom getter', () => {
    it('should return DOM element', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('dom-switch', callback, true);
      mountSwitch(toggle);

      expect(toggle.dom).toBeInstanceOf(HTMLInputElement);
      expect(toggle.dom.id).toBe('dom-switch');
    });

    it('should cache DOM element', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('cache-switch', callback, true);
      mountSwitch(toggle);

      const dom1 = toggle.dom;
      const dom2 = toggle.dom;

      expect(dom1).toBe(dom2);
    });
  });

  describe('onDomReady_', () => {
    it('should attach change listener to switch', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('ready-switch', callback, true);
      mountSwitch(toggle);

      EventBus.getInstance().emit(Events.DOM_READY);

      // Simulate change event
      const checkbox = document.getElementById('ready-switch') as HTMLInputElement;
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(callback).toHaveBeenCalledWith(false);
    });

    it('should play sound when switch is toggled', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('sound-switch', callback, true);
      mountSwitch(toggle);

      EventBus.getInstance().emit(Events.DOM_READY);

      const checkbox = document.getElementById('sound-switch') as HTMLInputElement;
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(mockSoundManager.play).toHaveBeenCalledWith(Sfx.SWITCH);
    });

    it('should call callback with true when switch turned on', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('on-switch', callback, false);
      mountSwitch(toggle);

      EventBus.getInstance().emit(Events.DOM_READY);

      const checkbox = document.getElementById('on-switch') as HTMLInputElement;
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(callback).toHaveBeenCalledWith(true);
    });
  });

  describe('up', () => {
    it('should set switch to checked state', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('up-switch', callback, false);
      mountSwitch(toggle);

      toggle.up();

      expect(toggle.dom.checked).toBe(true);
    });

    it('should not change if already up', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('already-up', callback, true);
      mountSwitch(toggle);

      toggle.up();

      expect(toggle.dom.checked).toBe(true);
    });
  });

  describe('down', () => {
    it('should set switch to unchecked state', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('down-switch', callback, true);
      mountSwitch(toggle);

      toggle.down();

      expect(toggle.dom.checked).toBe(false);
    });

    it('should not change if already down', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('already-down', callback, false);
      mountSwitch(toggle);

      toggle.down();

      expect(toggle.dom.checked).toBe(false);
    });
  });

  describe('sync', () => {
    it('should set switch up when isUp=true', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('sync-up', callback, false);
      mountSwitch(toggle);

      toggle.sync(true);

      expect(toggle.dom.checked).toBe(true);
    });

    it('should set switch down when isUp=false', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('sync-down', callback, true);
      mountSwitch(toggle);

      toggle.sync(false);

      expect(toggle.dom.checked).toBe(false);
    });

    it('should not trigger callback when syncing', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('sync-no-callback', callback, false);
      mountSwitch(toggle);

      EventBus.getInstance().emit(Events.DOM_READY);

      toggle.sync(true);

      // Callback should not be called by sync - only by user interaction
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('addEventListeners', () => {
    it('should be a no-op method (guard switch)', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('add-events', callback, true);
      mountSwitch(toggle);

      // Method exists but does nothing currently
      expect(() => toggle.addEventListeners(callback)).not.toThrow();
    });
  });

  describe('edge cases', () => {
    it('should handle rapid toggling', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('rapid-toggle', callback, false);
      mountSwitch(toggle);

      toggle.up();
      toggle.down();
      toggle.up();
      toggle.down();

      expect(toggle.dom.checked).toBe(false);
    });

    it('should handle sync after manual toggle', () => {
      const callback = jest.fn();
      const toggle = new SecureToggleSwitch('sync-after-toggle', callback, false);
      mountSwitch(toggle);

      toggle.up();
      expect(toggle.dom.checked).toBe(true);

      toggle.sync(false);
      expect(toggle.dom.checked).toBe(false);
    });
  });
});
