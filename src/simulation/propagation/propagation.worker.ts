/// <reference lib="webworker" />
import { createPropagationHandler } from './propagation-handler';
import type { PropagationRequest } from './propagation-protocol';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const handle = createPropagationHandler((msg, transfer) => ctx.postMessage(msg, transfer));
ctx.onmessage = (e: MessageEvent<PropagationRequest>) => handle(e.data);
