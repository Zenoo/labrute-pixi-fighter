// Optional real WebGL verification, using an installed Chromium browser.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const buildBrowser = require('./buildBrowser.cjs');

async function main() {
  const browser = process.env.BROWSER_BIN || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((candidate) => fs.existsSync(candidate));
  assert.ok(browser, 'Set BROWSER_BIN to an installed Chromium browser');
  const output = path.resolve(__dirname, '../.packaging-test/browser');
  await buildBrowser(output);
  const server = http.createServer((request, response) => {
    const name = path.basename(new URL(request.url, 'http://localhost').pathname);
    if (name.endsWith('.js') && fs.existsSync(path.join(output, name))) {
      response.setHeader('Content-Type', 'application/javascript');
      fs.createReadStream(path.join(output, name)).pipe(response);
    } else {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><html><body><script src="/browser.js"></script></body></html>');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(output, 'chrome-'));
  try {
    const { stdout } = await promisify(execFile)(browser, [
      '--headless=new', '--disable-gpu-sandbox', '--no-first-run', '--no-default-browser-check',
      ...(process.env.BROWSER_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
      '--disable-background-networking', '--disable-extensions', '--disable-component-update',
      '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
      `--user-data-dir=${profile}`, '--dump-dom', '--timeout=45000', '--virtual-time-budget=30000',
      `http://127.0.0.1:${server.address().port}`,
    ], { timeout: 60000, maxBuffer: 1024 * 1024 });
    fs.writeFileSync(path.join(output, 'result.html'), stdout);
    assert.match(stdout, /data-status="passed"/, stdout.slice(-8000));
    const outfitImage = stdout.match(/data-female-outfit7="data:image\/png;base64,([^"]+)"/);
    assert.ok(outfitImage, 'Missing female outfit 7b capture');
    fs.writeFileSync(path.join(output, 'female-outfit-7b.png'), Buffer.from(outfitImage[1], 'base64'));
    const result = stdout.match(/data-result="([^"]*)"/)?.[1].replaceAll('&quot;', '"');
    console.log('Chromium WebGL fighter regression passed:', result);
  } finally {
    server.close();
    // Keep the DOM result for inspection. Chrome profile directories are temporary.
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
