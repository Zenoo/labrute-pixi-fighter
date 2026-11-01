import { Application } from 'pixi.js';
import { FighterHolder } from 'fighter-benchmark';

const partKeys = ['p1', 'p1a', 'p1b', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p7b', 'p8'];
const colorKeys = ['col0', 'col0a', 'col0c', 'col1', 'col1a', 'col1b', 'col1c', 'col1d',
  'col2', 'col2a', 'col2b', 'col3', 'col3b', 'col4', 'col4a', 'col4b'];

window.runPerformance = async () => {
  const app = new Application();
  await app.init({ width: 960, height: 640, resolution: 1, preference: 'webgl', autoStart: false });
  document.body.appendChild(app.canvas);
  const gl = app.renderer.gl;
  const results = [];

  try {
    for (const count of [1, 8]) {
      const holders = [];
      const start = performance.now();

      for (let index = 0; index < count; index++) {
        const model = index % 2 ? 'female' : 'male';
        const body = model === 'female' ? '00100100610' : '01013100611';
        const holder = new FighterHolder(app, {
          type: 'brute', name: model, model, team: 'L', shield: false, width: 50, height: 80,
          parts: Object.fromEntries(partKeys.map((key, offset) => [key, parseInt(body[offset], 16)])),
          colors: Object.fromEntries(colorKeys.map((key) => [key, '#dd8844'])),
        }, { current: 1 }, 2);
        await holder.ready;
        holder.weapon = 'sword';
        holder.pause();
        holder.container.position.set(120 + index % 4 * 220, 260 + Math.floor(index / 4) * 300);
        app.stage.addChild(holder.container);
        holders.push(holder);
      }

      const initializeMs = performance.now() - start;
      const renderFrame = (frame) => {
        for (const holder of holders) holder.setAnimation('fist', frame % 16);
        app.render();
        gl.finish();
      };

      const firstFrameStart = performance.now();
      renderFrame(0);
      const firstFrameMs = performance.now() - firstFrameStart;
      const warmupStart = performance.now();
      for (let frame = 0; frame < 32; frame++) renderFrame(frame);
      const warmupMs = performance.now() - warmupStart;
      const samples = [];

      for (let repeat = 0; repeat < 5; repeat++) {
        const start = performance.now();
        for (let frame = 0; frame < 32; frame++) renderFrame(frame);
        samples.push((performance.now() - start) / 32);
        await new Promise(requestAnimationFrame);
      }

      const visible = (container) => container.visible
        ? [container, ...container.children.flatMap(visible)] : [];
      const active = holders.flatMap((holder) => visible(holder.container));
      const filters = active.reduce((total, container) => total + (container.filters?.length ?? 0), 0);
      const textures = new Set(holders.flatMap((holder) => holder.svgs.map((sprite) => sprite.texture.source)));
      const textureBytes = [...textures].reduce((total, source) => total + source.pixelWidth * source.pixelHeight * 4, 0);
      samples.sort((left, right) => left - right);
      results.push({ fighters: count, initializeMs, firstFrameMs, warmupMs,
        frameMs: samples[2], activeFilters: filters, textureBytes });
      for (const holder of holders) holder.destroy();
    }

    return { renderer: gl.getParameter(gl.RENDERER), results };
  } finally {
    app.destroy(true, { children: true });
  }
};
