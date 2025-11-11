import { EventBus } from '../events/event-bus';
import { EventBusEvent } from '../events/event-bus-events';
import { isThisNode } from './isThisNode';

export class ErrorManager {
  private readonly ALLOW_DEBUG = false; // window.location.hostname === 'localhost';
  private readonly ALLOW_LOG = window.location.hostname === 'localhost';
  private readonly ALLOW_INFO = true;
  private readonly ALLOW_WARN = true;
  isDebug = false;

  error(e: Error, funcName: string) {
    EventBus.getInstance().emit(EventBusEvent.error, e, funcName);

    // eslint-disable-next-line no-console
    console.error(e);

    if (isThisNode()) {
      throw e;
    }
  }

  warn(msg: string, isHideFromConsole = false) {
    if (this.ALLOW_WARN) {
      // Toast
    }

    if (!isHideFromConsole) {
      // eslint-disable-next-line no-console
      console.warn(msg);
      if (!isThisNode()) {
        // eslint-disable-next-line no-console
        console.trace();
      }
    }
  }

  info(msg: string) {
    if (this.ALLOW_INFO) {
      // Toast
    }
    if (this.isDebug && !isThisNode()) {
      // eslint-disable-next-line no-console
      console.info(msg);
      if (!isThisNode()) {
        // eslint-disable-next-line no-console
        console.trace();
      }
    }
  }

  log(msg: string) {
    if (this.ALLOW_LOG) {
      // Toast
    }
    if (this.isDebug && !isThisNode()) {
      // eslint-disable-next-line no-console
      console.log(msg);
      if (!isThisNode()) {
        // eslint-disable-next-line no-console
        console.trace();
      }
    }
  }

  debug(msg: string) {
    if (this.ALLOW_DEBUG) {
      // Toast
      // eslint-disable-next-line no-debugger
      debugger;
    }
    if (this.isDebug && !isThisNode()) {
      // eslint-disable-next-line no-console
      console.debug(msg);
      if (!isThisNode()) {
        // eslint-disable-next-line no-console
        console.trace();
      }
    }
  }
}

export const errorManagerInstance = new ErrorManager();
