describe('createRFFrontEnd (factory branches)', () => {
  it('creates standard UI by default and forwards constructor args', () => {
    jest.isolateModules(() => {
      const ctorSpy = jest.fn();

      jest.doMock('../../src/equipment/rf-front-end/rf-front-end-ui-standard', () => {
        return {
          RFFrontEndUIStandard: class {
            constructor(...args: any[]) {
              ctorSpy(...args);
            }
          },
        };
      });

      const { createRFFrontEnd } = require('../../src/equipment/rf-front-end/rf-front-end-factory');

      const state = { teamId: 99 };
      const instance = createRFFrontEnd('root', state, 'standard', 7, 8);

      expect(instance).toBeDefined();
      expect(ctorSpy).toHaveBeenCalledWith('root', state, 7, 8);

      // Default branch should also return standard UI
      const instance2 = createRFFrontEnd('root2', undefined, 'not-a-real-ui' as any, 1, 2);
      expect(instance2).toBeDefined();
      expect(ctorSpy).toHaveBeenCalledWith('root2', undefined, 1, 2);
    });
  });

  it('throws for uiType=headless', () => {
    jest.isolateModules(() => {
      jest.doMock('../../src/equipment/rf-front-end/rf-front-end-ui-standard', () => ({
        RFFrontEndUIStandard: class { },
      }));

      const { createRFFrontEnd } = require('../../src/equipment/rf-front-end/rf-front-end-factory');

      expect(() => createRFFrontEnd('root', undefined, 'headless')).toThrow(
        'RFFrontEndHeadless not yet implemented',
      );
    });
  });

  it('throws for uiType=basic', () => {
    jest.isolateModules(() => {
      jest.doMock('../../src/equipment/rf-front-end/rf-front-end-ui-standard', () => ({
        RFFrontEndUIStandard: class { },
      }));

      const { createRFFrontEnd } = require('../../src/equipment/rf-front-end/rf-front-end-factory');

      expect(() => createRFFrontEnd('root', undefined, 'basic')).toThrow(
        'RFFrontEndUIBasic not yet implemented',
      );
    });
  });
});
