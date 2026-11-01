import { Application, Assets, Container } from 'pixi.js';
import { FighterHolder, Symbol475, Symbol387, Symbol882 } from 'labrute-pixi-fighter';

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
  let strokeWidthsChecked = 0;
  const edgesChecked = new Set();
  const load = Assets.load.bind(Assets);
  Assets.load = async (request) => {
    loads++;
    // Every fighter in this fixture has scale 2 and renderer DPR 2. Verify
    // the package entry prepares its scaled strokes with a four-texel floor.
    const svg = decodeURIComponent(request.src.slice(request.src.indexOf(',') + 1));
    const texture = await load(request);
    for (const symbol of [Symbol387, Symbol882]) {
      const source = symbol.parts[0].svg;
      const signature = source.match(/\bd="([^"]+)"/)[1];
      if (!svg.includes(signature)) continue;
      const sourceOpacities = new Set([...source.matchAll(/\sstroke-opacity="[^"]+"/g)].map(([value]) => value));
      check([...svg.matchAll(/\sstroke-opacity="[^"]+"/g)].every(([value]) => sourceOpacities.has(value)),
      'Hair or pet outline opacity changed during rasterization');
      const image = new Image();
      image.src = 'data:image/svg+xml,' + encodeURIComponent(source);
      await image.decode();
      const raster = app.renderer.extract.pixels({ target: texture, resolution: texture.source.resolution });
      const canvas = document.createElement('canvas');
      canvas.width = raster.width;
      canvas.height = raster.height;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, image.width * texture.source.resolution, image.height * texture.source.resolution);
      const original = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let escaped = 0;
      for (let index = 3; index < original.length; index += 4) {
        if (original[index] === 0 && raster.pixels[index] > 16) escaped++;
      }
      check(escaped <= 2, 'Scaled outline spread a pale halo outside ' + symbol.name + ': ' + escaped);
      edgesChecked.add(symbol.name);
    }
    const widened = svg.includes('<g clip-path="url(#fighter-outline)">')
      ? svg.slice(svg.indexOf('<g clip-path="url(#fighter-outline)">')) : svg;
    for (const match of widened.matchAll(/\sstroke-width="([\d.]+)"/g)) {
      check(Number(match[1]) + 1e-9 >= 4 / request.data.resolution,
        'Default browser rendering lost the scaled stroke minimum');
      strokeWidthsChecked++;
    }
    check(Assets.cache.get(request.src) === texture, 'SVG missing from consumer Assets cache');
    return texture;
  };
  const models = [];
  try {
    for (const model of ['male', 'female', 'dog', 'bear', 'panther']) {
      const appearance = {
        type: 'brute', name: model, model: model === 'panther' ? 'dog' : model, team: 'L', shield: false,
        colorOffset: model === 'panther' ? { r: -82, g: -97, b: -82 } : undefined,
        width: 50, height: 80,
        parts: Object.fromEntries(['p1', 'p1a', 'p1b', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p7b', 'p8'].map((key) => [key, 0])),
        colors: Object.fromEntries(['col0', 'col0a', 'col0c', 'col1', 'col1a', 'col1b', 'col1c', 'col1d', 'col2', 'col2a', 'col2b', 'col3', 'col3b', 'col4', 'col4a', 'col4b'].map((key) => [key, '#dd8844'])),
      };
      if (model === 'female') Object.assign(appearance.parts, { p7: 6, p7b: 6, p1: 1 });
      if (model === 'male') appearance.parts.p3 = 3;
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
      for (const sprite of holder.svgs.filter((sprite) => sprite.visible)) {
        const { a, b, c, d } = sprite.getGlobalTransform();
        const x = a * a + b * b;
        const y = c * c + d * d;
        const stretch = Math.sqrt((x + y + Math.hypot(x - y, 2 * (a * c + b * d))) / 2);
        check(sprite.texture.source.resolution + 1e-6 >= stretch * app.renderer.resolution,
          'Insufficient raster detail for ' + sprite.label);
      }
      if (model === 'female') {
        const visible = (sprite) => sprite.visible && (!sprite.parent || visible(sprite.parent));
        const blades = holder.svgs.filter(sprite => sprite.label === 'Symbol466' && visible(sprite));
        check(blades.length === 2, 'Female outfit 7b is missing forearm blades');
        check(blades.every(sprite => sprite.texture.width > 1), 'Forearm blades were not rasterized');
        holder.weapon = null;
        holder.shield = false;
        holder.setAnimation('idle');
        app.render();
        document.body.dataset.femaleOutfit7 = app.canvas.toDataURL();
        holder.weapon = 'sword';
        holder.shield = true;
        holder.setAnimation('idle');
        const iris = holder.svgs.find((sprite) => sprite.label === 'Symbol355Iris' && sprite.visible);
        const outline = holder.svgs.find((sprite) => sprite.label === 'Symbol355' && sprite.visible);
        check(iris && outline, 'Female eye layers are missing');
        const whiteTexture = outline.texture;
        const eyeLoads = loads;

        for (const [color, channel] of [['#00ff00', 1], ['#ff0000', 0]]) {
          holder.setColors({ col3: color });
          // Inspect the cached texture directly, independent of the eye's
          // nested head transforms and the extraction camera's bounds.
          const pixels = app.renderer.extract.pixels(iris.texture).pixels;
          check(pixels.some((value, offset) => offset % 4 === channel && value > 100
            && pixels[offset - channel + (1 - channel)] < 20), 'Female iris did not follow col3: ' + color);
          check(outline.texture === whiteTexture, 'Eye whites were recolored with the iris');
          check(loads === eyeLoads, 'Eye recoloring reloaded SVGs');
          check(blades.every(sprite => app.renderer.extract.pixels(sprite.texture).pixels
            .some((value, offset, pixels) => offset % 4 === channel && value > 100
              && pixels[offset - channel + (1 - channel)] < 20)), 'Forearm blades did not follow col3');
        }
      }
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
    check(shadows === 10 && loads > 0, 'Renderer or Assets was bypassed');
    check(strokeWidthsChecked > 0, 'No browser SVG stroke widths were checked');
    check(edgesChecked.size === 2, 'Hair and pet halo checks did not both run');
    return { models, shadows, loads, strokeWidthsChecked, edgesChecked: [...edgesChecked], resolution: app.renderer.resolution };
  } finally {
    Assets.load = load;
    app.destroy(true, { children: true });
  }
};

window.runFighterRegression().then(
  (result) => { document.body.dataset.result = JSON.stringify(result); document.body.dataset.status = 'passed'; },
  (error) => { document.body.dataset.error = error.stack; document.body.dataset.status = 'failed'; },
);
