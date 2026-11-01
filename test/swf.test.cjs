const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { readSwf, readTimeline } = require('../scripts/swf/reader.cjs');
const { makeReference, encodeMatrix } = require('../scripts/swf/reference.cjs');
const { restoreStrokeWidths, compactSvg } = require('../scripts/swf/artwork.cjs');
const { compactTransform, compactColor, compactFilters } = require('../scripts/swf/compact.cjs');
const { colorableEye } = require('../scripts/swf/eyeColors.cjs');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/swf/mini_perso.swf'));
const swf = readSwf(source);
const generated = (id) => JSON.parse(fs.readFileSync(path.join(root, `src/json/Symbol${id}.json`)));
const defaultParts = Object.fromEntries(
  ['p1', 'p1a', 'p1b', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p7b', 'p8'].map((key) => [key, 0]),
);

test('outfits 6 and 7 retain their distinct source detail frames', () => {
  // p1 timelines reachable through p7=5/6 in the male and female idle poses.
  for (const id of [172, 238, 328, 446, 273, 338, 468, 624, 678, 761, 830]) {
    const frames = swf.sprites.get(id).frames;
    const placements = frames.map((frame) => frame.map(({ move, ...placement }) => placement));
    assert.equal(frames.length, 2);
    assert.notDeepEqual(placements[0], placements[1], `Source sprite ${id} lacks details`);
    assert.notDeepEqual(generated(id).frames[0], generated(id).frames[1]);
  }
});

test('female outfit 7 torso details repeat in the source; arm blades use existing SWF artwork', () => {
  // These are the two p1 selectors reachable within female outfit 6 across
  // the animation timelines. Neither supplies alternate artwork or transforms.
  for (const id of [769, 815]) {
    const frames = swf.sprites.get(id).frames;
    const placements = frames.map((frame) => frame.map(({ move, ...placement }) => placement));
    assert.equal(frames.length, 2);
    assert.deepEqual(placements[0], placements[1], `Source sprite ${id} has distinct details`);
    assert.deepEqual(generated(id).frames[0], generated(id).frames[1]);
  }
  assert.deepEqual(generated(946).frames, [[], [{
    name: 'Symbol467', colorIdx: '_col3', transform: { tx: 7.15, ty: -5.6 },
  }]]);
  assert.equal(swf.sprites.get(467).frames[0][0].characterId, 466);
  for (const id of [574, 842]) {
    const arm = generated(id);
    assert.equal(arm.frames[6][0].partIdx, '_p1');
    assert.deepEqual(arm.frames[6][0].transform, { tx: -0.45, ty: 3.35 });
    assert.deepEqual(arm.frames[6].slice(1).map(part => part.name),
      swf.sprites.get(id).frames[6].slice().reverse().map(part => `Symbol${part.characterId}`));
  }
  assert.deepEqual(generated(831).frames[6], [], 'Upper arm must not acquire a wrist blade');
});

test('SVG export restores authored thin strokes without altering ordinary strokes', () => {
  const ordinary = '<path stroke="#000000" stroke-width="2.0"/>';
  const thin = '<path ffdec:original-stroke-width="0.05" stroke-opacity="0.3019608" stroke-width="1.0"/>';
  const result = restoreStrokeWidths(ordinary + thin);
  assert.ok(result.startsWith(ordinary));
  assert.match(result, / stroke-width="0\.05"/);
  assert.match(result, /ffdec:original-stroke-width="0\.05"/);
  assert.match(result, /stroke-opacity="0\.3019608"/);
});

test('the reported male hair and female eyes retain source stroke widths in generated artwork', () => {
  for (const ids of [[385, 387], [352, 353, 355]]) {
    let checked = 0;

    for (const id of ids) {
      const findArtwork = (symbol) => symbol.parts.flatMap((part) =>
        part.type === 'svg' ? [part] : part.parts ? findArtwork(part) : []);
      const artwork = findArtwork(generated(id)).find((part) => part.name === `Symbol${id}`);
      const sourceSvg = fs.readFileSync(path.join(root, `src/svg/Symbol${id}.svg`), 'utf8');
      const originals = [...sourceSvg.matchAll(/ffdec:original-stroke-width="([^"]+)"/g)];
      assert.doesNotMatch(artwork.svg, /ffdec:|<\?xml/);

      for (const original of originals) {
        assert.ok(artwork.svg.includes(`stroke-width="${original[1]}"`), `Shape ${id} widened an authored stroke`);
        checked++;
      }
    }

    assert.ok(checked > 0, 'The appearance fixture did not exercise thin strokes');
  }
});

test('female iris generation isolates col3 fills from whites and outlines', () => {
  for (const id of [348, 355]) {
    const eye = generated(id);
    const iris = eye.parts.find((part) => part.name === `Symbol${id}Iris`);
    const outline = eye.parts.find((part) => part.name === `Symbol${id}Outline`);
    assert.equal(eye.frames[0].find((part) => part.name === iris.name).colorIdx, '_col3');
    assert.equal(eye.frames[0].find((part) => part.name === outline.name).colorIdx, undefined);
    assert.match(outline.parts[0].svg, /fill="#fbfbfb"/);
    assert.match(outline.parts[0].svg, /stroke="#000000"/);
    assert.doesNotMatch(iris.parts[0].svg, /stroke="#000000"|#fbfbfb|#096f6f|#054746|#00ffff/);

    const paths = (svg) => [...svg.matchAll(/<path\b[^>]*\/>/g)].map((match) => match[0]);
    const original = fs.readFileSync(path.join(root, `src/svg/Symbol${id}.svg`), 'utf8');
    const compactOriginal = compactSvg(original);
    const rebuilt = colorableEye({ name: `Symbol${id}`, svg: compactOriginal, offset: { x: 0, y: 0 } });
    const layerPaths = rebuilt.parts.flatMap((part) => paths(part.parts[0].svg));
    const neutralOriginal = compactOriginal.replaceAll('#096f6f', '#6f6f6f')
      .replaceAll('#054746', '#474747').replaceAll('#00ffff', '#ffffff');
    assert.deepEqual(layerPaths.sort(), paths(neutralOriginal).sort(), 'A vector path was lost or duplicated');
  }

  assert.throws(() => colorableEye({ name: 'UnexpectedEye', svg: '<svg></svg>' }), /three female iris shades/);
});

test('compact generation omits defaults without rounding source precision', () => {
  assert.equal(compactTransform({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }), undefined);
  assert.deepEqual(compactTransform({ a: 1, b: 0.0000152587890625, d: 1, tx: -0.05 }),
    { b: 0.0000152587890625, tx: -0.05 });
  assert.deepEqual(compactColor({ multiply: [1, 1, 1, 1], add: [0, 0, 0, 0] }), {});
  assert.deepEqual(compactColor({ multiply: [1, 1, 1, 1], add: [-16, -50, -80, 0] }),
    { multiply: undefined, add: [-16, -50, -80, 0] });
  assert.equal(compactFilters([{ type: 'blur', blurX: 0, blurY: 0, flags: 8 }]), undefined);
});

test('generated placements do not repeat false masks, type tags, or source depths', () => {
  for (const id of swf.sprites.keys()) {
    const symbol = generated(id);
    if (symbol.labels) assert.ok(Object.keys(symbol.labels).length > 0);

    for (const frame of symbol.frames) {
      for (const part of frame) {
        assert.ok(!Object.hasOwn(part, 'isMask') || part.isMask === true);
        assert.equal(Object.hasOwn(part, 'type'), false);
        assert.equal(Object.hasOwn(part, 'depth'), false);
      }
    }
  }
});

test('every source timeline retains all frames, including empty trailing frames', () => {
  for (const [id, timeline] of swf.sprites) {
    assert.equal(generated(id).frames.length, timeline.frames.length, `Symbol${id}`);
  }

  assert.equal(generated(562).frames.length, 12);
  assert.deepEqual(generated(562).frames[11], []);
  assert.equal(generated(375).frames.length, 9);
  assert.equal(generated(476).frames.length, 63);
  assert.equal(generated(476).loopEnd, 57);
});

test('armor placements retain distinct color slots for reused artwork', () => {
  const armor = generated(102);
  const placement = (frame) => armor.frames[frame].find((part) => part.name === 'Symbol82');

  assert.equal(placement(0).colorIdx, '_col0');
  assert.equal(placement(6).colorIdx, '_col2');
  assert.notEqual(placement(0).colorIdx, placement(6).colorIdx);

  const hair = generated(806).frames.flat().filter((part) => part.name === 'Symbol554');
  assert.deepEqual(new Set(hair.map((part) => part.colorIdx)), new Set(['_col1a', '_col1b']));
});

test('source mask ranges and previously discarded filters survive conversion', () => {
  const weapon = generated(68).frames.find((frame) => frame.some((part) => part.maskedBy));
  const mask = weapon.find((part) => part.isMask);
  assert.equal(mask.name, 'Symbol39');
  assert.ok(weapon.some((part) => part.maskedBy === 39));
  assert.ok(generated(544).frames.flat().some((part) => part.filters?.some((filter) => filter.type === 'blur')));
  assert.ok(generated(903).frames.flat().some((part) => part.filters?.some((filter) => filter.type === 'glow')));
});

test('SWF display lists inherit moves, preserve depth order, and remove characters', () => {
  const matrix = encodeMatrix({ tx: 12, ty: -7 });
  const timeline = readTimeline([
    { code: 26, data: Buffer.concat([Buffer.from([6, 3, 0, 17, 0]), matrix]) },
    { code: 1, data: Buffer.alloc(0) },
    { code: 26, data: Buffer.concat([Buffer.from([5, 3, 0]), encodeMatrix({ a: 1.5, tx: 20 })]) },
    { code: 1, data: Buffer.alloc(0) },
    { code: 28, data: Buffer.from([3, 0]) },
    { code: 1, data: Buffer.alloc(0) },
  ], 3);

  assert.equal(timeline.frames[0][0].matrix.tx, 12);
  assert.equal(timeline.frames[0][0].matrix.ty, -7);
  assert.equal(timeline.frames[1][0].characterId, 17);
  assert.equal(timeline.frames[1][0].matrix.a, 1.5);
  assert.deepEqual(timeline.frames[2], []);
});

test('reference SWFs preserve source shape records instead of rendering generated SVGs', () => {
  const reference = readSwf(makeReference(source, {
    symbolId: 475, frame: 0, model: 'male', parts: { ...defaultParts, p7: 6 },
    colors: { col0: '#112233', col2: '#ee7744' },
  }));

  for (const [id, shape] of swf.shapes) {
    assert.deepEqual(reference.shapes.get(id), shape, `Source shape ${id} changed`);
  }

  assert.ok([...reference.sprites.values()].every((sprite) => sprite.frames.length === 1));
  const colors = [...reference.sprites.values()].flatMap((sprite) => sprite.frames.flat())
    .filter((part) => part.characterId === 81).map((part) => part.color?.add);
  // Source Symbol82 wraps shape81; named colors live on the wrapper placement.
  assert.ok(reference.sprites.size > 1);
  assert.ok(colors.length > 0);
});

test('generation manifest identifies the exact SWF, 944 characters, and an added detail layer', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/swf/manifest.json')));
  assert.equal(manifest.sha256, createHash('sha256').update(source).digest('hex'));
  assert.equal(manifest.symbols, 945);
  assert.equal(manifest.shapes, 381);
  assert.equal(manifest.sprites, 558);
});
