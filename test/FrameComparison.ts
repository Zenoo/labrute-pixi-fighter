import type { PlaygroundPreview } from './PlaygroundPreview';

interface RufflePlayer extends HTMLElement {
  load(options: Record<string, unknown>): Promise<void>;
  pause(): void;
  play(): void;
  traceObserver: ((message: string) => void) | null;
  remove(): void;
}

declare global {
  interface Window {
    RufflePlayer?: {
      config: Record<string, unknown>;
      newest?(): { createPlayer(): RufflePlayer };
    };
  }
}

/** Keep source rendering independent: Ruffle consumes original SWF records. */
export class FrameComparison {
  private readonly status = document.getElementById('comparison-status')!;
  private readonly reference = document.getElementById('comparison-reference')!;
  private readonly sourceCanvas = document.createElement('canvas');
  private readonly pixi = document.getElementById('comparison-pixi') as HTMLCanvasElement;
  private readonly difference = document.getElementById('comparison-difference') as HTMLCanvasElement;
  private readonly follow = document.getElementById('comparison-follow') as HTMLInputElement;
  private readonly threshold = document.getElementById('comparison-threshold') as HTMLInputElement;
  private readonly overlay = document.getElementById('comparison-overlay') as HTMLInputElement;
  private readonly listeners = new AbortController();
  private player?: RufflePlayer;
  private pending?: ReturnType<typeof setTimeout>;
  private revision = 0;
  private disposed = false;
  private scanning = false;
  private cancelScan = false;
  private readonly resizeObserver: ResizeObserver;
  private sourcePixels?: ImageData;
  private pixiPixels?: ImageData;
  private ruffleLoading?: Promise<void>;
  private comparisonQueue: Promise<void> = Promise.resolve();
  private provenance?: Record<string, unknown>;
  private reportUrl?: string;

  constructor(private readonly preview: PlaygroundPreview) {
    const signal = this.listeners.signal;
    this.sourceCanvas.width = 640;
    this.sourceCanvas.height = 480;
    this.sourceCanvas.style.position = 'absolute';
    this.sourceCanvas.style.inset = '0';
    this.sourceCanvas.style.pointerEvents = 'none';
    document.getElementById('comparison-capture')!.addEventListener('click',
      () => void this.compare(), { signal });
    this.threshold.addEventListener('input', () => this.drawDifference(), { signal });
    this.overlay.addEventListener('change', () => this.drawDifference(), { signal });
    document.getElementById('comparison-actual-size')!.addEventListener('change', (event) => {
      const checkbox = event.target as HTMLInputElement;
      document.querySelector('.comparison-frames')!.classList.toggle('actual-size', checkbox.checked);
    }, { signal });
    document.getElementById('comparison-scan')!.addEventListener('click',
      () => void this.scan(), { signal });
    document.getElementById('comparison-cancel')!.addEventListener('click',
      () => { this.cancelScan = true; }, { signal });
    this.resizeObserver = new ResizeObserver(([entry]) => {
      this.reference.style.transform = `scale(${entry.contentRect.width / 640})`;
    });
    this.resizeObserver.observe(this.reference.parentElement!);
    preview.onPoseChange = () => {
      if (!this.follow.checked || this.scanning) return;
      clearTimeout(this.pending);
      this.pending = setTimeout(() => void this.compare(), 180);
    };
  }

