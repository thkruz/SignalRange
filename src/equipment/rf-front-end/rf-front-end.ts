// Export core and UI classes
export { RFFrontEndCore } from './rf-front-end-core';
export { RFFrontEndUIStandard } from './rf-front-end-ui-standard';
export { createRFFrontEnd, RFFrontEndUIType } from './rf-front-end-factory';

// Re-export state and types
export type { RFFrontEndState } from './rf-front-end-core';

// Maintain backward compatibility
// Existing code can continue to use 'RFFrontEnd' which now points to the UI standard implementation
export { RFFrontEndUIStandard as RFFrontEnd } from './rf-front-end-ui-standard';
