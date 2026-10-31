const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const webpack = require('webpack');
const launchChromium = require('./chromium.cjs');

async function main() {
  const label = process.argv[2] || 'current';
  if (!/^[a-z\d-]+$/i.test(label)) throw new Error('Use a simple report label');
  const directory = path.resolve(process.argv[3] || 'dist');
  const output = path.resolve(__dirname, '../.packaging-test/performance', label);
  fs.mkdirSync(output, { recursive: true });
  const cpu = JSON.parse(execFileSync(process.execPath, [
    '--expose-gc', path.join(__dirname, 'performanceCpu.cjs'), directory,
  ], { maxBuffer: 1024 * 1024 }).toString());

  const compiler = webpack({
    mode: 'production', devtool: false, optimization: { minimize: false },
    entry: path.resolve(__dirname, 'fixtures/performance.mjs'),
    resolve: { alias: { 'fighter-benchmark$': path.join(directory, 'Symbols.mjs') } },
    output: { path: output, filename: 'benchmark.js' },
  });

  await new Promise((resolve, reject) => {
    compiler.run((error, stats) => compiler.close(() => {
      if (error || stats.hasErrors()) reject(error || new Error(stats.toString('errors-only')));
      else resolve();
    }));
  });

  const server = http.createServer((request, response) => {
    const filename = path.basename(new URL(request.url, 'http://localhost').pathname);
    if (filename.endsWith('.js') && fs.existsSync(path.join(output, filename))) {
      response.setHeader('Content-Type', 'application/javascript');
      fs.createReadStream(path.join(output, filename)).pipe(response);
    } else {
      response.end('<!doctype html><script src="/benchmark.js"></script>');
    }
  });
  let browser;

  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    browser = await launchChromium(output);
    await browser.send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}` });
    const gpu = await browser.evaluate(`(async () => {
      const deadline = performance.now() + 30000;
      while (!window.runPerformance) {
        if (performance.now() > deadline) throw new Error('Benchmark did not load');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return window.runPerformance();
    })()`);
    if (browser.errors.length) throw new Error(JSON.stringify(browser.errors));
    const report = { label, cpu, gpu };
    fs.writeFileSync(path.join(output, 'results.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
