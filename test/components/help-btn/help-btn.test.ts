import { HelpButton } from '../../../src/components/help-btn/help-btn';
import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { ModalManager } from '../../../src/modal/modal-manager';

jest.mock('../../../src/modal/modal-manager');

describe('HelpButton', () => {
  let mockModalManager: jest.Mocked<ModalManager>;
  let container: HTMLElement;

  beforeEach(() => {
    jest.clearAllMocks();
    EventBus.destroy();

    mockModalManager = {
      show: jest.fn(),
      hide: jest.fn(),
      isShowing: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<ModalManager>;
    (ModalManager.getInstance as jest.Mock).mockReturnValue(mockModalManager);

    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    EventBus.destroy();
    document.body.innerHTML = '';
  });

  const mountButton = (button: HelpButton): void => {
    container.innerHTML = button.html;
  };

  describe('constructor', () => {
    it('should create instance with required parameters', () => {
      const button = new HelpButton('help-btn-1', 'Help Title', 'Help content text');
      mountButton(button);

      expect(button.html).toContain('id="help-btn-1"');
      expect(button.html).toContain('help-button-container');
      expect(button.html).toContain('btn-help');
    });

    it('should create instance with optional helpUrl', () => {
      const button = new HelpButton(
        'help-btn-url',
        'Help Title',
        'Content',
        'https://example.com/help'
      );
      mountButton(button);

      expect(button.html).toContain('id="help-btn-url"');
    });

    it('should create help button with question mark icon', () => {
      const button = new HelpButton('icon-btn', 'Title', 'Content');
      mountButton(button);

      expect(button.html).toContain('icon-help');
      expect(button.html).toContain('?');
    });

    it('should set correct title attribute', () => {
      const button = new HelpButton('title-btn', 'Title', 'Content');
      mountButton(button);

      expect(button.html).toContain('title="Open Help Documentation"');
    });

    it('should set data-action attribute', () => {
      const button = new HelpButton('action-btn', 'Title', 'Content');
      mountButton(button);

      expect(button.html).toContain('data-action="open-help"');
    });

    it('should register DOM_READY event listener', () => {
      const eventBus = EventBus.getInstance();
      const onSpy = jest.spyOn(eventBus, 'on');

      new HelpButton('event-btn', 'Title', 'Content');

      expect(onSpy).toHaveBeenCalledWith(Events.DOM_READY, expect.any(Function));
    });
  });

  describe('static create', () => {
    it('should create HelpButton instance', () => {
      const button = HelpButton.create('static-btn', 'Static Title', 'Static Content');
      mountButton(button);

      expect(button).toBeInstanceOf(HelpButton);
      expect(button.html).toContain('id="static-btn"');
    });

    it('should create with optional helpUrl', () => {
      const button = HelpButton.create(
        'static-url-btn',
        'Title',
        'Content',
        'https://example.com'
      );
      mountButton(button);

      expect(button).toBeInstanceOf(HelpButton);
    });

    it('should create without helpUrl when null', () => {
      const button = HelpButton.create('null-url-btn', 'Title', 'Content', null);
      mountButton(button);

      expect(button).toBeInstanceOf(HelpButton);
    });
  });

  describe('html getter', () => {
    it('should return HTML string', () => {
      const button = new HelpButton('html-btn', 'Title', 'Content');

      expect(button.html).toContain('help-button-container');
      expect(button.html).toContain('btn-help');
      expect(button.html).toContain('icon-help');
    });
  });

  describe('dom getter', () => {
    it('should return DOM element', () => {
      const button = new HelpButton('dom-btn', 'Title', 'Content');
      mountButton(button);

      expect(button.dom).toBeInstanceOf(HTMLElement);
      expect(button.dom.id).toBe('dom-btn');
    });

    it('should cache DOM element', () => {
      const button = new HelpButton('cache-btn', 'Title', 'Content');
      mountButton(button);

      const dom1 = button.dom;
      const dom2 = button.dom;

      expect(dom1).toBe(dom2);
    });
  });

  describe('onDomReady', () => {
    it('should attach click listener to button', () => {
      const button = new HelpButton('ready-btn', 'Title', 'Content');
      mountButton(button);

      EventBus.getInstance().emit(Events.DOM_READY);

      const btnEl = container.querySelector('.btn-help') as HTMLButtonElement;
      btnEl.click();

      expect(mockModalManager.show).toHaveBeenCalled();
    });
  });

  describe('onClick', () => {
    it('should show modal with text content when no URL', () => {
      const button = new HelpButton('text-btn', 'My Help Title', 'My help content here');
      mountButton(button);

      EventBus.getInstance().emit(Events.DOM_READY);

      const btnEl = container.querySelector('.btn-help') as HTMLButtonElement;
      btnEl.click();

      expect(mockModalManager.show).toHaveBeenCalledWith(
        'My Help Title',
        'My help content here'
      );
    });

    it('should show modal with iframe when URL provided', () => {
      const button = new HelpButton(
        'url-btn',
        'URL Help',
        'Fallback content',
        'https://docs.example.com/help'
      );
      mountButton(button);

      EventBus.getInstance().emit(Events.DOM_READY);

      const btnEl = container.querySelector('.btn-help') as HTMLButtonElement;
      btnEl.click();

      expect(mockModalManager.show).toHaveBeenCalledWith(
        'URL Help',
        expect.stringContaining('iframe')
      );
      expect(mockModalManager.show).toHaveBeenCalledWith(
        'URL Help',
        expect.stringContaining('https://docs.example.com/help')
      );
    });

    it('should prevent default event behavior', () => {
      const button = new HelpButton('prevent-btn', 'Title', 'Content');
      mountButton(button);

      EventBus.getInstance().emit(Events.DOM_READY);

      const btnEl = container.querySelector('.btn-help') as HTMLButtonElement;
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = jest.spyOn(clickEvent, 'preventDefault');

      btnEl.dispatchEvent(clickEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });

    it('should include correct iframe styling', () => {
      const button = new HelpButton(
        'iframe-style-btn',
        'Styled Help',
        'Content',
        'https://example.com'
      );
      mountButton(button);

      EventBus.getInstance().emit(Events.DOM_READY);

      const btnEl = container.querySelector('.btn-help') as HTMLButtonElement;
      btnEl.click();

      const [, htmlContent] = mockModalManager.show.mock.calls[0];
      expect(htmlContent).toContain('width:100%');
      expect(htmlContent).toContain('height:600px');
      expect(htmlContent).toContain('border:none');
    });
  });

  describe('edge cases', () => {
    it('should handle empty help content', () => {
      const button = new HelpButton('empty-content', 'Empty', '');
      mountButton(button);

      EventBus.getInstance().emit(Events.DOM_READY);

      const btnEl = container.querySelector('.btn-help') as HTMLButtonElement;
      btnEl.click();

      expect(mockModalManager.show).toHaveBeenCalledWith('Empty', '');
    });

    it('should handle long help content', () => {
      const longContent = 'A'.repeat(10000);
      const button = new HelpButton('long-content', 'Long', longContent);
      mountButton(button);

      EventBus.getInstance().emit(Events.DOM_READY);

      const btnEl = container.querySelector('.btn-help') as HTMLButtonElement;
      btnEl.click();

      expect(mockModalManager.show).toHaveBeenCalledWith('Long', longContent);
    });

    it('should handle HTML in help content', () => {
      const htmlContent = '<p>Formatted <strong>help</strong> content</p>';
      const button = new HelpButton('html-content', 'HTML', htmlContent);
      mountButton(button);

      EventBus.getInstance().emit(Events.DOM_READY);

      const btnEl = container.querySelector('.btn-help') as HTMLButtonElement;
      btnEl.click();

      expect(mockModalManager.show).toHaveBeenCalledWith('HTML', htmlContent);
    });

    it('should handle special characters in title', () => {
      const button = new HelpButton('special-title', 'Help & Info <Guide>', 'Content');
      mountButton(button);

      EventBus.getInstance().emit(Events.DOM_READY);

      const btnEl = container.querySelector('.btn-help') as HTMLButtonElement;
      btnEl.click();

      expect(mockModalManager.show).toHaveBeenCalledWith(
        'Help & Info <Guide>',
        'Content'
      );
    });
  });
});
