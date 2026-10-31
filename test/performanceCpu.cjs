const { performance } = require('node:perf_hooks');
const path = require('node:path');
const { gzipSync, brotliCompressSync } = require('node:zlib');
const fs = require('node:fs');
const pixi = require('pixi.js');

const directory = path.resolve(process.argv[2] || 'dist');
global.gc?.();
const heapBefore = process.memoryUsage().heapUsed;
const importStart = performance.now();
const library = require(path.join(directory, 'Symbols.js'));
const importMs = performance.now() - importStart;
global.gc?.();
const dataHeapBytes = process.memoryUsage().heapUsed - heapBefore;

// Measure scene traversal separately from GPU work and asynchronous SVG decoding.
pixi.DOMAdapter.set({ ...pixi.DOMAdapter.get(), createCanvas: () => ({ getContext: () => null }) });
pixi.Assets.load = async () => pixi.Texture.EMPTY;
const app = {
  renderer: { resolution: 1, generateTexture: () => pixi.Texture.EMPTY },
  ticker: { add() {}, remove() {} },
};

const partKeys = ['p1', 'p1a', 'p1b', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p7b', 'p8'];
const colorKeys = ['col0', 'col0a', 'col0c', 'col1', 'col1a', 'col1b', 'col1c', 'col1d',
  'col2', 'col2a', 'col2b', 'col3', 'col3b', 'col4', 'col4a', 'col4b'];

function appearance(model) {
  const body = model === 'female' ? '00100100610' : '01013100611';
  return {
    type: model === 'male' || model === 'female' ? 'brute' : 'pet',
    name: model, model, team: 'L', shield: false, width: 50, height: 80,
    parts: Object.fromEntries(partKeys.map((key, index) => [key, parseInt(body[index], 16)])),
    colors: Object.fromEntries(colorKeys.map((key) => [key, '#dd8844'])),
  };
}

const median = (values) => values.slice().sort((left, right) => left - right)[Math.floor(values.length / 2)];

async function main() {
  const results = [];

  for (const model of ['male', 'female', 'dog', 'bear']) {
    const animation = model === 'male' || model === 'female' ? 'fist' : 'attack';
    const count = model === 'dog' ? 7 : model === 'bear' ? 19 : 16;
    const coldStart = performance.now();
    const holder = new library.FighterHolder(app, appearance(model), { current: 1 }, 2);
    await holder.ready;
    const initializeMs = performance.now() - coldStart;

    // Warm every pose/pool before timing steady-state animation work.
    for (let frame = 0; frame < 500; frame++) holder.setAnimation(animation, frame % count);
    const samples = [];

    for (let repeat = 0; repeat < 7; repeat++) {
      const start = performance.now();
      for (let frame = 0; frame < 1000; frame++) holder.setAnimation(animation, frame % count);
      samples.push((performance.now() - start) / 1000);
    }

    holder.destroy();
    const warm = [];

    for (let repeat = 0; repeat < 7; repeat++) {
      const start = performance.now();
      const next = new library.FighterHolder(app, appearance(model), { current: 1 }, 2);
      await next.ready;
      warm.push(performance.now() - start);
      next.destroy();
    }

    results.push({ model, initializeMs, warmInitializeMs: median(warm), poseMs: median(samples) });
  }

  const payload = fs.readFileSync(path.join(directory, 'symbol-data.cjs'));
  process.stdout.write(JSON.stringify({
    importMs, dataHeapBytes,
    dataBytes: payload.length,
    gzipBytes: gzipSync(payload, { level: 9 }).length,
    brotliBytes: brotliCompressSync(payload).length,
    results,
  }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
