# LaBrute Pixi Fighter

![Preview](.github/media/test-preview.png)

PixiJS fighter animations and SWF symbol data for LaBrute. Previously published
as `labrute-fla-parser`.

## Installation
```
npm i labrute-pixi-fighter
```

The Pixi fighter renderer requires `pixi.js@^8.19.0` as a peer dependency. Pixi
is supplied by the application so the renderer shares its ticker, assets, and
scene objects with production.

## Usage

```ts
import { Symbol475 } from 'labrute-pixi-fighter';

console.log(Symbol475);
```

CommonJS consumers use the same named API:

```js
const { FighterHolder, Symbol475 } = require('labrute-pixi-fighter');
```

The package root selects a genuine ESM renderer for `import` and a CommonJS
renderer for `require`. Both are compiled from the same FighterHolder source.
The ESM renderer imports `pixi.js` directly, so Vite and other ESM applications
share their Pixi `Container` class and `Assets` cache with the fighter. CommonJS
applications share their own CommonJS Pixi runtime. Keep your application's Pixi
imports in the same module format as the renderer it loads.

The symbol/SVG object graph is published once in `dist/symbol-data.cjs`, without
Pixi or rendering dependencies. Both entry points reference this file; the ESM
entry does not wrap the CommonJS renderer. A browser bundler must support
CommonJS dependencies (as Vite and Webpack do). Symbol data is shared even when
both entry points are loaded in Node, while renderer classes and their private
texture caches are separate for each format. The shared data module limits
per-symbol tree shaking; selecting one symbol can still include the dataset.

`main` remains `dist/Symbols.js` for legacy CommonJS consumers, and `module` now
points to `dist/Symbols.mjs`. The existing `labrute-pixi-fighter/dist/Symbols.js`
path remains available for compatibility. Prefer the package root so conditional
exports select the appropriate renderer. Other internal paths are not public.
TypeScript Node16/NodeNext resolution selects `.d.cts` or `.d.mts` declarations;
legacy resolution uses `types` and `dist/Symbols.d.ts`. The package itself keeps
its existing CommonJS `.js` convention.

## Fighter animations

`FighterHolder` owns the Pixi animation timelines, SVG textures, sprite pools,
masks, equipment, shadows, animation events, and playback snapshots.

```ts
import { FighterHolder } from 'labrute-pixi-fighter';

// app is an initialized Pixi 8 Application. Appearance decoders belong to your app.
const holder = new FighterHolder(app, {
  type: 'brute',
  name: fighter.name,
  model: fighter.gender ?? 'male',
  team: fighter.team,
  shield: fighter.shield,
  parts: readBodyString(fighter.body),
  colors: readColorString(fighter.gender ?? 'male', fighter.colors),
  width: 50,
  height: 80,
}, { current: 1 }, 2);

app.stage.addChild(holder.container);
await holder.ready;
holder.weapon = 'sword';
holder.setAnimation('idle');
holder.on('fist:hit', () => { /* synchronize fight effects */ });

// When removing the fighter:
holder.destroy();
```

`parts` uses decoded keys such as `p1` and `p1a`; `colors` uses `col0`, `col1`,
etc. Both maps are copied on construction. `width` and `height` are logical,
unscaled dimensions. The fourth constructor argument scales the model and its
dimensions. Models are `male`, `female`, `dog`, and `bear`; panthers use `dog`
with caller-supplied scaling and color offsets.

Body selectors follow Flash's modulo behavior: a value wraps by the selected
symbol's complete source frame count. Source empty frames hide artwork.
Colors use Flash's additive color
transforms rather than multiplying an SVG's colors by a sprite tint.

Keep the speed ref to change playback speed without recreating the holder.
`animationSpeed` also supports negative playback and accounts for model scale.
`setAnimation(animation, frame, true)` and `setAirborn(value, true)` update
`seekPose` without rendering. `capturePlaybackFrame()` and
`renderPlaybackFrame(snapshot)` preserve the production replay API; equipment
is maintained separately through `weapon` and `shield`.

