/* eslint-disable @typescript-eslint/no-explicit-any */
interface HTMLDivElement {
  addClass: (classStr: string) => void;
  removeClass: (classStr: string) => void;
  hide: () => void;
  on: (type: string, cb: any) => void;
  off: (type?: string, cb?: any) => void;
  scrollTop: (y?: number) => number;
  draggable: (options: any) => void;
  css: any;
  text: any;
  show: any;
  effect: any;
  is: any;
}

declare module '*.css' {
  const content: string;
  export default content;
}
declare module '*.jpg' {
  const content: string;
  export default content;
}
declare module '*.png' {
  const content: string;
  export default content;
}
declare module '*.svg' {
  const content: string;
  export default content;
}
declare module '*.mp3' {
  const content: string;
  export default content;
}
declare module '*.wav' {
  const content: string;
  export default content;
}
declare module '*.flac' {
  const content: string;
  export default content;
}