  private async loadRuffle(): Promise<void> {
    if (window.RufflePlayer?.newest) return;
    if (this.ruffleLoading) return this.ruffleLoading;

    window.RufflePlayer = { config: {
      publicPath: '/ruffle/',
      autoplay: 'on',
      unmuteOverlay: 'hidden',
      backgroundColor: '#ffffff',
      wmode: 'transparent',
      // Ruffle's Canvas fallback omits effects used by the dog attack. Prefer
      // the full renderer so the reference includes the original Flash filters.
      preferredRenderer: 'wgpu-webgl',
      allowScriptAccess: false,
      contextMenu: 'off',
      letterbox: 'off',
    } } as Window['RufflePlayer'];

    this.ruffleLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/ruffle/ruffle.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Could not load the local Ruffle runtime'));
      document.head.appendChild(script);
    });
    return this.ruffleLoading;
  }

  compare(frame?: number): Promise<void> {
    // Player.load() replaces a WASM movie. Serialize requests so rapid slider
    // edits cannot load a stale source movie over a newer comparison.
    this.comparisonQueue = this.comparisonQueue.then(() => this.renderComparison(frame));
    return this.comparisonQueue;
  }

  private async renderComparison(frame?: number): Promise<void> {
    if (this.disposed) return;
    const revision = ++this.revision;
    this.status.dataset.state = 'loading';
    this.status.textContent = 'Rendering the source SWF…';

    try {
      const capture = this.preview.captureComparison(frame);
      if (!this.provenance) {
        const response = await fetch('/comparison/manifest.json');
        if (!response.ok) throw new Error('Could not read the source SWF provenance');
        this.provenance = await response.json();
      }

      if (!this.provenance!.matchesGenerated) {
        throw new Error('The source SWF changed. Run npm run export:swf and restart the playground.');
      }

      await this.loadRuffle();
      if (this.disposed || revision !== this.revision) return;

      const response = await fetch('/comparison/frame.swf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capture.options),
      });

      if (!response.ok) throw new Error((await response.json()).error);

      const bytes = new Uint8Array(await response.arrayBuffer());
      if (this.disposed || revision !== this.revision) return;

      // Reuse one player. Its movie is replaced rather than accumulating WASM
      // instances and graphics contexts as the frame slider is scrubbed.
      if (!this.player) {
        this.player = window.RufflePlayer!.newest!().createPlayer();
        this.player.style.width = '640px';
        this.player.style.height = '480px';
        this.player.style.opacity = '0';
        this.reference.replaceChildren(this.player, this.sourceCanvas);
      }

      // The trace observer belongs to a loaded WASM instance. Loading with
      // autoplay disabled lets us install it before the first Flash frame.
      await this.player.load({ data: bytes, autoplay: 'off' });
      let readyTimer: ReturnType<typeof setTimeout> | undefined;
      const sourceReady = new Promise<void>((resolve, reject) => {
        readyTimer = setTimeout(() => reject(new Error('Source SWF did not initialize')), 10000);
        this.player!.traceObserver = (message) => {
          if (message === `source-ready:${capture.options.symbolId}:${capture.options.frame}`) resolve();
        };
      });

      try {
        this.player.play();
        await sourceReady;
      } finally {
        clearTimeout(readyTimer);
        this.player.traceObserver = null;
      }
      if (this.disposed || revision !== this.revision) return;

      this.player.pause();
      const pixiContext = this.pixi.getContext('2d')!;
      pixiContext.clearRect(0, 0, 640, 480);
      pixiContext.drawImage(capture.canvas, 0, 0);
      this.pixiPixels = pixiContext.getImageData(0, 0, 640, 480);

      const source = this.player.shadowRoot?.querySelector('canvas');
      if (!source) throw new Error('Ruffle did not expose its rendered canvas');

      const context = this.sourceCanvas.getContext('2d')!;
      context.clearRect(0, 0, 640, 480);
      context.drawImage(source, 0, 0, 640, 480);
      this.sourcePixels = context.getImageData(0, 0, 640, 480);
      this.status.dataset.frame = String(capture.options.frame);
      this.status.dataset.frameCount = String(capture.frameCount);
      this.status.dataset.model = capture.options.model;
      this.drawDifference();
      this.status.dataset.state = 'ready';
    } catch (error) {
      if (revision !== this.revision) return;
      this.status.textContent = error instanceof Error ? error.message : String(error);
      this.status.dataset.state = 'error';
      console.error(error);
    }
  }

  async scan(): Promise<void> {
    if (this.scanning) return;

    const button = document.getElementById('comparison-scan') as HTMLButtonElement;
    const cancel = document.getElementById('comparison-cancel') as HTMLButtonElement;
    const captureButton = document.getElementById('comparison-capture') as HTMLButtonElement;
    const report = document.getElementById('comparison-report')!;
    this.scanning = true;
    this.cancelScan = false;
    button.disabled = true;
    captureButton.disabled = true;
    cancel.disabled = false;
    const results: { frame: number; changed: number; occupied: number }[] = [];

    try {
      const initial = this.preview.captureComparison(0);
      const appearanceKey = (options: typeof initial.options) => JSON.stringify({ ...options, frame: 0 });
      const expected = appearanceKey(initial.options);

      for (let frame = 0; frame < initial.frameCount; frame++) {
        if (this.cancelScan || this.disposed) break;
        if (appearanceKey(this.preview.captureComparison(frame).options) !== expected) {
          throw new Error('Appearance changed during the scan. Run it again for the new appearance.');
        }

        await this.compare(frame);
        if (this.status.dataset.state === 'error') throw new Error(this.status.textContent!);
        results.push({
          frame,
          changed: Number(this.status.dataset.changed),
          occupied: Number(this.status.dataset.occupied),
        });
        this.status.textContent = `Compared ${frame + 1} / ${initial.frameCount} frames. `
          + `Frame ${frame}: ${this.status.dataset.changed} differing pixels.`;
      }

      const download = document.createElement('a');
      const data = {
        reference: 'Original SWF records rendered by Ruffle; appearance applied to a frozen display list',
        source: this.provenance,
        appearance: initial.options,
        tolerance: Number(this.threshold.value),
        complete: results.length === initial.frameCount,
        results,
      };
      if (this.reportUrl) URL.revokeObjectURL(this.reportUrl);
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      this.reportUrl = url;
      download.href = url;
      download.download = `swf-comparison-${initial.options.model}-${initial.options.symbolId}.json`;
      download.textContent = `Download report (${results.length} frames)`;
      report.replaceChildren(download);
      report.hidden = false;
    } catch (error) {
      this.status.textContent = error instanceof Error ? error.message : String(error);
      this.status.dataset.state = 'error';
    } finally {
      this.scanning = false;
      button.disabled = false;
      captureButton.disabled = false;
      cancel.disabled = true;
    }
  }

  private drawDifference(): void {
    if (!this.sourcePixels || !this.pixiPixels) return;

    const threshold = Number(this.threshold.value);
    const output = new ImageData(640, 480);
    const source = this.sourcePixels.data;
    const pixi = this.pixiPixels.data;
    let changed = 0;
    let occupied = 0;

    for (let offset = 0; offset < source.length; offset += 4) {
      // Compare premultiplied RGBA so invisible RGB does not count as a mismatch.
      let maximum = Math.abs(source[offset + 3] - pixi[offset + 3]);

      for (let channel = 0; channel < 3; channel++) {
        maximum = Math.max(maximum, Math.abs(
          source[offset + channel] * source[offset + 3] / 255
          - pixi[offset + channel] * pixi[offset + 3] / 255,
        ));
      }

      if (source[offset + 3] || pixi[offset + 3]) occupied++;
      if (maximum > threshold) changed++;
      output.data[offset] = maximum > threshold ? 235 : 240;
      output.data[offset + 1] = maximum > threshold ? 40 : 243;
      output.data[offset + 2] = maximum > threshold ? 100 : 247;
      output.data[offset + 3] = 255;
    }

    this.difference.getContext('2d')!.putImageData(output, 0, 0);
    const pixiContext = this.pixi.getContext('2d')!;
    pixiContext.putImageData(this.pixiPixels, 0, 0);

    if (this.overlay.checked) {
      pixiContext.globalAlpha = 0.5;
      pixiContext.drawImage(this.sourceCanvas, 0, 0);
      pixiContext.globalAlpha = 1;
    }
    this.status.textContent = `${this.status.dataset.model}, frame ${Number(this.status.dataset.frame) + 1}`
      + ` / ${this.status.dataset.frameCount}: ${changed.toLocaleString()} differing pixels / `
      + `${occupied.toLocaleString()} occupied pixels (tolerance ${threshold}/255). `
      + 'Rasterizers may differ at edges.';
    this.status.dataset.changed = String(changed);
    this.status.dataset.occupied = String(occupied);
  }

  destroy(): void {
    this.disposed = true;
    this.revision++;
    clearTimeout(this.pending);
    this.listeners.abort();
    this.resizeObserver.disconnect();
    if (this.reportUrl) URL.revokeObjectURL(this.reportUrl);
    this.preview.onPoseChange = undefined;
    this.player?.remove();
  }
}
