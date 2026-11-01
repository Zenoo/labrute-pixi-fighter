import type { Animation, WeaponName } from '../src/Symbols';
import { animationsFor, colorKeys, hasClothingDetails, partCounts, partKeys, weapons } from './previewData';
import { animationModel, defaultState, isBrute } from './playgroundState';
import type { PlaygroundState, PreviewModel } from './playgroundState';
import type { PlaygroundPreview } from './PlaygroundPreview';
import { readBodyString, readColorString } from './utils';

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) throw new Error(`Missing playground element: ${id}`);

  return element as T;
}

function labelFor(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/-/g, ' ')
    .replace(/^./, (first) => first.toUpperCase());
}

const clothingLabels: Record<string, string> = {
  p1: 'Clothing details (1)',
  p7: 'Clothing set (7)',
  p7b: 'Legwear set (7B)',
};

/** Manages form state and DOM updates; rendering belongs to PlaygroundPreview. */
export class PlaygroundControls {
  readonly previewContainer = getElement<HTMLElement>('preview');

  // Cache references once. The animation ticker should not query the document.
  private readonly fields = {
    model: getElement<HTMLSelectElement>('model'),
    team: getElement<HTMLSelectElement>('team'),
    scale: getElement<HTMLSelectElement>('scale'),
    animation: getElement<HTMLSelectElement>('animation'),
    weapon: getElement<HTMLSelectElement>('weapon'),
    shield: getElement<HTMLInputElement>('shield'),
    speed: getElement<HTMLSelectElement>('speed'),
    grid: getElement<HTMLInputElement>('grid'),
    bodyString: getElement<HTMLInputElement>('body-string'),
    clothingPreset: getElement<HTMLSelectElement>('clothing-preset'),
    colorString: getElement<HTMLInputElement>('color-string'),
    frame: getElement<HTMLInputElement>('frame'),
  };

  private readonly playButton = getElement<HTMLButtonElement>('play');
  private readonly restartButton = getElement<HTMLButtonElement>('restart');
  private readonly resetButton = getElement<HTMLButtonElement>('reset');
  private readonly status = getElement<HTMLElement>('status');
  private readonly frameCount = getElement<HTMLOutputElement>('frame-count');
  private readonly appearanceControls = getElement<HTMLElement>('appearance-controls');
  private readonly bodyFields = getElement<HTMLElement>('body-fields');
  private readonly colorFields = getElement<HTMLElement>('color-fields');
  private readonly listeners = new AbortController();

  private state: PlaygroundState = defaultState('female');

  readonly callbacks = {
    onStatus: (message: string, error = false): void => {
      if (this.status.textContent !== message) this.status.textContent = message;
      this.status.dataset.state = error ? 'error' : 'ready';

      if (message === 'Preview up to date') {
        this.playButton.disabled = false;
        this.restartButton.disabled = false;
        this.fields.frame.disabled = false;
      }
    },

    onPlayingChange: (playing: boolean): void => {
      this.playButton.textContent = playing ? 'Pause' : 'Play';
      this.playButton.setAttribute('aria-pressed', String(playing));
    },

    onFrame: (frame: number, frameCount: number): void => {
      const maximum = Math.max(0, frameCount - 1);
      const displayedFrame = Math.max(0, Math.min(maximum, frame));
      const label = `${displayedFrame + 1} / ${maximum + 1}`;

      // Unchanged textContent assignments still create mutations and invalidate
      // layout. In particular, a paused preview must leave the DOM alone.
      if (this.fields.frame.max !== String(maximum)) {
        this.fields.frame.max = String(maximum);
      }

      if (this.fields.frame.value !== String(displayedFrame)) {
        this.fields.frame.value = String(displayedFrame);
      }

      if (this.frameCount.textContent !== label) this.frameCount.textContent = label;
    },
  };