Set `idleAnimation` to `monk` when appropriate, or override `setAnimation` in a
subclass to derive it from current skills. Supply Pixi `filters` for boss/pet
styling, and `colorOffset: { r, g, b }` to replace timeline color offsets.
Renderer internals stay private; the existing public controls and containers
remain available to subclasses and callers.

## Development

### Generate from the SWF

`src/swf/mini_perso.swf` is the source of truth. Java 17+ is required for exporting;
it is not required by the published renderer or the comparison playground.

```sh
npm run setup:swf
npm run export:swf
npm run build
```

Setup downloads FFDec 26.4.0 into the ignored `.tools` directory and checks its
SHA-256 digest. Alternatively, set `FFDEC_JAR` to that version's `ffdec.jar`.
The exporter reads source display lists directly, including placement identities,
body/color selectors, complete frame counts, matrices, mask depth ranges, color
transforms, and filters. FFDec exports the original vector shapes and static text
to SVG. Generated SVG, JSON, and TypeScript files live in `src/svg`, `src/json`,
and `src/symbols`; `src/swf/manifest.json` records the source hash and frame counts.
Generation does not use the historical `src/xml` files or their correction tables.
FFDec's SVG preview widens subpixel strokes to 1px. The generator restores their
authored widths from the export metadata before embedding or saving the artwork;
nested transforms therefore do not inflate hair and eye outlines.
During texture rasterization, Flash's minimum stroke is applied as one texture
pixel at the chosen resolution, rather than one magnified SVG coordinate unit.

The new data preserves all 944 renderable source characters. Placement metadata
lives on frame entries, so two instances of the same shape can use different color
slots. Blank trailing frames and the complete male monk timeline are preserved.
Default transforms, zero color components, false masks, empty labels, and redundant
placement type/depth fields are omitted. Generated TypeScript shares repeated
placements and held frames, and references symbol definitions directly. Published
data is minified separately; the generator and generated source stay readable.
Symbol data is shared and typed as immutable: change appearance through
`FighterHolder`, rather than mutating exported timelines.
Body choices in the playground come from source timelines, including female
body sizing. Imported body values wrap by the corresponding timeline length.
Clothing uses several independent selectors: `p7` selects the clothing set,
`p7b` selects legwear, and `p1` enables additional armor pieces. For example,
the male shoulder-pad armor needs `p7: 4` and `p1: 1`; use `p7b: 4` for matching
legwear. Starting from the default male appearance, its body string is
`11013100441`. The playground offers basic and detailed presets
for all seven sets so these combinations can be inspected directly. Presets only
offer a detailed variant when its source placements differ: female set 6 has
identical artwork for both `p1` values, so it has one preset. Raw part selectors
remain editable for inspecting production body strings.
The male monk's source jump at frame 57 still controls playback; its remaining
five source frames are retained for manual inspection instead of being deleted.

### Compare SWF and Pixi frames

Run `npm test` and open http://localhost:3000. The **Compare with the source SWF**
panel renders the selected pose through the locally installed Ruffle runtime and
shows the Pixi capture beside a pixel-difference image. No external CDN is used.
Both captures use a 640 × 480 stage, the same model origin, facing, appearance,
equipment, and scale; the game-only shadow is excluded.
Enable **Overlay source on Pixi** to inspect alignment, or **View at 100%** to
inspect the original capture pixels in a horizontally scrollable comparison.

Pause the animation and scrub the frame slider, then select **Compare current
frame**. Enable **Follow paused edits** to compare after frame or appearance edits.
**Scan every frame** checks the entire selected animation and offers a JSON report
with a per-frame mismatch count. Cancel stops after the current frame. Tolerance
is measured in premultiplied RGBA channel values from 0 to 255.

The reference is a frozen source display list: original SWF vector records,
placement matrices, colors, filters, and masks are copied into a single-frame SWF
and rendered by Ruffle. It does not consume generated SVGs or Pixi symbols, and it
does not execute the original game's palette/appearance decoder or timeline scripts.
The selected decoded appearance and nested frame choices are applied explicitly.
This checks conversion/rendering fidelity, not the original ActionScript behavior.
Ruffle, browser SVG rasterization, and Pixi can antialias edges differently; Flash
blur/glow filters are approximated in Pixi. The tool reports these differences and
does not claim pixel-perfect equivalence.

