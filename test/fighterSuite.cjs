const assert = require('node:assert/strict');
const { test } = require('node:test');

module.exports = (pixi, { FighterHolder, Symbol475, Symbol385, Symbol121 }) => {
// Exercise real Pixi filters and objects; only rasterization and GPU probing
// need substitutes in Node. The browser regression uses the real renderer.
pixi.DOMAdapter.set({ ...pixi.DOMAdapter.get(), createCanvas: () => ({ getContext: () => null }) });
const loads = [];
const colorBakes = [];
let pending = null;
pixi.Assets.load = async (request) => {
  loads.push(request);
  if (pending) await pending;
  const cached = pixi.Assets.cache.get('fighter-test-texture');
  assert.equal(cached, pixi.Texture.EMPTY);
  return cached;
};
pixi.Assets.cache.set('fighter-test-texture', pixi.Texture.EMPTY);
const appearance = (overrides = {}) => ({
  type: 'brute',
  name: 'test',
  model: 'male',
  team: 'L',
  shield: false,
  parts: Object.fromEntries(
    ['p1', 'p1a', 'p1b', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p7b', 'p8'].map((key) => [key, 0]),
  ),
  colors: Object.fromEntries(
    [
      'col0',
      'col0a',
      'col0c',
      'col1',
      'col1a',
      'col1b',
      'col1c',
      'col1d',
      'col2',
      'col2a',
      'col2b',
      'col3',
      'col3b',
      'col4',
      'col4a',
      'col4b',
    ].map((key) => [key, '#ffffff']),
  ),
  width: 50,
  height: 80,
  ...overrides,
});

const application = (resolution = 1) => {
  const handlers = new Set();
  return {
    renderer: { resolution, generateTexture: (target) => {
      // This is the cross-runtime instanceof check that originally failed.
      const container = target.target ?? target;
      assert.ok(container instanceof pixi.Container);
      if (target.target) colorBakes.push({
        name: container.label,
        matrices: (container.filters ?? []).filter((filter) => filter instanceof pixi.ColorMatrixFilter)
          .map((filter) => [...filter.matrix]),
      });
      return pixi.Texture.EMPTY;
    } },
    ticker: {
      elapsedMS: 34,
      add: (handler) => handlers.add(handler),
      remove: (handler) => handlers.delete(handler),
      tick: () => [...handlers].forEach((handler) => handler()),
      handlers,
    },
  };
};

test('package retains symbol exports and exports the renderer', () => {
  assert.equal(Symbol475.name, 'Symbol475');
  assert.equal(typeof FighterHolder, 'function');
  assert.equal(Symbol121.frames[0], Symbol121.frames[1], 'Held frames should share their placement array');
});

test('renders every model, reuses sprites, and detaches its ticker on destroy', async () => {
  for (const model of ['male', 'female', 'dog', 'bear']) {
    const app = application();
    const holder = new FighterHolder(
      app,
      appearance({ model, type: model === 'dog' || model === 'bear' ? 'pet' : 'brute' }),
      { current: 1 },
      2,
    );
    await holder.ready;
    assert.ok(holder.container instanceof pixi.Container);
    assert.ok(holder.shadow instanceof pixi.Container);
    assert.ok(holder.svgs.every((sprite) => sprite instanceof pixi.Container));
    assert.equal(holder.loaded, true);
    assert.equal(app.ticker.handlers.size, 1);
    assert.equal(holder.baseWidth, 100);
    assert.equal(holder.baseHeight, 160);
    assert.equal(holder.container.scale.x, model === 'dog' ? -1 : 1);
    holder.weapon = 'sword';
    holder.shield = true;
    holder.setAnimation('idle');
    const sprites = [...holder.svgs];
    holder.setAnimation('idle');
    assert.deepEqual(holder.svgs, sprites);
    assert.ok(sprites.some((sprite) => sprite.visible));
    app.ticker.tick();
    holder.destroy();
    holder.destroy();
    assert.equal(app.ticker.handlers.size, 0);
    assert.equal(holder.container.destroyed, true);
    assert.equal(pixi.Texture.EMPTY.destroyed, false);
  }
});

test('shares SVG textures and increases rasterization resolution for larger models', async () => {
  const first = new FighterHolder(application(), appearance(), { current: 1 });
  await first.ready;
  const count = loads.length;
  const second = new FighterHolder(application(), appearance(), { current: 1 });
  await second.ready;
  assert.equal(loads.length, count);
  const larger = new FighterHolder(application(2), appearance(), { current: 1 }, 3);
  await larger.ready;
  assert.ok(loads.length > count);
  assert.ok(loads.slice(count).some(({ data }) => data.resolution >= 6));
  assert.ok(loads.every(({ data }) => data.parseAsGraphicsContext === false));
  [first, second, larger].forEach((holder) => holder.destroy());
});

test('thin strokes scale with fighter size and DPR without magnifying nested SVG units', async () => {
  const source = Symbol385.parts.find((part) => part.type === 'svg').svg;
  const signature = source.match(/\bd="([^"]+)"/)[1];
  const authored = [...source.matchAll(/\sstroke-width="([^"]+)"/g)].map((match) => Number(match[1]));

  for (const [scale, resolution] of [[0.75, 1], [2.75, 1], [2.75, 2]]) {
    const config = appearance();
    config.parts.p3 = 3;
    const before = loads.length;
    const holder = new FighterHolder(application(resolution), config, { current: 1 }, scale);
    await holder.ready;
    try {
      let checked = 0;
      for (const request of loads.slice(before)) {
        const svg = decodeURIComponent(request.src.slice(request.src.indexOf(',') + 1));
        if (!svg.includes(signature)) continue;
        const widths = [...svg.matchAll(/\sstroke-width="([^"]+)"/g)].map((match) => Number(match[1]));
        assert.equal(widths.length, authored.length);
        for (let index = 0; index < widths.length; index++) {
          const expected = Math.max(authored[index], scale * resolution / request.data.resolution);
          assert.ok(Math.abs(widths[index] - expected) < 1e-10,
            `Incorrect stroke width at scale ${scale}, DPR ${resolution}`);
          checked++;
        }
      }
      assert.ok(checked > 0, 'The regression did not rasterize any thin outlines');
      const count = loads.length;
      const matching = new FighterHolder(application(resolution), config, { current: 1 }, scale);
      await matching.ready;
      assert.equal(loads.length, count, 'Matching stroke textures were not shared');
      matching.destroy();
    } finally {
      holder.destroy();
    }
  }
});

test('nearby fighter scales cannot share incompatible base or colored stroke textures', async () => {
  const originalLoad = pixi.Assets.load;
  const holders = [];
  pixi.Assets.load = async (request) => {
    loads.push(request);
    const texture = new pixi.Texture({ source: new pixi.TextureSource({ width: 24, height: 24 }) });
    return texture;
  };
  try {
    const app = application();
    const config = appearance();
    config.parts.p3 = 3;
    config.colors = Object.fromEntries(Object.keys(config.colors).map((key) => [key, '#dd8844']));
    const captures = [];
    for (const scale of [2.751, 2.752]) {
      const before = loads.length;
      const baked = colorBakes.length;
      const holder = new FighterHolder(app, config, { current: 1 }, scale);
      holders.push(holder);
      await holder.ready;
      holder.setAnimation('idle');
      assert.ok(colorBakes.length > baked, 'A different stroke minimum reused colored pixels');
      captures.push(loads.slice(before));
    }
    // At these nearby scales, integer raster buckets overlap. Different stroke
    // minima must still produce distinct source URLs and colored variants.
    const source = Symbol385.parts.find((part) => part.type === 'svg').svg;
    const signature = source.match(/\bd="([^"]+)"/)[1];
    const find = (requests) => requests.find((request) => decodeURIComponent(request.src).includes(signature));
    const first = find(captures[0]);
    const second = find(captures[1]);
    assert.ok(first && second, 'A different stroke minimum reused a base texture');
    assert.equal(first.data.resolution, second.data.resolution, 'Regression needs a shared raster bucket');
    assert.notEqual(first.src, second.src, 'Stroke minima collided in the SVG cache');
  } finally {
    holders.forEach((holder) => holder.destroy());
    pixi.Assets.load = originalLoad;
  }
});

