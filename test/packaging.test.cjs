const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const buildBrowser = require('./buildBrowser.cjs');

const root = path.resolve(__dirname, '..');
const scratch = path.join(root, '.packaging-test');
fs.mkdirSync(scratch, { recursive: true });

test('both formats expose every public name and share one symbol graph', async () => {
  const cjs = require('labrute-pixi-fighter');
  const esm = await import('labrute-pixi-fighter');
  const names = [...fs.readFileSync(path.join(root, 'src/symbols/index.ts'), 'utf8')
    .matchAll(/export \{ (\w+) \}/g)].map((match) => match[1]);
  const expected = [...names, 'FighterHolder'].sort();
  assert.deepEqual(Object.keys(cjs).sort(), expected);
  assert.deepEqual(Object.keys(esm).sort(), expected);
  assert.notEqual(cjs.FighterHolder, esm.FighterHolder);
  for (const name of names) assert.equal(cjs[name], esm[name]);
  assert.equal(cjs.Symbol475.parts[0].parts, cjs.Symbol30.parts);
  assert.equal(cjs.Symbol475.parts[0].frames, cjs.Symbol30.frames);
  assert.equal(require('labrute-pixi-fighter/dist/Symbols.js'), cjs);
});

test('runtime bundles externalize Pixi and the rendering-free dataset', () => {
  for (const name of ['Symbols.js', 'Symbols.mjs']) {
    const code = fs.readFileSync(path.join(root, 'dist', name), 'utf8');
    assert.ok(Buffer.byteLength(code) < 200_000, `${name} must not inline data or Pixi`);
    assert.match(code, /['"]\.\/symbol-data\.cjs['"]/);
    assert.doesNotMatch(code, /<svg/);
    assert.match(code, name.endsWith('.mjs') ? /from 'pixi\.js'/ : /require\('pixi\.js'\)/);
    if (name.endsWith('.mjs')) assert.doesNotMatch(code, /require\(|Symbols\.js/);
  }
  const data = fs.readFileSync(path.join(root, 'dist/symbol-data.cjs'), 'utf8');
  assert.match(data, /<svg/);
  assert.doesNotMatch(data, /require\(|\bimport\s|pixi\.js/);
});

test('TypeScript NodeNext consumers resolve format-specific declarations', () => {
  const options = {
    noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  };
  const files = ['mts', 'cts'].map((extension) => {
    const filename = path.join(scratch, `consumer.${extension}`);
    const importLine = extension === 'mts'
      ? "import { FighterHolder, Symbol475, FighterAppearance } from 'labrute-pixi-fighter';"
      : "import fighter = require('labrute-pixi-fighter');\nconst { FighterHolder, Symbol475 } = fighter;\ntype FighterAppearance = fighter.FighterAppearance;";
    fs.writeFileSync(filename, `${importLine}
import type { Application, Container } from 'pixi.js';
declare const app: Application;
declare const appearance: FighterAppearance;
const holder = new FighterHolder(app, appearance, { current: 1 });
const container: Container = holder.container;
const name: string = Symbol475.name;
// @ts-expect-error symbols must retain their public types
Symbol475.nonexistent;
// @ts-expect-error generated data is shared and immutable
Symbol475.frames![0].push({ name: 'invalid' });
// @ts-expect-error renderer constructor must retain its public types
new FighterHolder('invalid');
`);
    const mode = extension === 'mts' ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS;
    const resolved = ts.resolveModuleName('labrute-pixi-fighter', filename, options, ts.sys, undefined, undefined, mode).resolvedModule;
    assert.ok(resolved?.resolvedFileName.endsWith(extension === 'mts' ? 'Symbols.d.mts' : 'Symbols.d.cts'));
    return filename;
  });
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(files, options));
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (file) => file, getCurrentDirectory: () => root, getNewLine: () => '\n',
  }));
});

test('browser ESM bundle never resolves CommonJS Pixi through the package', async () => {
  const stats = await buildBrowser(path.join(scratch, 'browser'));
  const modules = stats.modules.map((module) => module.name?.replaceAll('\\', '/')).filter(Boolean);
  assert.ok(modules.some((name) => name.endsWith('/dist/Symbols.mjs')));
  assert.ok(!modules.some((name) => name.endsWith('/dist/Symbols.js')));
  const pixiModules = modules.filter((name) => name.includes('/pixi.js/lib/'));
  assert.ok(pixiModules.some((name) => name.endsWith('/lib/index.mjs')));
  assert.deepEqual(pixiModules.filter((name) => /\.js$/.test(name)), []);
  assert.equal(modules.filter((name) => name.endsWith('/dist/symbol-data.cjs')).length, 1);
});

test('npm pack publishes exactly one large dataset and all entry points', () => {
  const npm = process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const [pack] = JSON.parse(execFileSync(process.execPath,
    [npm, '--cache', path.join(root, '.npm-cache'), 'pack', '--dry-run', '--json'], { cwd: root, encoding: 'utf8' }));
  const files = pack.files.map((file) => file.path);
  for (const name of ['Symbols.js', 'Symbols.mjs', 'symbol-data.cjs', 'Symbols.d.ts', 'Symbols.d.cts', 'Symbols.d.mts']) {
    assert.ok(files.includes(`dist/${name}`));
  }
  assert.deepEqual(pack.files.filter((file) => file.size > 1_000_000).map((file) => file.path), ['dist/symbol-data.cjs']);
  assert.ok(!files.some((file) => /^(src|test|node_modules)\//.test(file)));
  console.log(`npm pack: ${pack.size} bytes compressed, ${pack.unpackedSize} bytes unpacked, ${pack.entryCount} files`);
});
