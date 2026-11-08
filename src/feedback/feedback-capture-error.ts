export type CaptureStage = 'render' | 'encode' | 'validate';

export interface CaptureFailure {
  status: 'failed';
  renderer: 'html2canvas';
  stage: CaptureStage;
  reason: 'unsupported-color' | 'canvas-security' | 'too-large' | 'invalid-image' | 'render-failed' | 'encode-failed';
  message: string;
}

export class FeedbackCaptureError extends Error {
  constructor(readonly diagnostic: CaptureFailure) {
    super(diagnostic.message);
    this.name = 'FeedbackCaptureError';
  }
}

/** Store known failure reasons, never raw errors/stacks that may contain private URLs or identifiers. */
export function describeCaptureFailure(error: unknown, stage: CaptureStage = 'render'): CaptureFailure {
  if (error instanceof FeedbackCaptureError) return error.diagnostic;
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  const message = error instanceof Error ? error.message : '';
  if (name === 'SecurityError') {
    return { status: 'failed', renderer: 'html2canvas', stage, reason: 'canvas-security', message: 'Browser security prevented reading the screenshot canvas.' };
  }
  if (/unsupported color function/iu.test(message)) {
    return {
      status: 'failed',
      renderer: 'html2canvas',
      stage,
      reason: 'unsupported-color',
      message: 'The screenshot renderer does not support a CSS color function on this screen.',
    };
  }
  return {
    status: 'failed',
    renderer: 'html2canvas',
    stage,
    reason: stage === 'render' ? 'render-failed' : 'encode-failed',
    message: stage === 'render' ? 'The screenshot renderer failed while drawing this screen.' : 'The browser could not encode the screenshot as JPEG.',
  };
}