test('supports seeking, playback restoration, equipment changes and reverse events', async () => {
  const app = application();
  const holder = new FighterHolder(app, appearance(), { current: 1 });
  await holder.ready;
  holder.setAnimation('fist', 2);
  const saved = holder.capturePlaybackFrame();
  holder.setAnimation('run', 0, true);
  holder.setAirborn(true, true);
  assert.equal(holder.animation, 'fist');
  assert.equal(holder.seekPose.animation, 'run');
  assert.equal(holder.seekPose.airborne, true);
  holder.setAnimation('run');
  holder.weapon = 'axe';
  holder.shield = true;
  holder.renderPlaybackFrame(saved);
  assert.deepEqual(holder.capturePlaybackFrame(), saved);
  app.ticker.tick();
  assert.deepEqual(holder.capturePlaybackFrame(), saved);
  holder.weapon = null;
  holder.renderPlaybackFrame(saved);
  assert.ok(
    holder.svgs.filter((sprite) => sprite.label === 'Symbol39').every((sprite) => !sprite.visible),
  );
  const events = [];
  holder.once('fist:start', (event) => events.push(event));
  holder.animationSpeed = -1;
  holder.setAnimation('fist', 1);
  app.ticker.tick();
  app.ticker.tick();
  assert.deepEqual(events, ['fist:start']);
  holder.destroy();
});

