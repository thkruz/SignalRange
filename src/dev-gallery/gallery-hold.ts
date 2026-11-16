import { ImmersiveView } from '@app/presentation/immersive-view';

export type ImmersiveKind = 'equipment' | 'computer' | 'paper' | 'laptop' | 'transceiver' | 'instrument';
export type ImmersiveFrame = (content: HTMLElement, leave: HTMLButtonElement) => { element: HTMLElement; dispose: () => void };

/**
 * Hold `content` fullscreen in an ImmersiveView the way the game does. `content` is parked in a stage
 * element first because the view borrows a node that already has a parent. The returned cleanup puts
 * the object down and removes the stage.
 */
export function holdObject(content: HTMLElement, title: string, kind: ImmersiveKind, frame?: ImmersiveFrame, leave: () => void = () => {}): () => void {
  const stage = document.createElement('div');
  stage.className = 'gallery-stage';
  stage.append(content);
  document.body.append(stage);
  const view = new ImmersiveView();
  view.open(content, title, kind, leave, undefined, frame);

  return () => {
    view.close();
    stage.remove();
  };
}
