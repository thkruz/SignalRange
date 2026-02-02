import { vi } from 'vitest';
import { createRFFrontEnd } from '../../src/equipment/rf-front-end/rf-front-end-factory';

// Mock the RFFrontEndUIStandard to avoid DOM dependencies
vi.mock('../../src/equipment/rf-front-end/rf-front-end-ui-standard', () => {
  return {
    RFFrontEndUIStandard: class {
      constructor(public rootId: string, public state: any, public param1: any, public param2: any) {}
    },
  };
});

describe('createRFFrontEnd (factory branches)', () => {
  it('creates standard UI by default and forwards constructor args', () => {
    const state = { teamId: 99 };
    const instance = createRFFrontEnd('root', state, 'standard', 7, 8);

    expect(instance).toBeDefined();
    expect((instance as any).rootId).toBe('root');
    expect((instance as any).state).toEqual(state);
  });

  it('creates standard UI for unknown uiType', () => {
    const instance = createRFFrontEnd('root2', undefined, 'not-a-real-ui' as any, 1, 2);
    expect(instance).toBeDefined();
  });

  it('throws for uiType=headless', () => {
    expect(() => createRFFrontEnd('root', undefined, 'headless')).toThrow(
      'RFFrontEndHeadless not yet implemented',
    );
  });

  it('throws for uiType=basic', () => {
    expect(() => createRFFrontEnd('root', undefined, 'basic')).toThrow(
      'RFFrontEndUIBasic not yet implemented',
    );
  });
});
