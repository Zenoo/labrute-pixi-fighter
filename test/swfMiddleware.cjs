const fs = require('node:fs');
const path = require('node:path');
const { makeReference } = require('../scripts/swf/reference.cjs');
const { createHash } = require('node:crypto');

// Local development only: no uploads, remote execution, or arbitrary file paths.
module.exports = function swfMiddleware(app) {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/swf/mini_perso.swf'));
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../src/swf/manifest.json'), 'utf8'));
  const currentHash = createHash('sha256').update(source).digest('hex');

  app.get('/comparison/manifest.json', (_request, response) => {
    response.json({ ...manifest, currentHash, matchesGenerated: currentHash === manifest.sha256 });
  });

  app.post('/comparison/frame.swf', (request, response) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16384) request.destroy();
    });

    request.on('end', () => {
      try {
        const options = JSON.parse(body);

        if (options.width !== 640 || options.height !== 480
          || !Number.isFinite(options.scale) || options.scale < 0.25 || options.scale > 8) {
          throw new Error('Invalid comparison dimensions');
        }

        response.type('application/x-shockwave-flash');
        response.setHeader('Cache-Control', 'no-store');
        response.send(makeReference(source, options));
      } catch (error) {
        response.status(400).json({ error: error.message });
      }
    });
  });
};