test('supports caller styling and dynamic idle animation overrides', async () => {
  const filter = { resolution: 1 };
  const holder = new FighterHolder(
    application(),
    appearance({ filters: [filter], idleAnimation: 'monk' }),
    { current: 1 },
  );
  await holder.ready;
  holder.setAnimation('idle');
  assert.equal(holder.animation, 'monk');
  assert.equal(filter.resolution, 'inherit');
  holder.idleAnimation = 'idle';
  holder.setAnimation('idle');
  assert.equal(holder.animation, 'idle');
  holder.destroy();
});

test('recolors the current pose without replacing sprites, loading assets or advancing playback', async () => {
  const app = application();
  const holder = new FighterHolder(app, appearance(), { current: 1 });

  // Applying colors before readiness should also be safe for asynchronous callers.
  holder.setColors({ col0: '#ff0000' });
  await holder.ready;
  holder.setAnimation('fist', 2);
  holder.pause();

  const pose = holder.capturePlaybackFrame();
  const sprites = [...holder.svgs];
  const assetLoadCount = loads.length;
  const green = Object.fromEntries(Object.keys(appearance().colors).map((key) => [key, '#00ff00']));

  holder.setColors(green);

  assert.deepEqual(holder.capturePlaybackFrame(), pose);
  assert.deepEqual(holder.svgs, sprites);
  assert.equal(loads.length, assetLoadCount);
  assert.ok(colorBakes.some((bake) => bake.matrices.some((matrix) =>
    matrix[4] === -1 && matrix[9] === 0 && matrix[14] === -1)));

  app.ticker.tick();
  assert.deepEqual(holder.capturePlaybackFrame(), pose);

  holder.play();
  app.ticker.tick();
  app.ticker.tick();
  assert.equal(holder.capturePlaybackFrame().frame, 3);

  holder.destroy();
  assert.doesNotThrow(() => holder.setColors(green));
});

test('armor 6 colors reused shapes by placement rather than their shared symbol name', async () => {
  const config = appearance();
  config.parts.p7 = 6;
  config.colors.col0 = '#112233';
  config.colors.col2 = '#ee7744';
  const holder = new FighterHolder(application(), config, { current: 1 });
  await holder.ready;
  const before = colorBakes.length;
  holder.setAnimation('idle');

  const offsets = colorBakes.slice(before).filter((bake) => bake.name === 'Symbol81')
    .flatMap((bake) => bake.matrices).map((matrix) => Math.round(matrix[4] * 255));

  assert.ok(offsets.includes(0x11 - 255), 'Skin placement lost its color slot');
  assert.ok(offsets.includes(0xee - 255), 'Armor placement incorrectly reused the skin color slot');
  holder.destroy();
});

test('male and female irises follow col3 through cached live recoloring', async () => {
  for (const [model, irisName] of [['male', 'Symbol346'], ['female', 'Symbol355Iris']]) {
    const config = appearance({ model });
    config.colors.col3 = '#ff0000';
    const holder = new FighterHolder(application(), config, { current: 1 });
    await holder.ready;
    const before = colorBakes.length;
    holder.setAnimation('idle');
    const sprites = [...holder.svgs];
    const assetLoads = loads.length;

    assert.ok(colorBakes.slice(before).some((bake) => bake.name === irisName
      && bake.matrices.some((matrix) => matrix[4] === 0 && matrix[9] === -1 && matrix[14] === -1)),
    `${model}: iris did not use col3`);

    const recolor = colorBakes.length;
    holder.setColors({ col3: '#00ff00' });
    assert.ok(colorBakes.slice(recolor).some((bake) => bake.name === irisName
      && bake.matrices.some((matrix) => matrix[4] === -1 && matrix[9] === 0 && matrix[14] === -1)),
    `${model}: iris did not update with col3`);
    assert.deepEqual(holder.svgs, sprites);
    assert.equal(loads.length, assetLoads);
    holder.destroy();
  }
});

test('steady playback reuses colored textures and does not serialize filter settings', async () => {
  const config = appearance();
  config.parts.p3 = 3;
  config.colors = Object.fromEntries(Object.keys(config.colors).map((key) => [key, '#dd8844']));
  const holder = new FighterHolder(application(), config, { current: 1 });
  await holder.ready;
  for (let frame = 0; frame < 16; frame++) holder.setAnimation('fist', frame);
  const baked = colorBakes.length;
  const loaded = loads.length;
  const stringify = JSON.stringify;
  let serializations = 0;

  try {
    JSON.stringify = (...args) => { serializations++; return stringify(...args); };
    for (let frame = 0; frame < 160; frame++) holder.setAnimation('fist', frame % 16);
  } finally {
    JSON.stringify = stringify;
  }

  assert.equal(serializations, 0, 'Playback serialized static placement metadata');
  assert.equal(colorBakes.length, baked, 'Playback regenerated an unchanged colored texture');
  assert.equal(loads.length, loaded, 'Playback reloaded SVG assets');
  holder.destroy();
});

