/**
 * @file quiz-pause - Opt-in scenario-time pause while a quiz is open (Campaign 3)
 * @description The C3 manager installs this only when settings.hamStation.pauseOnQuiz is on, so
 * other campaigns' quiz timing is unchanged. Uses the 'quiz' pause reason, which stops scenario
 * time like 'scenario' but is released independently of it.
 */

import { EventBus } from '@app/events/event-bus';
import { Events } from '@app/events/events';
import { SimClock } from '@app/simulation/sim-clock';

export function installQuizPause(): () => void {
  const bus = EventBus.getInstance();
  const pause = (): void => SimClock.pause('quiz');
  const resume = (): void => SimClock.resume('quiz');
  bus.on(Events.QUIZ_SHOW, pause);
  bus.on(Events.QUIZ_DISMISSED, resume);
  bus.on(Events.QUIZ_COMPLETED, resume);

  return () => {
    bus.off(Events.QUIZ_SHOW, pause);
    bus.off(Events.QUIZ_DISMISSED, resume);
    bus.off(Events.QUIZ_COMPLETED, resume);
    resume();
  };
}
