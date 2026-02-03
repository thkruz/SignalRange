import { vi } from 'vitest';
import { FineAdjustControl } from '../../../src/components/fine-adjust-control/fine-adjust-control';

describe('FineAdjustControl', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    container.id = 'test-container';
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const mountControl = (control: FineAdjustControl): void => {
    container.innerHTML = control.html;
  };

  describe('constructor', () => {
    it('should create instance with default parameters', () => {
      const control = new FineAdjustControl('test-control', 'Test Label');
      mountControl(control);

      expect(control.html).toContain('id="test-control"');
      expect(control.html).toContain('Test Label');
      expect(control.html).toContain('fine-adjust-control');
    });

    it('should create instance with custom parameters', () => {
      const control = new FineAdjustControl(
        'custom-control',
        'Frequency',
        100,
        'MHz',
        [100, 10, 1],
        3
      );
      mountControl(control);

      expect(control.html).toContain('id="custom-control"');
      expect(control.html).toContain('Frequency');
      expect(control.html).toContain('100.000MHz');
    });

    it('should display initial value with correct formatting', () => {
      const control = new FineAdjustControl('format-control', 'Test', 45.5, '°', [10, 1], 1);
      mountControl(control);

      expect(control.html).toContain('45.5°');
    });

    it('should generate correct number of step buttons', () => {
      const control = new FineAdjustControl('buttons-control', 'Test', 0, '°', [100, 10, 1, 0.1]);
      mountControl(control);

      // 4 steps = 4 decrease buttons + 4 increase buttons
      const decreaseButtons = container.querySelectorAll('.btn-fine-decrease');
      const increaseButtons = container.querySelectorAll('.btn-fine-increase');

      expect(decreaseButtons.length).toBe(4);
      expect(increaseButtons.length).toBe(4);
    });

    it('should create button labels with correct symbols', () => {
      const control = new FineAdjustControl('labels-control', 'Test', 0, '°', [10, 1, 0.1]);
      mountControl(control);

      // Decrease buttons should have < symbols
      const decreaseButtons = container.querySelectorAll('.btn-fine-decrease');
      expect(decreaseButtons[0].textContent).toBe('<<<');
      expect(decreaseButtons[1].textContent).toBe('<<');
      expect(decreaseButtons[2].textContent).toBe('<');

      // Increase buttons should have > symbols
      const increaseButtons = container.querySelectorAll('.btn-fine-increase');
      expect(increaseButtons[0].textContent).toBe('>');
      expect(increaseButtons[1].textContent).toBe('>>');
      expect(increaseButtons[2].textContent).toBe('>>>');
    });

    it('should set correct data-delta attributes on buttons', () => {
      const control = new FineAdjustControl('delta-control', 'Test', 0, '°', [10, 1]);
      mountControl(control);

      const decreaseButtons = container.querySelectorAll('.btn-fine-decrease');
      expect((decreaseButtons[0] as HTMLElement).dataset.delta).toBe('-10');
      expect((decreaseButtons[1] as HTMLElement).dataset.delta).toBe('-1');

      const increaseButtons = container.querySelectorAll('.btn-fine-increase');
      expect((increaseButtons[0] as HTMLElement).dataset.delta).toBe('1');
      expect((increaseButtons[1] as HTMLElement).dataset.delta).toBe('10');
    });

    it('should set correct title attributes on buttons', () => {
      const control = new FineAdjustControl('title-control', 'Test', 0, 'MHz', [10, 1]);
      mountControl(control);

      const decreaseButtons = container.querySelectorAll('.btn-fine-decrease');
      expect((decreaseButtons[0] as HTMLElement).title).toBe('-10MHz');
      expect((decreaseButtons[1] as HTMLElement).title).toBe('-1MHz');

      const increaseButtons = container.querySelectorAll('.btn-fine-increase');
      expect((increaseButtons[0] as HTMLElement).title).toBe('+1MHz');
      expect((increaseButtons[1] as HTMLElement).title).toBe('+10MHz');
    });
  });

  describe('static create', () => {
    it('should create FineAdjustControl instance', () => {
      const control = FineAdjustControl.create('static-control', 'Static Label', 50, 'dB');
      mountControl(control);

      expect(control).toBeInstanceOf(FineAdjustControl);
      expect(control.html).toContain('Static Label');
    });

    it('should use default values when optional params not provided', () => {
      const control = FineAdjustControl.create('defaults-control', 'Defaults');
      mountControl(control);

      expect(control.html).toContain('0.00°');
    });
  });

  describe('html getter', () => {
    it('should return HTML string', () => {
      const control = new FineAdjustControl('html-control', 'HTML Test');

      expect(control.html).toContain('fine-adjust-control');
      expect(control.html).toContain('fine-adjust-label');
      expect(control.html).toContain('fine-adjust-row');
      expect(control.html).toContain('fine-adjust-display');
    });
  });

  describe('dom getter', () => {
    it('should return DOM element', () => {
      const control = new FineAdjustControl('dom-control', 'DOM Test');
      mountControl(control);

      expect(control.dom).toBeInstanceOf(HTMLElement);
      expect(control.dom.id).toBe('dom-control');
    });

    it('should cache DOM element', () => {
      const control = new FineAdjustControl('cache-control', 'Cache Test');
      mountControl(control);

      const dom1 = control.dom;
      const dom2 = control.dom;

      expect(dom1).toBe(dom2);
    });
  });

  describe('valueDisplay getter', () => {
    it('should return value display element', () => {
      const control = new FineAdjustControl('value-control', 'Value Test', 25);
      mountControl(control);

      expect(control.valueDisplay).toBeInstanceOf(HTMLElement);
      expect(control.valueDisplay.id).toBe('value-control-value');
      expect(control.valueDisplay.textContent).toBe('25.00°');
    });
  });

  describe('pendingDisplay getter', () => {
    it('should return pending display element', () => {
      const control = new FineAdjustControl('pending-control', 'Pending Test');
      mountControl(control);

      expect(control.pendingDisplay).toBeInstanceOf(HTMLElement);
      expect(control.pendingDisplay.id).toBe('pending-control-pending');
      expect(control.pendingDisplay.textContent).toBe('');
    });
  });

  describe('addEventListeners', () => {
    it('should call callback with delta when button clicked', () => {
      const control = new FineAdjustControl('event-control', 'Events', 0, '°', [10, 1]);
      mountControl(control);

      const callback = vi.fn();
      control.addEventListeners(callback);

      const increaseButton = container.querySelector('.btn-fine-increase') as HTMLButtonElement;
      increaseButton.click();

      expect(callback).toHaveBeenCalledWith(1);
    });

    it('should call callback with negative delta for decrease buttons', () => {
      const control = new FineAdjustControl('decrease-event', 'Decrease', 0, '°', [10, 1]);
      mountControl(control);

      const callback = vi.fn();
      control.addEventListeners(callback);

      const decreaseButton = container.querySelector('.btn-fine-decrease') as HTMLButtonElement;
      decreaseButton.click();

      expect(callback).toHaveBeenCalledWith(-10);
    });

    it('should attach listeners to all buttons', () => {
      const control = new FineAdjustControl('all-buttons', 'All', 0, '°', [100, 10, 1]);
      mountControl(control);

      const callback = vi.fn();
      control.addEventListeners(callback);

      const allButtons = container.querySelectorAll('.btn-fine');
      expect(allButtons.length).toBe(6);

      allButtons.forEach(btn => (btn as HTMLButtonElement).click());

      expect(callback).toHaveBeenCalledTimes(6);
    });
  });

  describe('sync', () => {
    it('should update displayed value', () => {
      const control = new FineAdjustControl('sync-control', 'Sync', 0, '°', [10, 1], 2);
      mountControl(control);

      control.sync(45.67);

      expect(control.valueDisplay.textContent).toBe('45.67°');
    });

    it('should not update if value unchanged', () => {
      const control = new FineAdjustControl('no-change', 'Same', 50, '°', [10, 1], 0);
      mountControl(control);

      const originalText = control.valueDisplay.textContent;
      control.sync(50);

      expect(control.valueDisplay.textContent).toBe(originalText);
    });

    it('should show pending value when different from current', () => {
      const control = new FineAdjustControl('pending-sync', 'Pending', 100, 'MHz', [10, 1], 1);
      mountControl(control);

      control.sync(100, 110);

      expect(control.pendingDisplay.textContent).toBe('→ 110.0MHz');
    });

    it('should clear pending display when pending equals current', () => {
      const control = new FineAdjustControl('clear-pending', 'Clear', 100, 'dB', [10, 1], 0);
      mountControl(control);

      // First set a pending value
      control.sync(100, 110);
      expect(control.pendingDisplay.textContent).toContain('110');

      // Then sync with same value
      control.sync(100, 100);
      expect(control.pendingDisplay.textContent).toBe('');
    });

    it('should clear pending display when pending is null', () => {
      const control = new FineAdjustControl('null-pending', 'Null', 50, '°', [10, 1], 2);
      mountControl(control);

      // First set a pending value
      control.sync(50, 60);
      expect(control.pendingDisplay.textContent).toContain('60');

      // Then clear it
      control.sync(50, null);
      expect(control.pendingDisplay.textContent).toBe('');
    });

    it('should handle decimal precision correctly', () => {
      const control = new FineAdjustControl('decimals', 'Precision', 0, '°', [1, 0.1, 0.01], 3);
      mountControl(control);

      control.sync(123.456);

      expect(control.valueDisplay.textContent).toBe('123.456°');
    });
  });

  describe('setEnabled', () => {
    it('should disable all buttons when enabled=false', () => {
      const control = new FineAdjustControl('disable-control', 'Disable', 0, '°', [10, 1]);
      mountControl(control);

      control.setEnabled(false);

      const allButtons = container.querySelectorAll('.btn-fine');
      allButtons.forEach(btn => {
        expect((btn as HTMLButtonElement).disabled).toBe(true);
      });
    });

    it('should enable all buttons when enabled=true', () => {
      const control = new FineAdjustControl('enable-control', 'Enable', 0, '°', [10, 1]);
      mountControl(control);

      // First disable
      control.setEnabled(false);
      // Then enable
      control.setEnabled(true);

      const allButtons = container.querySelectorAll('.btn-fine');
      allButtons.forEach(btn => {
        expect((btn as HTMLButtonElement).disabled).toBe(false);
      });
    });

    it('should add disabled class to container when disabled', () => {
      const control = new FineAdjustControl('class-control', 'Class', 0, '°', [10, 1]);
      mountControl(control);

      control.setEnabled(false);

      expect(control.dom.classList.contains('disabled')).toBe(true);
    });

    it('should remove disabled class when enabled', () => {
      const control = new FineAdjustControl('toggle-class', 'Toggle', 0, '°', [10, 1]);
      mountControl(control);

      control.setEnabled(false);
      control.setEnabled(true);

      expect(control.dom.classList.contains('disabled')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle zero initial value', () => {
      const control = new FineAdjustControl('zero-control', 'Zero', 0, '°', [10, 1], 2);
      mountControl(control);

      expect(control.html).toContain('0.00°');
    });

    it('should handle negative values', () => {
      const control = new FineAdjustControl('negative-control', 'Negative', -45.5, '°', [10, 1], 1);
      mountControl(control);

      expect(control.html).toContain('-45.5°');
    });

    it('should handle large values', () => {
      const control = new FineAdjustControl('large-control', 'Large', 12345.67, 'Hz', [1000, 100], 2);
      mountControl(control);

      expect(control.html).toContain('12345.67Hz');
    });

    it('should handle empty unit string', () => {
      const control = new FineAdjustControl('no-unit', 'No Unit', 50, '', [10, 1], 0);
      mountControl(control);

      expect(control.html).toContain('>50<');
    });

    it('should handle single step configuration', () => {
      const control = new FineAdjustControl('single-step', 'Single', 0, '°', [1]);
      mountControl(control);

      const decreaseButtons = container.querySelectorAll('.btn-fine-decrease');
      const increaseButtons = container.querySelectorAll('.btn-fine-increase');

      expect(decreaseButtons.length).toBe(1);
      expect(increaseButtons.length).toBe(1);
    });
  });
});
