import { Application, Assets, Container } from 'pixi.js';
import { FighterHolder, Symbol475 } from 'labrute-pixi-fighter';

const check = (value, message) => { if (!value) throw new Error(message); };
const colorKeys = ['col0', 'col0a', 'col0c', 'col1', 'col1a', 'col1b', 'col1c', 'col1d',
  'col2', 'col2a', 'col2b', 'col3', 'col3b', 'col4', 'col4a', 'col4b'];

window.runFighterRegression = async () => {
  const app = new Application();
  await app.init({ width: 320, height: 240, preference: 'webgl', resolution: 2, autoStart: false });
  document.body.appendChild(app.canvas);
  check(Symbol475.name === 'Symbol475', 'Missing named symbol export');
  const generateTexture = app.renderer.generateTexture.bind(app.renderer);
  let shadows = 0;
  app.renderer.generateTexture = (target) => {
    check((target.target ?? target) instanceof Container, 'Generated texture uses a different Pixi Container');
    if (!target.target) shadows++;
    return generateTexture(target);
  };
  let loads = 0;
  const load = Assets.load.bind(Assets);
  Assets.load = async (request) => {
    loads++;
    const texture = await load(request);
    check(Assets.cache.get(request.src) === texture, 'SVG missing from consumer Assets cache');
    return texture;
  };
  const models = [];
  try {
    for (const model of ['male', 'female', 'dog', 'bear']) {
      const appearance = {
        type: 'brute', name: model, model, team: 'L', shield: false,
        width: 50, height: 80,
        parts: Object.fromEntries(['p1', 'p1a', 'p1b', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p7b', 'p8'].map((key) => [key, 0])),
        colors: Object.fromEntries(['col0', 'col0a', 'col0c', 'col1', 'col1a', 'col1b', 'col1c', 'col1d', 'col2', 'col2a', 'col2b', 'col3', 'col3b', 'col4', 'col4a', 'col4b'].map((key) => [key, '#dd8844'])),
      };
      const holder = new FighterHolder(app, appearance, { current: 1 }, 2);
      await holder.ready;
      check(holder.container instanceof Container, 'Fighter uses a different Pixi Container');
      app.stage.addChild(holder.container);
      holder.container.position.set(160, 160);
      holder.pause();
      holder.weapon = 'sword';
      holder.shield = true;
      holder.setAnimation('idle');
      app.render();
      const { pixels } = app.renderer.extract.pixels(holder.container);
      check(pixels.some((channel, index) => index % 4 !== 3 && channel > 0), 'Fighter has no colored pixels');
      check(holder.svgs.some((sprite) => sprite.visible && sprite.texture.width > 1), 'SVG textures were not rasterized');
      if (model === 'male' || model === 'female') {
        const originals = new Set(holder.svgs.map((sprite) => sprite.texture));
        holder.setColors(Object.fromEntries(colorKeys.map((key) => [key, '#00ff00'])));
        app.render();
        const recolored = app.renderer.extract.pixels(holder.container).pixels;
        check(recolored.some((channel, offset) => offset % 4 === 1 && channel > 100
          && channel > recolored[offset - 1] + 50 && channel > recolored[offset + 1] + 50),
        'Recolor produced no green pixels');
        const variants = holder.svgs.map((sprite) => sprite.texture).filter((texture) => !originals.has(texture));
        check(variants.length > 0, 'Recolor did not create reusable color variants');
        holder.setColors(Object.fromEntries(colorKeys.map((key) => [key, '#ff0000'])));
        app.render();
        check(variants.every((texture) => texture.destroyed), 'Recolor retained obsolete GPU textures');
      }
      const count = loads;
      const second = new FighterHolder(app, appearance, { current: 1 }, 2);
      await second.ready;
      check(loads === count, 'Matching fighters did not share textures');
      holder.setColors(appearance.colors);
      second.setAnimation('idle');
      const shared = holder.svgs.filter((sprite) => second.svgs.some((other) =>
        other.label === sprite.label && other.texture === sprite.texture)).map((sprite) => sprite.texture);
      check(shared.length > 0, 'Matching fighters did not share color variants');
      holder.destroy();
      check(shared.every((texture) => !texture.destroyed), 'Destroy freed a texture borrowed by another fighter');
      app.stage.addChild(second.container);
      app.render();
      second.destroy();
      models.push(model);
    }
    check(shadows === 8 && loads > 0, 'Renderer or Assets was bypassed');
    return { models, shadows, loads, resolution: app.renderer.resolution };
  } finally {
    Assets.load = load;
    app.destroy(true, { children: true });
  }
};

window.runFighterRegression().then(
  (result) => { document.body.dataset.result = JSON.stringify(result); document.body.dataset.status = 'passed'; },
  (error) => { document.body.dataset.error = error.stack; document.body.dataset.status = 'failed'; },
);
