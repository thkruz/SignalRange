import { EventBus } from '../../../src/events/event-bus';
import { Events } from '../../../src/events/events';
import { installQuizPause } from '../../../src/ham/quiz/quiz-pause';
import { FIXED_STEP_MS, SimClock } from '../../../src/simulation/sim-clock';

function run(steps: number): void {
  for (let i = 0; i < steps; i++) {
    SimClock.consumeFrame(FIXED_STEP_MS);
    SimClock.step();
  }
}
const data = { objectiveId: 'o', conditionIndex: 0 };
const show = { ...data, question: 'q', options: ['a'], correctIndex: 0, pointPenalty: 5 };

describe('quiz pause', () => {
  beforeEach(() => SimClock.reset());
  afterEach(() => SimClock.reset());

  it('stops scenario time while a quiz is shown and resumes after, run time keeps going', () => {
    const off = installQuizPause();
    run(60);
    expect(SimClock.scenarioElapsedMs()).toBeCloseTo(1000);
    EventBus.getInstance().emit(Events.QUIZ_SHOW, show);
    expect(SimClock.isPaused('quiz')).toBe(true);
    run(60);
    expect(SimClock.scenarioElapsedMs()).toBeCloseTo(1000);
    expect(SimClock.runMs()).toBeCloseTo(2000);
    EventBus.getInstance().emit(Events.QUIZ_COMPLETED, { ...data, totalAttempts: 1, totalPointsDeducted: 0 });
    run(60);
    expect(SimClock.scenarioElapsedMs()).toBeCloseTo(2000);
    off();
  });

  it('dismiss resumes; uninstall resumes and detaches', () => {
    const off = installQuizPause();
    EventBus.getInstance().emit(Events.QUIZ_SHOW, show);
    EventBus.getInstance().emit(Events.QUIZ_DISMISSED, data);
    expect(SimClock.isPaused('quiz')).toBe(false);
    EventBus.getInstance().emit(Events.QUIZ_SHOW, show);
    off();
    expect(SimClock.isPaused('quiz')).toBe(false);
    EventBus.getInstance().emit(Events.QUIZ_SHOW, show);
    expect(SimClock.isPaused('quiz')).toBe(false);
  });

  it('stays paused when a scenario pause is still held', () => {
    const off = installQuizPause();
    SimClock.pause('scenario');
    EventBus.getInstance().emit(Events.QUIZ_SHOW, show);
    EventBus.getInstance().emit(Events.QUIZ_DISMISSED, data);
    expect(SimClock.isPaused('scenario')).toBe(true);
    run(30);
    expect(SimClock.scenarioElapsedMs()).toBe(0);
    SimClock.resume('scenario');
    run(60);
    expect(SimClock.scenarioElapsedMs()).toBeCloseTo(1000);
    off();
  });

  it('without install, scenario time advances during a quiz (other campaigns)', () => {
    EventBus.getInstance().emit(Events.QUIZ_SHOW, show);
    run(60);
    expect(SimClock.scenarioElapsedMs()).toBeCloseTo(1000);
  });

  it('reset clears the quiz pause', () => {
    SimClock.pause('quiz');
    SimClock.reset();
    expect(SimClock.isPaused('quiz')).toBe(false);
  });
});
