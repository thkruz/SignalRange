import { App } from "../src/app";
import { EventBus } from "../src/events/event-bus";
import { Events } from "../src/events/events";

// Tests for App class

describe('App class', () => {
  beforeEach(() => {
    jest.resetModules();
    App.__resetAll__();


    // Ensure a clean DOM root for BaseElement.init_ calls
    document.body.innerHTML = '<div id="root"></div>';

    // Prevent requestAnimationFrame from scheduling the loop repeatedly
    // App.gameLoop_ calls requestAnimationFrame at the end; we stub it so it doesn't call the callback.
    // The first frame still runs because App.create() calls gameLoop_() synchronously.
    // @ts-ignore
    global.requestAnimationFrame = jest.fn(() => 1);
  });

  afterEach(() => {
    // Clear module registry so singletons are reset between tests
    jest.resetModules();
    // @ts-ignore
    global.requestAnimationFrame = undefined;
    // Clear any global set by App
    // @ts-ignore
    delete (global as any).signalRange;
  });

  it('create() should instantiate App, set window.signalRange and emit UPDATE and DRAW once', () => {
    const emitSpy = jest.spyOn(EventBus.getInstance(), 'emit');

    const app = App.create();

    expect(App.getInstance()).toBe(app);
    // @ts-ignore
    expect((global as any).signalRange).toBe(app);

    // EventBus.emit should have been called for UPDATE and DRAW during the first gameLoop_ run
    const calledEvents = emitSpy.mock.calls.map((c: any[]) => c[0]);

    expect(calledEvents).toEqual(expect.arrayContaining([Events.UPDATE, Events.DRAW]));

    emitSpy.mockRestore();
  });

  it('create() called twice should throw an error', () => {
    const first = App.create();
    expect(App.getInstance()).toBe(first);

    expect(() => App.create()).toThrow();
  });

  it('sync() should emit Events.SYNC', () => {
    const emitSpy = jest.spyOn(EventBus.getInstance(), 'emit');
    const app = App.create();

    app.sync();

    expect(emitSpy).toHaveBeenCalledWith(Events.SYNC);

    emitSpy.mockRestore();
  });
});