  connect(preview: PlaygroundPreview): void {
    const options = { signal: this.listeners.signal };

    this.fields.weapon.add(new Option('No weapon', ''));

    for (const weapon of weapons) {
      this.fields.weapon.add(new Option(labelFor(weapon), weapon));
    }

    this.populateForm();

    this.fields.model.addEventListener(
      'change',
      () => {
        const defaults = defaultState(this.fields.model.value as PreviewModel);
        this.state = { ...this.state, ...defaults, team: this.state.team, scale: this.state.scale };
        this.populateForm();
        preview.scheduleRebuild(this.state);
      },
      options,
    );

    this.fields.team.addEventListener(
      'change',
      () => {
        this.state.team = this.fields.team.value as 'L' | 'R';
        preview.scheduleRebuild(this.state);
      },
      options,
    );

    this.fields.scale.addEventListener(
      'change',
      () => {
        this.state.scale = Number(this.fields.scale.value);
        preview.scheduleRebuild(this.state);
      },
      options,
    );

    for (const field of [this.fields.animation, this.fields.weapon, this.fields.shield]) {
      field.addEventListener(
        'change',
        () => {
          this.state.animation = this.fields.animation.value as Animation;
          this.state.weapon = (this.fields.weapon.value as WeaponName) || null;
          this.state.shield = this.fields.shield.checked;
          preview.updatePlayback(this.state);
        },
        options,
      );
    }

    this.fields.speed.addEventListener(
      'change',
      () => {
        preview.setSpeed(Number(this.fields.speed.value));
      },
      options,
    );

    this.fields.grid.addEventListener(
      'change',
      () => {
        this.previewContainer.classList.toggle('grid', this.fields.grid.checked);
      },
      options,
    );

    // Delegate dynamic fields to their stable parent, rather than installing
    // another set of listeners every time a model or appearance is imported.
    this.bodyFields.addEventListener(
      'change',
      (event) => {
        const control = event.target as HTMLSelectElement;
        const key = control.dataset.part;

        if (!key) return;

        this.state.parts[key] = Number(control.value);
        this.updateBodyString();
        preview.scheduleRebuild(this.state);
      },
      options,
    );

    this.fields.clothingPreset.addEventListener('change', () => {
      const value = this.fields.clothingPreset.value;
      if (!value) return;

      const [set, detail] = value.split(':').map(Number);
      // The source keeps these selectors independent. A coordinated preset
      // exposes complete outfits without changing the renderer's selection rules.
      this.state.parts.p7 = set;
      this.state.parts.p7b = set;
      this.state.parts.p1 = detail;
      this.populateBodyFields();
      preview.scheduleRebuild(this.state);
    }, options);

    this.colorFields.addEventListener(
      'input',
      (event) => {
        const control = event.target as HTMLInputElement;
        const key = control.dataset.color;

        if (!key) return;

        this.state.colors[key] = control.value;
        preview.updateColors(this.state.colors);
      },
      options,
    );

    this.colorFields.addEventListener(
      'focusin',
      () => {
        preview.interrupt('color-picker', true);
      },
      options,
    );

    this.colorFields.addEventListener(
      'focusout',
      () => {
        preview.interrupt('color-picker', false);
      },
      options,
    );

    this.fields.bodyString.addEventListener('input', () => this.importBody(preview), options);
    this.fields.colorString.addEventListener('input', () => this.importColors(preview), options);
    this.playButton.addEventListener('click', () => preview.togglePlaying(), options);
    this.restartButton.addEventListener('click', () => preview.updatePlayback(this.state), options);

    this.fields.frame.addEventListener(
      'input',
      () => {
        preview.seek(Number(this.fields.frame.value));
      },
      options,
    );

    this.resetButton.addEventListener(
      'click',
      () => {
        this.state = defaultState(this.state.model);
        this.fields.speed.value = '1';
        preview.setSpeed(1);
        this.populateForm();
        preview.scheduleRebuild(this.state);
      },
      options,
    );

    preview.scheduleRebuild(this.state);
  }

  private populateForm(): void {
    const brute = isBrute(this.state.model);
    const availableAnimations = animationsFor(animationModel(this.state.model));

    this.fields.model.value = this.state.model;
    this.fields.team.value = this.state.team;
    this.fields.scale.value = String(this.state.scale);
    this.fields.weapon.value = this.state.weapon ?? '';
    this.fields.shield.checked = this.state.shield;
    this.fields.weapon.disabled = !brute;
    this.fields.shield.disabled = !brute;
    this.appearanceControls.hidden = !brute;

    this.fields.animation.replaceChildren();

    for (const animation of availableAnimations) {
      this.fields.animation.add(new Option(labelFor(animation), animation));
    }

    this.fields.animation.value = this.state.animation;
    this.fields.colorString.value = this.state.colorString;
    this.fields.colorString.setCustomValidity('');

    if (brute) {
      this.populateBodyFields();
      this.populateColorFields();
    }
  }

