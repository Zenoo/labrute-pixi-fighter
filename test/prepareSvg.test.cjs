const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { compileSvg } = require('../scripts/compile-svg.cjs');

const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/prepareSvg.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const exportsObject = {};
new Function('exports', compiled)(exportsObject);
const { prepareSvg: prepareSvgUrl } = exportsObject;
const prepareSvg = (source, resolution, minimumPixels) => {
  const url = prepareSvgUrl({ name: 'fixture', raster: compileSvg(source) }, resolution, minimumPixels);
  return decodeURIComponent(url.slice(url.indexOf(',') + 1)).replace(/<!--[\d.]+-->$/, '');
};

test('scaled hair and pet hairlines preserve authored opacity, fills and geometry', () => {
  for (const id of [385, 387, 882, 884, 886, 888, 890, 892]) {
    const source = require(`../src/json/Symbol${id}.json`).parts[0].svg;
    const prepared = prepareSvg(source, 12, 6);
    assert.deepEqual(new Set([...prepared.matchAll(/\bd="[^"]*"/g)].map(([value]) => value)),
      new Set([...source.matchAll(/\bd="[^"]*"/g)].map(([value]) => value)));
    assert.deepEqual(new Set([...prepared.matchAll(/\s(?:fill|stroke)(?:-opacity)?="[^"]*"/g)].map(([value]) => value)),
      new Set([...source.matchAll(/\s(?:fill|stroke)(?:-opacity)?="[^"]*"/g)].map(([value]) => value)));
    const outlines = [...prepared.matchAll(/<[^>]+stroke-width="0.5"[^>]*>/g)];
    assert.ok(outlines.length > 0, `Missing widened outline for Symbol${id}`);
  }
});

test('authored broad strokes and hidden strokes survive preparation', () => {
  const svg = '<svg><path stroke-opacity="0.3" stroke-width="2"/>'
    + '<path stroke-width="0.05" stroke-opacity="0"/>'
    + '<path stroke-width="0.05" stroke-opacity="0.3" fill-opacity="0.4"/></svg>';
  const prepared = prepareSvg(svg, 4, 4);
  assert.ok(prepared.includes('<path stroke-opacity="0.3" stroke-width="2"/>'));
  assert.ok(prepared.includes('<path stroke-width="1" stroke-opacity="0"/>'));
  assert.ok(prepared.includes('<path stroke-width="1" stroke-opacity="0.3" fill-opacity="0.4"/>'));
  assert.equal(prepareSvg(svg, 4, 4), svg.replaceAll('stroke-width="0.05"', 'stroke-width="1"'));
});

test('silhouette clips preserve nested transforms and holes without repainting fills', () => {
  const path = 'M0 0H10V10H0Z M2 2H8V8H2Z';
  const svg = '<svg width="50" height="50"><g transform="translate(5 6)">'
    + '<g transform="scale(2)"><path d="' + path + '" fill="#ffffff" fill-opacity="0.5"'
    + ' fill-rule="evenodd" stroke="#000000" stroke-opacity="0.3" stroke-width="0.05"/></g></g></svg>';
  const prepared = prepareSvg(svg, 4, 4);
  const clip = prepared.match(/<clipPath[^>]*>([\s\S]*?)<\/clipPath>/)[1];
  assert.ok(clip.includes('transform="translate(5 6) scale(2) "'));
  assert.ok(clip.includes('clip-rule="evenodd"'));
  assert.ok(!clip.includes('<g'), 'Groups inside clipPath are ignored by browsers');
  const extra = prepared.slice(prepared.indexOf('<g clip-path='));
  assert.ok(extra.includes('fill="none"'));
  assert.ok(extra.includes('stroke-width="1"'));
  assert.ok(extra.includes('stroke-opacity="0.3"'));
  assert.ok(prepared.includes('stroke-width="0.05"'), 'Source hairline was lost');
});

test('runtime only assembles encoded spans and widths, without reading or encoding SVGs', () => {
  const source = require('../src/json/Symbol387.json').parts[0].svg;
  const raster = compileSvg(source);
  const svg = { name: 'hair', raster, get svg() { throw new Error('Runtime read raw SVG'); } };
  const encode = global.encodeURIComponent;
  const decode = global.decodeURIComponent;
  try {
    global.encodeURIComponent = () => { throw new Error('Runtime encoded SVG'); };
    global.decodeURIComponent = () => { throw new Error('Runtime decoded SVG'); };
    assert.match(prepareSvgUrl(svg, 6, 4), /^data:image\/svg\+xml,%3Csvg/);
  } finally {
    global.encodeURIComponent = encode;
    global.decodeURIComponent = decode;
  }
  const geometry = source.match(/\bd="([^"]+)"/)[1];
  assert.ok(!raster.parts.filter((part) => typeof part === 'string').join('').includes(encodeURIComponent(geometry)),
    'Template duplicated source geometry instead of referencing encoded spans');
});

test('inside-only stroke slots turn off when authored outlines are already wide enough', () => {
  const source = '<svg><path d="M0 0H10V10H0Z" fill="#ffffff"/>'
    + '<path d="M0 0H10V10H0Z" fill="none" stroke="#000000" stroke-opacity="0.3" stroke-width="2"/></svg>';
  const prepared = prepareSvg(source, 4, 4);
  const extra = prepared.slice(prepared.indexOf('<g clip-path='));
  assert.ok(extra.includes('stroke-width="0"'));
  assert.ok(prepared.includes('stroke-width="2"'));
});