`npm run build` regenerates the published JavaScript and declarations.
Rollup builds the data module separately and marks it external in both renderer
builds, preventing two embedded copies. Named symbol exports are generated from
`src/symbols/index.ts`; add new exports there rather than editing build output.
Pixi remains an external peer dependency and is installed as a development
dependency for local checks.

After building, `npm run test:unit` runs the existing behavior suite against both
formats with real Pixi scene objects and filters, substituting SVG rasterization
and GPU probing in Node. It also checks public export parity, object identity,
consumer Pixi classes/cache, TypeScript NodeNext entry resolution, the packed
file list, and a browser bundle's module graph. The browser bundle must contain
only Pixi's ESM implementation. `npm run test:packaging` runs just the packaging
checks. `npm pack --dry-run` inspects the publishable artifact without publishing.

`npm run test:browser` additionally launches an installed Chromium browser
(or the executable in `BROWSER_BIN`) using headless WebGL with SwiftShader. It
constructs and renders male, female, dog, and bear fighters with real SVG assets,
checks colored output pixels, shadow texture generation, consumer Pixi identity,
and texture/cache reuse. Temporary bundle and result files live under the ignored
`.packaging-test` directory. This smoke check does not replace visual review of
animation frames in the playground. Restricted environments that cannot start
Chromium's sandbox can explicitly set `BROWSER_NO_SANDBOX=1` for this local test.

Run `npm install` after pulling dependency changes, then `npm test` and open
http://localhost:3000. The playground uses the exported renderer and refreshes
automatically when you change the model, facing, scale, body parts, or colors.
Animation and equipment selectors, playback speed, pause/restart buttons, and a
frame slider make it possible to inspect individual poses. Brutes also support
production body/color strings under **Import appearance**. `window.fighter`
exposes the current holder in the browser console.

The playground code is split into `PlaygroundControls.ts` (form state and DOM),
`PlaygroundPreview.ts` (Pixi lifecycle and rendering), `playgroundState.ts`
(appearance defaults), and `previewData.ts` (available choices). `index.ts` only
boots the page and connects those pieces.

At normal speed the preview renders at most 30 times per second, and stops
rendering when paused, hidden, offscreen, scrolling, or focused on a color picker.
Live color edits reuse the current fighter through `setColors()`;
model/body/scale changes recreate it.

### Performance checks

`npm run benchmark -- current` measures symbol import/heap size, raw/gzip/Brotli
data size, cold and warm construction, steady pose updates for every model, and
real WebGL rendering with one and eight fighters. Reports live under
`.packaging-test/performance/current`. To compare another built version, pass a
directory containing its `Symbols.js`, `Symbols.mjs`, and `symbol-data.cjs`:

```sh
npm run benchmark -- baseline path/to/baseline/dist
```

The CPU test separates scene traversal from SVG decoding and GPU work. The browser
test uses the same Chromium/SwiftShader settings as the rendering checks and waits
for GPU completion. Timings are local measurements, not universal FPS guarantees;
run comparisons sequentially on the same machine. Run `npm run test:comparison`
after optimization to check source fidelity as well as speed.

The renderer compiles shared frame plans once, instead of rebuilding name maps or
serializing filter settings on every pose. Simple color variants are rendered once
into reusable textures shared by matching fighters on the same renderer. Groups
needing masks or composite effects keep their filters. Recoloring and destruction
release borrowed variants; a texture is freed when its last user releases it.
Shared base SVG textures are retained. The tests
check that warmed playback neither reloads SVGs nor recreates color textures, and
that recoloring releases obsolete GPU textures.

## Publishing from CI

`.github/workflows/release-please.yml` publishes to npm when release-please creates
a release on `main`. It uses GitHub Actions OIDC trusted publishing, without an
`NPM_TOKEN` secret. Node 24 supplies a compatible npm CLI (11.5.1 or later), and
`id-token: write` lets npm authenticate the workflow. `npm run deploy` invokes
`npm publish`; its `prepublishOnly` hook builds the package and runs the tests.