test('male set 4 includes shoulder pads only when clothing details are enabled', async () => {
  const visibleArt = (container) => container.visible
    ? [container.label, ...container.children.flatMap(visibleArt)] : [];

  for (const detail of [0, 1]) {
    const config = appearance();
    config.parts.p7 = 4;
    config.parts.p7b = 4;
    config.parts.p1 = detail;
    const holder = new FighterHolder(application(), config, { current: 1 });
    await holder.ready;

    for (const animation of ['idle', 'win']) {
      holder.setAnimation(animation, animation === 'win' ? 25 : 0);
      const visible = visibleArt(holder.container);

      // FFDec sprite 442, frame 2, is the broad shoulder pad in the report.
      // Check its SVG artwork, rather than an empty wrapper's visibility.
      for (const name of ['Symbol437', 'Symbol439', 'Symbol441']) {
        assert.equal(visible.includes(name), detail === 1,
          `${animation}: ${name} did not follow clothing detail selection`);
      }
    }

    holder.destroy();
  }
});

test('portrait outfits 6a/6b and 7a/7b render their distinct clothing details', async () => {
  const visibleArt = (container) => container.visible
    ? [container.label, ...container.children.flatMap(visibleArt)] : [];

  for (const model of ['male', 'female']) {
    for (const set of [5, 6]) {
      const variants = [];
      for (const detail of [0, 1]) {
        const config = appearance({ model });
        Object.assign(config.parts, { p7: set, p7b: set, p1: detail });
        const holder = new FighterHolder(application(), config, { current: 1 });
        await holder.ready;
        holder.setAnimation('idle');
        variants.push(visibleArt(holder.container));
        if (model === 'female' && set === 6) {
          const visible = (sprite) => sprite.visible && (!sprite.parent || visible(sprite.parent));
          assert.equal(holder.svgs.filter(sprite => sprite.label === 'Symbol466' && visible(sprite)).length,
            detail === 1 ? 2 : 0, 'Detailed female outfit 7 needs a blade on each forearm');
          if (detail === 1) {
            const bones = holder.svgs.filter(sprite => sprite.label === 'Symbol466' && visible(sprite))
              .map(sprite => {
                let parent = sprite.parent;
                while (parent && !['Symbol574', 'Symbol831', 'Symbol842'].includes(parent.label)) parent = parent.parent;
                return parent?.label;
              });
            assert.deepEqual(bones.sort(), ['Symbol574', 'Symbol842'], 'Blades must follow the forearm bones');
          }
        }
        holder.destroy();
      }
      assert.notDeepEqual(variants[0], variants[1], `${model} outfit ${set + 1} lost its details`);
    }
  }
});

test('body selection always wraps by the source timeline frame count', async () => {
  const visibleArt = (container) => container.visible
    ? [container.label, ...container.children.flatMap(visibleArt)] : [];
  const counts = [];

  for (const variation of [0, 1, 3]) {
    const config = appearance();
    config.parts.p7 = 5;
    config.parts.p1 = variation;
    const holder = new FighterHolder(application(), config, { current: 1 });
    await holder.ready;
    holder.setAnimation('idle');
    counts.push(visibleArt(holder.container).filter((label) => label === 'Symbol24').length);
    holder.destroy();
  }

  assert.ok(counts[0] > 0, 'Flash wrapping removed a one-frame sleeve');
  assert.deepEqual(counts, [counts[0], counts[0], counts[0]], 'A selector hid the one-frame sleeve');
});

test('male monk keeps all source frames available but loops at the authored jump', async () => {
  const app = application();
  const holder = new FighterHolder(app, appearance(), { current: 1 });
  await holder.ready;
  holder.setAnimation('monk', 57);
  app.ticker.tick();
  app.ticker.tick();
  assert.equal(holder.capturePlaybackFrame().frame, 6);

  holder.setAnimation('monk', 62);
  assert.equal(holder.capturePlaybackFrame().frame, 62, 'Manual inspection lost a source frame');
  holder.destroy();
});

test('destroy during loading does not attach a ticker later', async () => {
  let finish;
  pending = new Promise((resolve) => {
    finish = resolve;
  });
  const app = application(3);
  const holder = new FighterHolder(app, appearance(), { current: 1 }, 7);
  holder.destroy();
  finish();
  pending = null;
  await holder.ready;
  assert.equal(holder.loaded, false);
  assert.equal(app.ticker.handlers.size, 0);
});

};
