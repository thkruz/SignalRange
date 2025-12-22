import { DraggableBox } from '../../src/engine/ui/draggable-box';
import { getEl } from '../../src/engine/utils/get-el';
import { DraggableHtmlBox } from '../../src/modal/draggable-html-box';

jest.mock('../../src/engine/ui/draggable-box');
jest.mock('../../src/engine/utils/get-el');

describe('DraggableHtmlBox', () => {
  let mockElement: HTMLElement;

  beforeEach(() => {
    jest.clearAllMocks();
    mockElement = document.createElement('div');
    (getEl as jest.Mock).mockReturnValue(mockElement);
  });

  describe('constructor', () => {
    it('should create instance with title and id', () => {
      const box = new DraggableHtmlBox('Test Title', 'test-id');

      expect(DraggableBox).toHaveBeenCalledWith(
        'draggable-html-box-test-id',
        expect.objectContaining({
          title: 'Test Title',
          parentId: 'sandbox-page'
        })
      );
      expect(box.isOpen).toBe(true);
    });

    it('should create instance with url', () => {
      const box = new DraggableHtmlBox('Test', 'test-id', 'https://example.com');

      expect(DraggableBox).toHaveBeenCalledWith(
        'draggable-html-box-test-id',
        expect.objectContaining({
          boxContentHtml: expect.stringContaining('https://example.com')
        })
      );
    });

    it('should call getEl with correct id', () => {
      new DraggableHtmlBox('Test', 'test-id');

      expect(getEl).toHaveBeenCalledWith('draggable-html-box-content-test-id');
    });
  });

  describe('updateContent', () => {
    it('should update innerHTML of popup element', () => {
      const box = new DraggableHtmlBox('Test', 'test-id');
      const newContent = '<div>New Content</div>';

      box.updateContent(newContent);

      expect(mockElement.innerHTML).toBe(newContent);
    });

    it('should return html content when requested', () => {
      const box = new DraggableHtmlBox('Test', 'test-id');
      const content = box['getBoxContentHtml']();

      expect(content).toBe('');
    });
  });

  describe('close', () => {
    it('should set isOpen to false', () => {
      const box = new DraggableHtmlBox('Test', 'test-id');

      box.close();

      expect(box.isOpen).toBe(false);
    });

    it('should call onClose callback if defined', () => {
      const box = new DraggableHtmlBox('Test', 'test-id');
      const mockOnClose = jest.fn();
      box.onClose = mockOnClose;

      box.close();

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call parent close with callback', () => {
      const box = new DraggableHtmlBox('Test', 'test-id');
      const mockCallback = jest.fn();

      box.close(mockCallback);

      expect(DraggableBox.prototype.close).toHaveBeenCalledWith(mockCallback);
    });
  });

  describe('onOpen', () => {
    it('should set isOpen to true', () => {
      const box = new DraggableHtmlBox('Test', 'test-id');
      box.isOpen = false;

      (box as any).onOpen();

      expect(box.isOpen).toBe(true);
    });
  });
});