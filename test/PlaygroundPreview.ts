import { Application, Rectangle, UPDATE_PRIORITY } from 'pixi.js';
import { FighterHolder } from '../src/Symbols';
import { animationSymbol } from './previewData';
import { animationModel, fighterAppearance, isBrute } from './playgroundState';
import type { PlaygroundState } from './playgroundState';

interface PreviewCallbacks {
  onStatus(message: string, error?: boolean): void;
  onPlayingChange(playing: boolean): void;
  onFrame(frame: number, frameCount: number): void;
}

/** Owns the Pixi lifecycle. Form controls never construct or destroy fighters. */
export class PlaygroundPreview {
  readonly speed = { current: 1 };

  /** Comparison subscribers are notified after a paused pose has been painted. */
  onPoseChange?: () => void;

  private readonly app = new Application();
  private readonly listeners = new AbortController();
  private readonly interruptions = new Set<string>();
  private readonly resizeObserver: ResizeObserver;
  private readonly visibilityObserver: IntersectionObserver;

  private fighter?: FighterHolder;
  private pendingFighter?: FighterHolder;
  private state?: PlaygroundState;
  private revision = 0;
  private rebuildTimer?: ReturnType<typeof setTimeout>;
  private scrollTimer?: ReturnType<typeof setTimeout>;
  private renderRequest?: number;
  private queuedColors?: Record<string, string>;
  private playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: PreviewCallbacks,
  ) {
    this.resizeObserver = new ResizeObserver(() => {
      this.app.resize();
      this.positionFighter();
      this.requestRender();
    });

    this.visibilityObserver = new IntersectionObserver(([entry]) => {
      this.interrupt('offscreen', !entry.isIntersecting);
    });
  }

  async initialize(): Promise<void> {
    await this.app.init({
      resizeTo: this.container,
      backgroundAlpha: 0,
      preference: 'webgl',
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    // Source animations run at 30 fps at normal speed. Do not render at the
    // monitor's refresh rate unless the requested playback speed needs it.
    this.app.ticker.maxFPS = 30;
    this.app.stop();
    this.app.canvas.setAttribute('aria-label', 'Animated fighter');
    this.container.appendChild(this.app.canvas);
    this.app.ticker.add(this.updateTimeline, this, UPDATE_PRIORITY.LOW);

    this.resizeObserver.observe(this.container);
    this.visibilityObserver.observe(this.container);
    this.callbacks.onPlayingChange(this.playing);

    document.addEventListener(
      'visibilitychange',
      () => {
        this.interrupt('hidden', document.hidden);
      },
      { signal: this.listeners.signal },
    );

    // Keep the last pose visible while scrolling; resume after scrolling settles.
    window.addEventListener(
      'scroll',
      () => {
        this.interrupt('scrolling', true);
        clearTimeout(this.scrollTimer);
        this.scrollTimer = setTimeout(() => this.interrupt('scrolling', false), 120);
      },
      { passive: true, signal: this.listeners.signal },
    );
  }

  /** Only model, body, facing, and scale changes need a replacement fighter. */
  scheduleRebuild(state: PlaygroundState): void {
    this.state = state;
    this.revision++;
    this.pendingFighter?.destroy();
    this.pendingFighter = undefined;
    clearTimeout(this.rebuildTimer);
    this.interrupt('loading', true);

    this.rebuildTimer = setTimeout(() => void this.rebuild(), 120);
  }

  private async rebuild(): Promise<void> {
    if (!this.state || this.disposed) return;

    const revision = this.revision;
    const state = this.state;
    let next: FighterHolder | undefined;
    this.callbacks.onStatus('Updating preview…');

    try {
      const scale = state.scale * (state.model === 'panther' ? 1.5 : 1);
      next = new FighterHolder(this.app, fighterAppearance(state), this.speed, scale);
      this.pendingFighter = next;
      await next.ready;

      // A newer form change or page disposal can overtake asynchronous SVG loads.
      if (revision !== this.revision || this.disposed) {
        next.destroy();
        return;
      }

      this.fighter?.destroy();
      this.fighter = next;
      this.pendingFighter = undefined;
      this.app.stage.addChild(next.container);
      next.shadow.alpha = 1;

      next.setColors(state.colors);
      this.positionFighter();

      next.on('*', (event) => {
        if (this.fighter === next && event === `${state.animation}:end`) {
          this.setPlaying(false);
        }
      });

      window.fighter = next;
      this.interrupt('loading', false);
      this.updatePlayback(state);
      this.callbacks.onStatus('Preview up to date');
    } catch (error) {
      next?.destroy();

      if (revision === this.revision && !this.disposed) {
        this.pendingFighter = undefined;
        this.callbacks.onStatus('Could not render this appearance. Try another variation.', true);
        console.error(error);
      }
    }
  }

  updatePlayback(state: PlaygroundState): void {
    this.state = state;

    if (!this.fighter || this.interruptions.has('loading')) return;

    this.fighter.weapon = isBrute(state.model) ? state.weapon : null;
    this.fighter.shield = isBrute(state.model) && state.shield;
    this.fighter.setAnimation(state.animation);
    this.updateTicker();
    this.updateTimeline();
    this.requestRender();
  }

  /** Coalesce continuous color-picker events into one repaint per browser frame. */
  updateColors(colors: Record<string, string>): void {
    this.queuedColors = { ...colors };
    this.requestRender();
  }

  setSpeed(speed: number): void {
    this.speed.current = speed;
    this.app.ticker.maxFPS = 30 * speed;
  }

  togglePlaying(): void {
    const frame = this.fighter?.capturePlaybackFrame().frame ?? 0;

    if (!this.playing && frame >= this.frameCount() - 1 && this.state) {
      this.updatePlayback(this.state);
    }

    this.setPlaying(!this.playing);
  }

  private setPlaying(playing: boolean): void {
    this.playing = playing;
    this.callbacks.onPlayingChange(playing);
    this.updateTicker();
  }

  seek(frame: number): void {
    if (!this.fighter || !this.state) return;

    this.fighter.setAnimation(this.state.animation, frame);
    this.setPlaying(false);
    this.updateTimeline();
    this.requestRender();
  }

  /** Native color dialogs should not compete with a continuously rendered canvas. */
  interrupt(reason: string, active: boolean): void {
    if (active) this.interruptions.add(reason);
    else this.interruptions.delete(reason);

    this.updateTicker();
  }

  private updateTicker(): void {
    if (this.disposed) return;

    if (this.playing && this.fighter && this.interruptions.size === 0) {
      this.fighter.play();
      this.app.start();
    } else {
      this.fighter?.pause();
      this.app.stop();
    }
  }

  private requestRender(): void {
    if (this.renderRequest !== undefined || this.disposed) return;

    this.renderRequest = requestAnimationFrame(() => {
      this.renderRequest = undefined;

      if (this.queuedColors && this.fighter) {
        this.fighter.setColors(this.queuedColors);
        this.queuedColors = undefined;
      }

      // A stopped ticker still needs a single render after an edit or resize.
      if (!this.app.ticker.started) this.app.render();
      if (!this.playing) this.onPoseChange?.();
    });
  }

  private frameCount(): number {
    if (!this.state) return 1;

    return (
      animationSymbol(animationModel(this.state.model), this.state.animation)?.frames?.length ?? 1
    );
  }

  private updateTimeline = (): void => {
    const frame = Math.floor(this.fighter?.capturePlaybackFrame().frame ?? 0);
    this.callbacks.onFrame(frame, this.frameCount());
  };

  private positionFighter(): void {
    this.fighter?.container.position.set(this.app.screen.width / 2, this.app.screen.height * 0.72);
  }

  /** Capture at a fixed origin and size, excluding the game-only shadow. */
  captureComparison(frame?: number) {
    if (!this.fighter || !this.state) throw new Error('Wait for the fighter to finish loading');

    const fighter = this.fighter;
    const displayed = fighter.capturePlaybackFrame();
    const selected = frame ?? Math.floor(displayed.frame);
    const position = fighter.container.position.clone();
    const shadowVisible = fighter.shadow.visible;
    const symbol = animationSymbol(animationModel(this.state.model), this.state.animation);

    fighter.pause();

    try {
      fighter.setAnimation(this.state.animation, selected);
      fighter.container.position.set(320, 480 * 0.72);
      fighter.shadow.visible = false;

      const canvas = this.app.renderer.extract.canvas({
        target: this.app.stage,
        frame: new Rectangle(0, 0, 640, 480),
        resolution: 1,
      }) as HTMLCanvasElement;

      return {
        canvas,
        options: {
          ...fighterAppearance(this.state),
          symbolId: Number(symbol.name.slice(6)),
          frame: selected,
          width: 640,
          height: 480,
          scale: this.state.scale * (this.state.model === 'panther' ? 1.5 : 1),
        },
        frameCount: symbol.frames?.length ?? 1,
      };
    } finally {
      fighter.container.position.copyFrom(position);
      fighter.shadow.visible = shadowVisible;
      fighter.renderPlaybackFrame(displayed);
      this.updateTicker();
    }
  }

  destroy(): void {
    this.disposed = true;
    this.revision++;
    clearTimeout(this.rebuildTimer);
    clearTimeout(this.scrollTimer);

    if (this.renderRequest !== undefined) cancelAnimationFrame(this.renderRequest);

    this.listeners.abort();
    this.resizeObserver.disconnect();
    this.visibilityObserver.disconnect();
    this.pendingFighter?.destroy();
    this.fighter?.destroy();
    this.app.destroy(true);
  }
}
