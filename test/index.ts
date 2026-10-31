import { PlaygroundControls } from './PlaygroundControls';
import { PlaygroundPreview } from './PlaygroundPreview';
import { FrameComparison } from './FrameComparison';
import type { FighterHolder } from '../src/Symbols';

// Keep bootstrapping here; form behavior and Pixi lifecycle live in their own modules.
async function main(): Promise<void> {
  const controls = new PlaygroundControls();
  const preview = new PlaygroundPreview(controls.previewContainer, controls.callbacks);

  await preview.initialize();
  controls.connect(preview);
  const comparison = new FrameComparison(preview);
  window.comparison = comparison;

  window.addEventListener(
    'pagehide',
    () => {
      controls.destroy();
      comparison.destroy();
      preview.destroy();
    },
    { once: true },
  );
}

main().catch((error) => {
  const status = document.getElementById('status');

  if (status) {
    status.textContent = 'Renderer could not start. Check that WebGL is available.';
    status.dataset.state = 'error';
  }

  console.error(error);
});

declare global {
  interface Window {
    fighter: FighterHolder;
    comparison: FrameComparison;
  }
}