  private populateBodyFields(): void {
    const counts = partCounts(animationModel(this.state.model));
    const fields = document.createDocumentFragment();
    this.fields.clothingPreset.replaceChildren(new Option('Custom combination', ''));

    for (let set = 0; set < counts.p7; set++) {
      const hasDetails = hasClothingDetails(animationModel(this.state.model), set);
      const detailCount = hasDetails ? counts.p1 : 1;

      for (let detail = 0; detail < detailCount; detail++) {
        this.fields.clothingPreset.add(new Option(
          hasDetails ? `Outfit ${set + 1}${String.fromCharCode(97 + detail)} — ${detail === 0 ? 'basic' : 'detailed'}`
            : `Outfit ${set + 1} — no detail variation`,
          `${set}:${detail}`,
        ));
      }
    }

    for (const key of partKeys) {
      const count = counts[key];
      const label = document.createElement('label');
      const control = document.createElement('select');
      label.textContent = clothingLabels[key] ?? `Part ${key.substring(1).toUpperCase()}`;
      control.id = `part-${key}`;
      control.dataset.part = key;
      control.disabled = count <= 1;

      if (key === 'p8') {
        label.title = 'The five source frames contain identical placements, so this selector has no visual effect.';
      } else if (key === 'p1a' || key === 'p1b') {
        label.title = this.state.model === 'female'
          ? 'The female source symbols do not use this selector.'
          : 'Only used in armor 2. Its one-frame artwork wraps to the same frame, so this selector has no visual effect.';
      }

      for (let index = 0; index < count; index++) {
        control.add(new Option(`Variation ${index}`, String(index)));
      }

      control.value = String(this.state.parts[key] % count);
      label.appendChild(control);

      if (label.title) {
        const note = document.createElement('small');
        note.textContent = label.title;
        label.appendChild(note);
      }
      fields.appendChild(label);
    }

    this.bodyFields.replaceChildren(fields);
    this.updateBodyString();
  }

  private updateBodyString(): void {
    this.fields.bodyString.value = partKeys
      .map((key) => this.state.parts[key].toString(16))
      .join('');
    this.fields.bodyString.setCustomValidity('');

    const counts = partCounts(animationModel(this.state.model));
    const set = this.state.parts.p7 % counts.p7;
    const legwear = this.state.parts.p7b % counts.p7b;
    const detail = hasClothingDetails(animationModel(this.state.model), set)
      ? this.state.parts.p1 % counts.p1 : 0;
    this.fields.clothingPreset.value = set === legwear ? `${set}:${detail}` : '';
  }

  private populateColorFields(): void {
    const fields = document.createDocumentFragment();

    for (const key of colorKeys) {
      const label = document.createElement('label');
      const control = document.createElement('input');
      const category = key.startsWith('col0')
        ? 'Skin'
        : key.startsWith('col1')
          ? 'Hair'
          : 'Clothing';
      label.textContent = `${category} ${key.substring(3).toUpperCase()}`;
      control.type = 'color';
      control.id = `color-${key}`;
      control.dataset.color = key;
      control.value = this.state.colors[key];
      label.appendChild(control);
      fields.appendChild(label);
    }

    this.colorFields.replaceChildren(fields);
  }

  private importBody(preview: PlaygroundPreview): void {
    const value = this.fields.bodyString.value.trim();
    const parts = readBodyString(value) as Record<string, number>;
    const valid = /^[\da-f]{11}$/i.test(value);

    this.fields.bodyString.setCustomValidity(
      valid ? '' : 'Use 11 hexadecimal digits.',
    );

    if (!valid) {
      this.callbacks.onStatus('Use a complete body string of 11 hexadecimal digits.', true);
      return;
    }

    this.state.parts = parts;
    this.populateBodyFields();
    preview.scheduleRebuild(this.state);
  }

  private importColors(preview: PlaygroundPreview): void {
    const value = this.fields.colorString.value.trim();
    const valid = /^\d{32}$/.test(value);
    this.fields.colorString.setCustomValidity(valid ? '' : 'Use exactly 32 digits.');

    if (!valid) {
      this.callbacks.onStatus('Color string must contain 32 digits.', true);
      return;
    }

    this.state.colorString = value;
    this.state.colors = readColorString(this.state.model as 'male' | 'female', value);
    this.populateColorFields();
    preview.updateColors(this.state.colors);
    this.callbacks.onStatus('Preview up to date');
  }

  destroy(): void {
    this.listeners.abort();
  }
}
