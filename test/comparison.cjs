const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const launchChromium = require('./chromium.cjs');

async function main() {
  const config = require('../webpack.config.js')({}, { mode: 'development' });
  const output = path.resolve(__dirname, '../.packaging-test/comparison');
  const compiler = webpack({ ...config, stats: 'errors-only', infrastructureLogging: { level: 'error' } });
  const server = new WebpackDevServer({
    ...config.devServer, host: '127.0.0.1', port: 0, liveReload: false,
  }, compiler);
  let browser;

  try {
    await server.start();
    browser = await launchChromium(output);
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false,
    });
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.server.address().port}` });

    // The browser runs the same public playground actions a human uses. Every
    // reference is produced from the original SWF and rendered by local Ruffle.
    const results = await browser.evaluate(`(async () => {
      const wait = (time) => new Promise((resolve) => setTimeout(resolve, time));
      const until = async (predicate) => {
        const deadline = performance.now() + 60000;
        while (!predicate()) {
          if (performance.now() > deadline) throw new Error('Playground did not become ready');
          await wait(50);
        }
      };
      await until(() => window.comparison && window.fighter?.loaded);
      if (document.getElementById('play').textContent === 'Pause') document.getElementById('play').click();

      const change = (id, value) => {
        const input = document.getElementById(id);
        input.value = String(value);
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const results = [];
      const edgeOnly = ${process.env.COMPARISON_EDGE_ONLY === '1'};

      for (const model of ['male', 'female']) {
        change('model', model);
        await until(() => window.fighter?.name === model && document.getElementById('status').textContent === 'Preview up to date');

        // These defaults are the reported fixtures: male 01013100611 (hair 3)
        // and female 00100100610 (eyes). Measure their affected artwork locally
        // so a small but very thick outline cannot hide in a whole-body score.
        await window.comparison.compare(0);
        const status = document.getElementById('comparison-status');
        if (status.dataset.state !== 'ready') throw new Error(status.textContent);

        const artwork = model === 'male'
          ? new Set(['Symbol385', 'Symbol387'])
          : new Set(['Symbol352', 'Symbol353', 'Symbol355']);
        const visible = (object) => object.visible && (!object.parent || visible(object.parent));
        const bounds = window.fighter.svgs.filter((sprite) => artwork.has(sprite.label) && visible(sprite))
          .map((sprite) => sprite.getBounds());
        if (!bounds.length) throw new Error('Missing edge regression artwork for ' + model);

        const offsetX = 320 - window.fighter.container.x;
        const offsetY = 480 * 0.72 - window.fighter.container.y;
        const left = Math.max(0, Math.floor(Math.min(...bounds.map((box) => box.x)) + offsetX));
        const top = Math.max(0, Math.floor(Math.min(...bounds.map((box) => box.y)) + offsetY));
        const right = Math.min(640, Math.ceil(Math.max(...bounds.map((box) => box.x + box.width)) + offsetX));
        const bottom = Math.min(480, Math.ceil(Math.max(...bounds.map((box) => box.y + box.height)) + offsetY));
        const sourceCanvas = document.querySelector('#comparison-reference > canvas');
        const pixiCanvas = document.getElementById('comparison-pixi');
        const source = sourceCanvas.getContext('2d').getImageData(0, 0, 640, 480).data;
        const pixi = pixiCanvas.getContext('2d').getImageData(0, 0, 640, 480).data;
        let edgeChanged = 0;
        let edgeOccupied = 0;

        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) {
            const offset = (y * 640 + x) * 4;
            let difference = Math.abs(source[offset + 3] - pixi[offset + 3]);

            for (let channel = 0; channel < 3; channel++) {
              difference = Math.max(difference, Math.abs(
                source[offset + channel] * source[offset + 3] / 255
                - pixi[offset + channel] * pixi[offset + 3] / 255));
            }

            if (source[offset + 3] || pixi[offset + 3]) edgeOccupied++;
            if (difference > 24) edgeChanged++;
          }
        }

        results.push({
          model, fixture: 'edges', ...status.dataset,
          body: document.getElementById('body-string').value,
          edgeChanged, edgeOccupied, bounds: { left, top, right, bottom },
          sourceImage: sourceCanvas.toDataURL(), pixiImage: pixiCanvas.toDataURL(),
        });

        if (edgeOnly) continue;

        for (let armor = 0; armor < 7; armor++) {
          const previous = window.fighter;
          change('part-p7', armor);
          await until(() => window.fighter !== previous && window.fighter.loaded);
          await window.comparison.compare(0);
          const status = document.getElementById('comparison-status');
          if (status.dataset.state !== 'ready') throw new Error(status.textContent);
          results.push({ model, armor, ...status.dataset });
        }

        change('weapon', 'sword');
        document.getElementById('shield').checked = true;
        document.getElementById('shield').dispatchEvent(new Event('change'));

        for (const [animation, frame] of [['slash', 5], ['whip', 4]]) {
          change('animation', animation);
          await window.comparison.compare(frame);
          const status = document.getElementById('comparison-status');
          if (status.dataset.state !== 'ready') throw new Error(status.textContent);
          results.push({ model, animation, ...status.dataset });
        }
      }

      if (edgeOnly) return results;

      change('animation', 'fist');
      await window.comparison.scan();
      if (!document.querySelector('#comparison-report a')) throw new Error('Frame scan produced no report');
      if (document.getElementById('comparison-status').dataset.state === 'error') {
        throw new Error(document.getElementById('comparison-status').textContent);
      }

      for (const model of ['dog', 'bear']) {
        change('model', model);
        await until(() => window.fighter?.name === model && document.getElementById('status').textContent === 'Preview up to date');
        change('animation', 'attack');
        await window.comparison.compare(model === 'dog' ? 2 : 4);
        const status = document.getElementById('comparison-status');
        if (status.dataset.state !== 'ready') throw new Error(status.textContent);
        results.push({
          model, ...status.dataset,
          sourceImage: document.querySelector('#comparison-reference > canvas').toDataURL(),
          pixiImage: document.getElementById('comparison-pixi').toDataURL(),
        });
      }

      return results;
    })()`);

    for (const result of results) {
      for (const kind of ['source', 'pixi']) {
        const key = kind + 'Image';

        if (result[key]) {
          const prefix = result.fixture ? `${result.model}-${result.fixture}` : result.model;
          fs.writeFileSync(path.join(output, `${prefix}-${kind}.png`),
            Buffer.from(result[key].split(',')[1], 'base64'));
          delete result[key];
        }
      }
    }

    fs.writeFileSync(path.join(output, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
    const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(output, 'playground.png'), Buffer.from(screenshot.data, 'base64'));

    for (const result of results) {
      assert.ok(Number(result.occupied) > 100, `Empty comparison: ${JSON.stringify(result)}`);
      if (result.fixture === 'edges') {
        // The widened-stroke regression mismatches roughly 35% of the male
        // hair region and 26% of the female eye region at this resolution.
        assert.ok(result.edgeChanged / result.edgeOccupied < 0.25,
          `Hair/eye outline mismatch: ${JSON.stringify(result)}`);
      }

      // Rasterization differs; this detects a missing body or gross alignment
      // error without pretending that Ruffle and browser SVG antialias identically.
      assert.ok(Number(result.changed) / Number(result.occupied) < 0.65,
        `Substantial SWF/Pixi mismatch: ${JSON.stringify(result)}`);
    }

    assert.deepEqual(browser.errors, [], 'Uncaught browser errors');
    console.log(`Compared ${results.length} appearance cases.`);
    console.log(`Detailed pixel differences: ${path.join(output, 'results.json')}`);
  } finally {
    await browser?.close();
    await server.stop();
    await new Promise((resolve) => compiler.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
