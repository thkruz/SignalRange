import { vi } from 'vitest';
import { App } from "../src/app";
import { EventBus } from "../src/events/event-bus";
import { Events } from "../src/events/events";
import { SimulationManager } from "../src/simulation/simulation-manager";

// Tests for App class

// Define global constants used by the app
declare const global: any;
(global as any).__APP_VERSION__ = '1.0.0-test';
(global as any).__GIT_COMMIT_SHA__ = 'test-sha';

describe('App class', () => {
  beforeEach(() => {
    vi.resetModules();
    App.__resetAll__();


    // Ensure a clean DOM root for BaseElement.init_ calls
    document.body.innerHTML = '<div id="root"></div>';

    // The game loop now lives in SimulationManager, which defers its first tick
    // to requestAnimationFrame (see SimulationManager constructor). Stub rAF so it
    // records the scheduled callback but never auto-runs it - tests drive the tick
    // manually. Use vi.stubGlobal (not `global.x =`) so the stub overrides the
    // binding jsdom module code actually resolves against.
    vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  });

  afterEach(() => {
    // Clear module registry so singletons are reset between tests
    vi.resetModules();
    vi.unstubAllGlobals();
    // Clear any global set by App
    // @ts-ignore
    delete (global as any).signalRange;
  });

  it('create() instantiates App, sets window.signalRange, and emits ROUTE_CHANGED', () => {
    const emitSpy = vi.spyOn(EventBus.getInstance(), 'emit');

    const app = App.create();

    expect(App.getInstance()).toBe(app);
    // @ts-ignore
    expect((global as any).signalRange).toBe(app);

    // create() wires up the app and routes to the initial page. The game loop is
    // NOT running after create(): SimulationManager is constructed during init but
    // immediately torn down when the router navigates to campaign selection
    // (Router.showPage -> SimulationManager.destroy). UPDATE/DRAW only flow once a
    // scenario page spins up its own SimulationManager - see the game-loop test below.
    const calledEvents = emitSpy.mock.calls.map((c: any[]) => c[0]);
    expect(calledEvents).toContain(Events.ROUTE_CHANGED);

    emitSpy.mockRestore();
  });

  it('SimulationManager game loop emits UPDATE and DRAW on a tick', () => {
    // Capture the most recently scheduled frame so we can drive ticks manually.
    let frame: FrameRequestCallback | undefined;
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      frame = cb;
      return 1;
    }));

    // App.create() sets window.signalRange (required by SimulationManager.getInstance)
    // and then the router destroys the init-time simulation. Construct a fresh, live
    // one to exercise the loop without the router tearing it down.
    App.create();
    SimulationManager.destroy();

    const emitSpy = vi.spyOn(EventBus.getInstance(), 'emit');
    SimulationManager.getInstance();

    // Run a single game-loop tick (the constructor scheduled it via rAF).
    expect(frame).toBeDefined();
    frame?.(0);

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
    const emitSpy = vi.spyOn(EventBus.getInstance(), 'emit');
    const app = App.create();

    app.sync();

    expect(emitSpy).toHaveBeenCalledWith(Events.SYNC);

    emitSpy.mockRestore();
  });
});
