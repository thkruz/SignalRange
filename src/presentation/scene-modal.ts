import niceTasks from './nice-task-descriptions.json';
import { fade, preloadArtwork } from './transitions';
import './scene-modal.css';

export interface SceneParticipant {
  name: string;
  role?: string;
  portrait?: string;
}

/** Presentation only: openings and epilogues supply their own content and action. */
export interface SceneData {
  label: string;
  title: string;
  subtitle?: string;
  image: string;
  imageAlt: string;
  facts: { label: string; value: string }[];
  participants?: SceneParticipant[];
  participantLabel?: string;
  body?: string;
  attribution?: string;
  record?: {
    title: string;
    note: string;
    awards: { title: string; description: string }[];
    taskCodes: string[];
    totalTasks: number;
  };
  actionLabel: string;
}

export class SceneModal {
  private readonly dialog_: HTMLDialogElement;
  private readonly previousFocus_: HTMLElement | null;
  private resolve_: ((started: boolean) => void) | null = null;
  private settling_ = false;
  readonly result: Promise<boolean>;

  constructor(data: SceneData, onBack: () => void) {
    this.previousFocus_ = document.activeElement as HTMLElement | null;
    this.result = new Promise((resolve) => {
      this.resolve_ = resolve;
    });
    this.dialog_ = document.createElement('dialog');
    this.dialog_.className = 'scene-modal';
    if (data.body) this.dialog_.classList.add('scene-modal--story');
    if (data.record) this.dialog_.classList.add('scene-modal--record');
    this.dialog_.setAttribute('aria-label', data.title);
    const image = document.createElement('img');
    image.className = 'scene-artwork';
    image.src = data.image;
    image.alt = data.imageAlt;
    image.addEventListener(
      'error',
      () => {
        image.hidden = true;
      },
      { once: true }
    );
    preloadArtwork(data.image);

    const content = document.createElement('div');
    content.className = 'scene-content';
    const label = document.createElement('p');
    label.className = 'scene-eyebrow';
    label.textContent = data.label;
    const title = document.createElement('h1');
    title.textContent = data.title;
    const subtitle = document.createElement('p');
    subtitle.className = 'scene-subtitle';
    subtitle.textContent = data.subtitle ?? '';
    const facts = document.createElement('dl');
    facts.className = 'scene-facts';
    for (const fact of data.facts) {
      const item = document.createElement('div');
      const term = document.createElement('dt');
      term.textContent = fact.label;
      const value = document.createElement('dd');
      value.textContent = fact.value;
      item.append(term, value);
      facts.append(item);
    }
    content.append(label, title, subtitle);
    if (data.facts.length && !data.record) content.append(facts);
    if (data.body) {
      const body = document.createElement('div');
      body.className = 'scene-body';
      for (const text of data.body.split('\n\n')) {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        body.append(paragraph);
      }
      content.append(body);
    }
    if (data.attribution) {
      const attribution = document.createElement('p');
      attribution.className = 'scene-attribution';
      attribution.textContent = data.attribution;
      content.append(attribution);
    }
    if (data.record) {
      const record = document.createElement('section');
      record.className = 'scene-record';
      record.setAttribute('aria-label', data.record.title);
      const heading = document.createElement('h2');
      heading.textContent = data.record.title;
      const note = document.createElement('p');
      note.className = 'scene-record-note';
      note.textContent = data.record.note;
      const awards = document.createElement('ul');
      awards.className = 'scene-awards';
      for (const award of data.record.awards) {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        title.textContent = award.title;
        const description = document.createElement('span');
        description.textContent = award.description;
        item.append(title, description);
        awards.append(item);
      }
      record.append(heading, facts, awards, note);
      if (data.record.totalTasks > 0) {
        const details = document.createElement('details');
        details.className = 'scene-task-coverage';
        const summary = document.createElement('summary');
        summary.textContent = `${data.record.taskCodes.length} / ${data.record.totalTasks} NICE tasks practiced in this campaign`;
        const explanation = document.createElement('p');
        explanation.textContent =
          'Tasks from the NIST NICE workforce framework, mapped to required objectives in your completed missions. This records practice within this campaign, not certification.';
        const codes = document.createElement('ul');
        codes.className = 'scene-task-codes';
        for (const code of data.record.taskCodes) {
          const item = document.createElement('li');
          const description = document.createElement('span');
          description.textContent = (niceTasks.tasks as Record<string, string>)[code] ?? 'Task description unavailable';
          const reference = document.createElement('code');
          reference.textContent = code;
          item.append(description, reference);
          codes.append(item);
        }
        details.append(summary, explanation, codes);
        record.append(details);
      }
      content.append(record);
    }
    if (data.participants?.length) {
      const heading = document.createElement('h2');
      heading.textContent = data.participantLabel ?? 'Crew & contacts';
      const crew = document.createElement('ul');
      crew.className = 'scene-crew';
      for (const person of data.participants) {
        const item = document.createElement('li');
        if (person.portrait) {
          const portrait = document.createElement('img');
          portrait.src = person.portrait;
          portrait.alt = '';
          portrait.width = 44;
          portrait.height = 52;
          portrait.addEventListener(
            'error',
            () => {
              portrait.hidden = true;
            },
            { once: true }
          );
          item.append(portrait);
        }
        const details = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = person.name;
        const role = document.createElement('small');
        role.textContent = person.role ?? '';
        details.append(name, role);
        item.append(details);
        crew.append(item);
      }
      content.append(heading, crew);
    }
    const actions = document.createElement('footer');
    actions.className = 'scene-actions';
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'scene-back';
    back.textContent = 'Back to missions';
    back.addEventListener('click', () => {
      this.dispose();
      onBack();
    });
    const start = document.createElement('button');
    start.type = 'button';
    start.className = 'scene-start';
    start.textContent = data.actionLabel;
    start.addEventListener('click', () => {
      void this.accept_();
    });
    actions.append(back, start);
    if (data.record) {
      const scroll = document.createElement('div');
      scroll.className = 'scene-scroll';
      scroll.append(...content.childNodes);
      content.append(scroll);
    }
    content.append(actions);
    this.dialog_.append(image, content);
    this.dialog_.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.dispose();
      onBack();
    });
    this.dialog_.addEventListener('keydown', (event) => event.stopPropagation());
    document.body.append(this.dialog_);
    this.dialog_.showModal();
    start.focus({ preventScroll: true });
    fade(this.dialog_, 0, 1, true);
  }

  private async accept_(): Promise<void> {
    if (this.settling_) return;
    this.settling_ = true;
    for (const button of this.dialog_.querySelectorAll('button')) button.disabled = true;
    await fade(this.dialog_, 1, 0, true)?.finished.catch(() => {});
    this.finish_(true);
  }

  private finish_(accepted: boolean): void {
    if (!this.resolve_) return;
    const resolve = this.resolve_;
    this.resolve_ = null;
    for (const animation of this.dialog_.getAnimations?.() ?? []) animation.cancel();
    this.dialog_.close();
    this.dialog_.remove();
    if (this.previousFocus_?.isConnected) this.previousFocus_.focus({ preventScroll: true });
    resolve(accepted);
  }

  dispose(): void {
    this.finish_(false);
  }
}
