'use strict';

var symbolData_cjs = require('./symbol-data.cjs');
var pixi_js = require('pixi.js');

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol */


function __classPrivateFieldGet(receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
}

function __classPrivateFieldSet(receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

// Shared vertex stage for source SWF effects.
const FLASH_FILTER_VERTEX = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void)
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void)
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

// Flash's outer glow is a blurred alpha silhouette behind the original image.
// This sampling kernel approximates its blur; the comparison view deliberately
// reports rasterizer differences rather than treating them as exact matches.
const FRAGMENT = `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform vec4 glowColor;
uniform vec2 radius;
uniform float strength;
uniform float innerGlow;
uniform float knockout;

void main(void)
{
  vec4 original = texture(uTexture, vTextureCoord);
  float blurred = 0.0;
  float total = 0.0;

  for (int x = -4; x <= 4; x++) {
    for (int y = -4; y <= 4; y++) {
      vec2 samplePoint = vec2(float(x), float(y)) / 4.0;
      float weight = exp(-2.0 * dot(samplePoint, samplePoint));
      float alpha = texture(uTexture,
        vTextureCoord + samplePoint * radius * uInputSize.zw).a;
      blurred += mix(alpha, 1.0 - alpha, innerGlow) * weight;
      total += weight;
    }
  }

  float alpha = clamp(blurred / total * strength, 0.0, 1.0) * glowColor.a;
  alpha *= mix(1.0 - original.a, original.a, innerGlow);
  vec4 glow = vec4(glowColor.rgb * alpha, alpha);
  finalColor = glow + original * (1.0 - knockout) * (1.0 - innerGlow * alpha);
}
`;
function createFlashGlowFilter(source, scale) {
    const color = source.color ?? [255, 255, 255, 255];
    const filter = pixi_js.Filter.from({
        gl: { vertex: FLASH_FILTER_VERTEX, fragment: FRAGMENT, name: 'flash-glow' },
        resources: {
            glowUniforms: {
                glowColor: { value: color.map((channel) => channel / 255), type: 'vec4<f32>' },
                radius: { value: [
                        (source.blurX ?? 0) * scale / 2,
                        (source.blurY ?? 0) * scale / 2,
                    ], type: 'vec2<f32>' },
                strength: { value: source.strength ?? 1, type: 'f32' },
                innerGlow: { value: (source.flags ?? 0) & 128 ? 1 : 0, type: 'f32' },
                knockout: { value: (source.flags ?? 0) & 64 ? 1 : 0, type: 'f32' },
            },
        },
    });
    filter.padding = Math.ceil(Math.max(source.blurX ?? 0, source.blurY ?? 0) * scale);
    return filter;
}

/** Flash uses additive RGB offsets, including for its named color slots. */
function createPlacementFilters(placement, color, scale = 1) {
    const filters = [];
    const multiply = color ? [1, 1, 1, 1] : placement.colorTransform?.multiply ?? [1, 1, 1, 1];
    const add = [...(placement.colorTransform?.add ?? [0, 0, 0, 0])];
    if (color) {
        const value = parseInt(color.replace('#', ''), 16);
        add[0] = ((value >> 16) & 255) - 255;
        add[1] = ((value >> 8) & 255) - 255;
        add[2] = (value & 255) - 255;
        add[3] = 0;
    }
    const changesColor = multiply.some((value) => value !== 1) || add.some((value) => value !== 0);
    if (changesColor) {
        const filter = new pixi_js.ColorMatrixFilter();
        filter.matrix = [
            multiply[0], 0, 0, 0, add[0] / 255,
            0, multiply[1], 0, 0, add[1] / 255,
            0, 0, multiply[2], 0, add[2] / 255,
            0, 0, 0, multiply[3], add[3] / 255,
        ];
        filters.push(filter);
    }
    for (const source of placement.filters ?? []) {
        if (source.type === 'colorMatrix') {
            const filter = new pixi_js.ColorMatrixFilter();
            filter.matrix = (source.matrix ?? []).map((value, index) => index % 5 === 4 ? value / 255 : value);
            filters.push(filter);
        }
        else if (source.type === 'glow') {
            filters.push(createFlashGlowFilter(source, scale));
        }
        else if (source.type === 'blur' && (source.blurX || source.blurY)) {
            filters.push(new pixi_js.BlurFilter({
                strengthX: (source.blurX ?? 0) * scale / 2,
                strengthY: (source.blurY ?? 0) * scale / 2,
                quality: Math.max(1, (source.flags ?? 8) >> 3),
            }));
        }
    }
    for (const filter of filters)
        filter.resolution = 'inherit';
    return filters;
}

/** Keep Flash's minimum stroke at one raster pixel, not one SVG coordinate unit. */
function prepareSvg(svg, resolution) {
    const minimumWidth = 1 / resolution;
    // A hair/eye symbol may be magnified several times by its parent timelines.
    // Preserve authored wider strokes, while rasterizing thinner ones as a single
    // texel. Expanding them to 1 SVG unit would magnify their borders as well.
    return svg.replace(/\sstroke-width="([\d.]+)"/g, (_, width) => ` stroke-width="${Math.max(Number(width), minimumWidth)}"`);
}

const definitions = new WeakMap();
const plans = new WeakMap();
const singleSvgs = new WeakMap();
const emptyFrame = [];
const emptyDefinitions = new Map();
/** Definitions and frame plans are shared across fighters; generated data is immutable. */
function getDefinitions(parts) {
    if (!parts)
        return emptyDefinitions;
    let indexed = definitions.get(parts);
    if (!indexed) {
        indexed = new Map(parts.map((part) => [part.name, part]));
        definitions.set(parts, indexed);
    }
    return indexed;
}
function singleSvg(symbol) {
    if (singleSvgs.has(symbol))
        return singleSvgs.get(symbol) ?? undefined;
    let result;
    // Colorizing a single unmodified SVG can be cached as a texture. Groups with
    // masks, transforms, nested selectors, or effects still use compositing filters.
    if (symbol.frames?.length === 1 && symbol.frames[0].length === 1) {
        const part = symbol.frames[0][0];
        if (!part.transform && !part.colorTransform && !part.colorIdx && !part.partIdx
            && !part.filters && !part.maskedBy && !part.isMask) {
            const child = getDefinitions(symbol.parts).get(part.name);
            result = child?.type === 'svg' ? child : child ? singleSvg(child) : undefined;
        }
    }
    singleSvgs.set(symbol, result ?? null);
    return result;
}
function getFramePlan(symbol, frame) {
    const placements = symbol.frames?.[frame];
    if (!placements?.length)
        return emptyFrame;
    let plan = plans.get(placements);
    if (plan)
        return plan;
    const indexed = getDefinitions(symbol.parts);
    const occurrences = new Map();
    plan = [];
    for (let index = 0; index < placements.length; index++) {
        const part = placements[index];
        if (part.isMask)
            continue;
        const definition = indexed.get(part.name);
        if (!definition)
            throw new Error(`Part ${part.name} not found in ${symbol.name}`);
        const occurrence = occurrences.get(part.name) ?? 0;
        occurrences.set(part.name, occurrence + 1);
        const maskName = part.maskedBy ? `Symbol${part.maskedBy}` : undefined;
        const maskPlacement = maskName ? placements.find((candidate) => candidate.name === maskName) : undefined;
        if (maskName && !maskPlacement)
            throw new Error(`Mask ${maskName} not found`);
        plan.push({
            placement: part, definition, occurrence, zIndex: placements.length - index,
            // Serialize source effects once, never in the animation traversal.
            filterKey: part.colorTransform || part.filters
                ? JSON.stringify([part.colorTransform, part.filters]) : undefined,
            coloredSvg: part.colorIdx && !part.filters && definition.type === 'symbol'
                ? singleSvg(definition) : undefined,
            mask: maskName ? { name: maskName, transform: maskPlacement.transform } : undefined,
        });
    }
    plans.set(placements, plan);
    return plan;
}

var _FighterHolder_instances, _a, _FighterHolder_sharedSvgTextureCache, _FighterHolder_sharedSvgLoadEntries, _FighterHolder_sharedColoredTextures, _FighterHolder_animationType, _FighterHolder_colors, _FighterHolder_parts, _FighterHolder_colorOffset, _FighterHolder_renderContainer, _FighterHolder_animationSymbol, _FighterHolder_isAirborn, _FighterHolder_scale, _FighterHolder_playing, _FighterHolder_frame, _FighterHolder_displayedFrame, _FighterHolder_displayedWeapon, _FighterHolder_displayedShield, _FighterHolder_previousFrame, _FighterHolder_timer, _FighterHolder_baseAnimationSpeed, _FighterHolder_svgTexturesByLabel, _FighterHolder_svgDataByLabel, _FighterHolder_svgsByLabel, _FighterHolder_maskSvgsByLabel, _FighterHolder_containerPoolByParent, _FighterHolder_allPooledContainers, _FighterHolder_frameCount, _FighterHolder_usedSvgs, _FighterHolder_usedMaskSvgs, _FighterHolder_placementFilters, _FighterHolder_renderer, _FighterHolder_coloredTextures, _FighterHolder_placementMatrix, _FighterHolder_tickerHandler, _FighterHolder_appTicker, _FighterHolder_isDestroyed, _FighterHolder_triggerEvents, _FighterHolder_collectSvgsToLoad, _FighterHolder_loadSvgs, _FighterHolder_prepareFrameRender, _FighterHolder_acquireContainer, _FighterHolder_acquireSvgSprite, _FighterHolder_acquireMaskSvgSprite, _FighterHolder_selectPartFrame, _FighterHolder_applyPlacementFilters, _FighterHolder_getColoredTexture, _FighterHolder_releaseColoredTexture, _FighterHolder_displayFrame;
const ANIMATIONS = {
    male: {
        idle: symbolData_cjs.Symbol475,
        monk: symbolData_cjs.Symbol476,
        fist: symbolData_cjs.Symbol478,
        arrive: symbolData_cjs.Symbol479,
        'hit-0': symbolData_cjs.Symbol488,
        'hit-1': symbolData_cjs.Symbol489,
        'hit-2': symbolData_cjs.Symbol490,
        run: symbolData_cjs.Symbol491,
        equip: symbolData_cjs.Symbol493,
        evade: symbolData_cjs.Symbol494,
        block: symbolData_cjs.Symbol495,
        trash: symbolData_cjs.Symbol496,
        death: symbolData_cjs.Symbol497,
        estoc: symbolData_cjs.Symbol498,
        slash: symbolData_cjs.Symbol503,
        throw: symbolData_cjs.Symbol505,
        'prepare-throw': symbolData_cjs.Symbol506,
        grab: symbolData_cjs.Symbol507,
        steal: symbolData_cjs.Symbol508,
        grabbed: symbolData_cjs.Symbol509,
        stolen: symbolData_cjs.Symbol510,
        trapped: symbolData_cjs.Symbol513,
        drink: symbolData_cjs.Symbol516,
        strengthen: symbolData_cjs.Symbol517,
        whip: symbolData_cjs.Symbol541,
        launch: symbolData_cjs.Symbol542,
        win: symbolData_cjs.Symbol543,
        train: symbolData_cjs.Symbol544,
        train2: symbolData_cjs.Symbol545,
        eat: symbolData_cjs.Symbol546,
        attack: null,
        hit: null,
    },
    female: {
        idle: symbolData_cjs.Symbol846,
        monk: symbolData_cjs.Symbol847,
        fist: symbolData_cjs.Symbol848,
        arrive: symbolData_cjs.Symbol849,
        hit: symbolData_cjs.Symbol851,
        run: symbolData_cjs.Symbol854,
        equip: symbolData_cjs.Symbol855,
        evade: symbolData_cjs.Symbol856,
        block: symbolData_cjs.Symbol857,
        trash: symbolData_cjs.Symbol858,
        death: symbolData_cjs.Symbol859,
        estoc: symbolData_cjs.Symbol860,
        slash: symbolData_cjs.Symbol861,
        throw: symbolData_cjs.Symbol863,
        'prepare-throw': symbolData_cjs.Symbol864,
        grab: symbolData_cjs.Symbol865,
        steal: symbolData_cjs.Symbol866,
        grabbed: symbolData_cjs.Symbol867,
        stolen: symbolData_cjs.Symbol868,
        trapped: symbolData_cjs.Symbol869,
        drink: symbolData_cjs.Symbol870,
        strengthen: symbolData_cjs.Symbol871,
        whip: symbolData_cjs.Symbol875,
        launch: symbolData_cjs.Symbol876,
        win: symbolData_cjs.Symbol877,
        train: symbolData_cjs.Symbol878,
        train2: symbolData_cjs.Symbol879,
        eat: symbolData_cjs.Symbol880,
        attack: null,
        'hit-0': null,
        'hit-1': null,
        'hit-2': null,
    },
    dog: {
        idle: symbolData_cjs.Symbol894,
        attack: symbolData_cjs.Symbol903,
        arrive: symbolData_cjs.Symbol904,
        hit: symbolData_cjs.Symbol905,
        run: symbolData_cjs.Symbol906,
        evade: symbolData_cjs.Symbol907,
        death: symbolData_cjs.Symbol910,
        grab: symbolData_cjs.Symbol911,
        grabbed: symbolData_cjs.Symbol912,
        trapped: symbolData_cjs.Symbol913,
        block: null,
        drink: null,
        'hit-0': null,
        'hit-1': null,
        'hit-2': null,
        equip: null,
        estoc: null,
        fist: null,
        launch: null,
        monk: null,
        'prepare-throw': null,
        slash: null,
        steal: null,
        strengthen: null,
        throw: null,
        trash: null,
        whip: null,
        win: null,
        train: null,
        train2: null,
        eat: null,
        stolen: null,
    },
    bear: {
        idle: symbolData_cjs.Symbol935,
        attack: symbolData_cjs.Symbol936,
        arrive: symbolData_cjs.Symbol937,
        hit: symbolData_cjs.Symbol938,
        run: symbolData_cjs.Symbol939,
        evade: symbolData_cjs.Symbol940,
        death: symbolData_cjs.Symbol941,
        grab: symbolData_cjs.Symbol942,
        grabbed: symbolData_cjs.Symbol943,
        trapped: symbolData_cjs.Symbol944,
        block: null,
        drink: null,
        'hit-0': null,
        'hit-1': null,
        'hit-2': null,
        equip: null,
        estoc: null,
        fist: null,
        launch: null,
        monk: null,
        'prepare-throw': null,
        slash: null,
        steal: null,
        strengthen: null,
        throw: null,
        trash: null,
        whip: null,
        win: null,
        train: null,
        train2: null,
        eat: null,
        stolen: null,
    },
};
const LOOP_START = {
    male: {
        idle: 0,
        monk: 6,
        run: 0,
        death: 24,
        trapped: 11,
        train: null,
        train2: null,
        'hit-0': null,
        'hit-1': null,
        'hit-2': null,
        'prepare-throw': null,
        grab: null,
        grabbed: null,
        stolen: null,
        steal: null,
        drink: null,
        strengthen: null,
        whip: null,
        launch: null,
        win: null,
        eat: null,
        arrive: null,
        fist: null,
        estoc: null,
        slash: null,
        throw: null,
        trash: null,
        equip: null,
        block: null,
        evade: null,
        attack: null,
        hit: null,
    },
    female: {
        idle: 0,
        monk: 12,
        run: 0,
        death: 24,
        trapped: 11,
        train: null,
        train2: null,
        'hit-0': null,
        'hit-1': null,
        'hit-2': null,
        'prepare-throw': null,
        grab: null,
        grabbed: null,
        stolen: null,
        steal: null,
        drink: null,
        strengthen: null,
        whip: null,
        launch: null,
        win: null,
        eat: null,
        arrive: null,
        fist: null,
        estoc: null,
        slash: null,
        throw: null,
        trash: null,
        equip: null,
        block: null,
        evade: null,
        attack: null,
        hit: null,
    },
    dog: {
        idle: 0,
        run: 0,
        evade: 0,
        trapped: 11,
        'hit-0': null,
        'hit-1': null,
        'hit-2': null,
        'prepare-throw': null,
        grab: null,
        grabbed: null,
        stolen: null,
        steal: null,
        drink: null,
        strengthen: null,
        whip: null,
        launch: null,
        win: null,
        eat: null,
        arrive: null,
        fist: null,
        estoc: null,
        slash: null,
        throw: null,
        trash: null,
        equip: null,
        block: null,
        attack: null,
        hit: null,
        death: null,
        monk: null,
        train: null,
        train2: null,
    },
    bear: {
        idle: 0,
        run: 0,
        trapped: 11,
        'hit-0': null,
        'hit-1': null,
        'hit-2': null,
        'prepare-throw': null,
        grab: null,
        grabbed: null,
        stolen: null,
        steal: null,
        drink: null,
        strengthen: null,
        whip: null,
        launch: null,
        win: null,
        eat: null,
        arrive: null,
        fist: null,
        estoc: null,
        slash: null,
        throw: null,
        trash: null,
        equip: null,
        block: null,
        attack: null,
        hit: null,
        death: null,
        monk: null,
        train: null,
        train2: null,
        evade: null,
    },
};
const ANIMATION_SYMBOL_NAMES = {
    male: Object.values(ANIMATIONS.male).filter(Boolean).map((a) => a?.name ?? ''),
    female: Object.values(ANIMATIONS.female).filter(Boolean).map((a) => a?.name ?? ''),
    dog: Object.values(ANIMATIONS.dog).filter(Boolean).map((a) => a?.name ?? ''),
    bear: Object.values(ANIMATIONS.bear).filter(Boolean).map((a) => a?.name ?? ''),
};
const WEAPON_SYMBOL = 'Symbol68';
const SHIELD_SYMBOL = {
    male: 'Symbol472',
    female: 'Symbol472',
    dog: '',
    bear: '',
};
const WEAPON_FRAMES = [
    null,
    'knife',
    'broadsword',
    'lance',
    'baton',
    'trident',
    'hatchet',
    'scimitar',
    'axe',
    'sword',
    'fan',
    'shuriken',
    null,
    'bumps',
    'morningStar',
    'mammothBone',
    'flail',
    'whip',
    'sai',
    'leek',
    'mug',
    'fryingPan',
    'piopio',
    'halbard',
    'trombone',
    'keyboard',
    'noodleBowl',
    'racquet',
];
const SCALE = 1;
const matrixFromObject = (obj, scale = 1) => new pixi_js.Matrix(obj?.a ?? 1, obj?.b ?? 0, obj?.c ?? 0, obj?.d ?? 1, (obj?.tx ?? 0) * scale, (obj?.ty ?? 0) * scale);
const multiplyMatrices = (left, right) => new pixi_js.Matrix(left.a * right.a + left.c * right.b, left.b * right.a + left.d * right.b, left.a * right.c + left.c * right.d, left.b * right.c + left.d * right.d, left.a * right.tx + left.c * right.ty + left.tx, left.b * right.tx + left.d * right.ty + left.ty);
// Largest stretch of a transform, including rotation, skew and reflection.
const getMatrixScale = ({ a, b, c, d }) => {
    const xSquared = a * a + b * b;
    const ySquared = c * c + d * d;
    const cross = a * c + b * d;
    return Math.sqrt((xSquared + ySquared + Math.hypot(xSquared - ySquared, 2 * cross)) / 2);
};
class FighterHolder {
    constructor(app, fighter, speed, scale = 1) {
        _FighterHolder_instances.add(this);
        _FighterHolder_animationType.set(this, void 0);
        _FighterHolder_colors.set(this, void 0);
        _FighterHolder_parts.set(this, void 0);
        _FighterHolder_colorOffset.set(this, void 0);
        // Those can change mid-fight
        this.animation = 'arrive';
        this.seekPose = {
            animation: 'idle',
            visible: true,
            airborne: false,
            hypnotised: false,
        };
        this.shield = false;
        this.weapon = null;
        _FighterHolder_renderContainer.set(this, new pixi_js.Container());
        _FighterHolder_animationSymbol.set(this, null);
        this.shadow = new pixi_js.Container();
        _FighterHolder_isAirborn.set(this, false);
        _FighterHolder_scale.set(this, 1);
        _FighterHolder_playing.set(this, true);
        _FighterHolder_frame.set(this, 0);
        _FighterHolder_displayedFrame.set(this, 0);
        _FighterHolder_displayedWeapon.set(this, null);
        _FighterHolder_displayedShield.set(this, false);
        _FighterHolder_previousFrame.set(this, -1);
        _FighterHolder_timer.set(this, 0);
        _FighterHolder_baseAnimationSpeed.set(this, 1);
        this.svgs = [];
        _FighterHolder_svgTexturesByLabel.set(this, new Map());
        _FighterHolder_svgDataByLabel.set(this, new Map());
        _FighterHolder_svgsByLabel.set(this, new Map());
        _FighterHolder_maskSvgsByLabel.set(this, new Map());
        _FighterHolder_containerPoolByParent.set(this, new WeakMap());
        _FighterHolder_allPooledContainers.set(this, []);
        _FighterHolder_frameCount.set(this, 0);
        _FighterHolder_usedSvgs.set(this, {});
        _FighterHolder_usedMaskSvgs.set(this, {});
        _FighterHolder_placementFilters.set(this, new WeakMap());
        _FighterHolder_renderer.set(this, void 0);
        _FighterHolder_coloredTextures.set(this, new Map());
        _FighterHolder_placementMatrix.set(this, new pixi_js.Matrix());
        _FighterHolder_tickerHandler.set(this, null);
        _FighterHolder_appTicker.set(this, null);
        _FighterHolder_isDestroyed.set(this, false);
        this.loaded = false;
        // Events
        this.events = {};
        this.onceEvents = {};
        _FighterHolder_triggerEvents.set(this, (event) => {
            // Trigger events
            if (this.events[event]) {
                for (const callback of this.events[event] ?? []) {
                    callback(event);
                }
            }
            // Trigger once events
            if (this.onceEvents[event]) {
                for (const callback of this.onceEvents[event] ?? []) {
                    callback(event);
                }
                delete this.onceEvents[event];
            }
            // Trigger global events
            if (this.events['*']) {
                for (const callback of this.events['*']) {
                    callback(event);
                }
            }
            // Trigger global once events
            if (this.onceEvents['*']) {
                for (const callback of this.onceEvents['*']) {
                    callback(event);
                }
                delete this.onceEvents['*'];
            }
        });
        _FighterHolder_collectSvgsToLoad.set(this, (svgsToLoadByName, parts, frame = [], parentTransform = new pixi_js.Matrix(), resolution = 1) => {
            frame.forEach((framePart) => {
                const symbol = getDefinitions(parts).get(framePart.name);
                if (!symbol) {
                    throw new Error(`Part ${framePart.name} not found in symbol parts`);
                }
                // Compose the entire placement chain, just as #displayFrame does. Small
                // source shapes can be enlarged several times by nested timeline symbols.
                const transform = framePart.transform
                    ? multiplyMatrices(parentTransform, matrixFromObject(framePart.transform))
                    : parentTransform;
                // SVG
                if (symbol.type === 'svg') {
                    const size = SCALE * __classPrivateFieldGet(this, _FighterHolder_scale, "f");
                    // Integer resolution buckets share textures between similar placements.
                    // Texture resolution changes pixel density, preserving logical size/offsets.
                    const renderScale = Math.max(1, Math.ceil(size * getMatrixScale(transform) * resolution));
                    const existing = svgsToLoadByName.get(symbol.name);
                    if (!existing || renderScale > existing.renderScale) {
                        svgsToLoadByName.set(symbol.name, {
                            svg: symbol,
                            renderScale,
                        });
                    }
                }
                else {
                    // Get frames to load
                    let framesToLoad = [];
                    // If symbol has partIdx, only load the corresponding frame
                    const partIdx = framePart.partIdx;
                    if (partIdx) {
                        const partValue = __classPrivateFieldGet(this, _FighterHolder_parts, "f")[partIdx.substring(1)];
                        if (partValue === undefined) {
                            throw new Error(`Part ${partIdx.substring(1)} not found in fighter config`);
                        }
                        framesToLoad = [__classPrivateFieldGet(this, _FighterHolder_instances, "m", _FighterHolder_selectPartFrame).call(this, symbol, partValue)];
                    }
                    else if (symbol.name === WEAPON_SYMBOL) {
                        // Load all weapon frames
                        framesToLoad = WEAPON_FRAMES.map((_, index) => index);
                    }
                    else if (symbol.name === 'Symbol526') {
                        // Special case for whip animation
                        framesToLoad = [16];
                    }
                    else {
                        // Load only the first frame
                        framesToLoad = [0];
                    }
                    // For each frame, load the corresponding SVGs
                    for (const frameIdx of framesToLoad) {
                        const currentFrame = symbol.frames?.[frameIdx];
                        if (!currentFrame) {
                            continue;
                        }
                        __classPrivateFieldGet(this, _FighterHolder_collectSvgsToLoad, "f").call(this, svgsToLoadByName, symbol.parts, currentFrame, transform, resolution);
                    }
                }
            });
        });
        _FighterHolder_loadSvgs.set(this, async (svgsToLoad) => {
            const loadingSvgs = [];
            const getTexture = (svgDataUrl, renderScale, cacheKey, svgName) => {
                const cached = __classPrivateFieldGet(FighterHolder, _a, "f", _FighterHolder_sharedSvgTextureCache).get(cacheKey);
                if (cached) {
                    return cached;
                }
                const loadPromise = pixi_js.Assets.load({
                    src: svgDataUrl,
                    data: {
                        parseAsGraphicsContext: false,
                        resolution: renderScale,
                    },
                }).catch((error) => {
                    console.error('Error creating SVG texture via Assets.load', error, svgName);
                    try {
                        return pixi_js.Texture.from(svgDataUrl);
                    }
                    catch (fallbackError) {
                        console.error('Error creating fallback SVG texture', fallbackError, svgName);
                        return null;
                    }
                });
                __classPrivateFieldGet(FighterHolder, _a, "f", _FighterHolder_sharedSvgTextureCache).set(cacheKey, loadPromise);
                return loadPromise;
            };
            for (const svgToLoad of svgsToLoad) {
                const { svg, renderScale } = svgToLoad;
                loadingSvgs.push(new Promise((resolve) => {
                    const svgSource = `${prepareSvg(svg.svg, renderScale)}<!-- ${renderScale} -->`;
                    const svgDataUrl = `data:image/svg+xml,${encodeURIComponent(svgSource)}`;
                    const cacheKey = `${svg.name}|${renderScale}`;
                    getTexture(svgDataUrl, renderScale, cacheKey, svg.name)
                        .then((texture) => {
                        if (texture) {
                            __classPrivateFieldGet(this, _FighterHolder_svgTexturesByLabel, "f").set(svg.name, texture);
                            __classPrivateFieldGet(this, _FighterHolder_svgDataByLabel, "f").set(svg.name, svg);
                        }
                    })
                        .finally(() => {
                        resolve();
                    });
                }));
            }
            await Promise.all(loadingSvgs);
        });
        _FighterHolder_prepareFrameRender.set(this, () => {
            for (const svg of this.svgs) {
                svg.visible = false;
                svg.renderable = true;
                svg.mask = null;
                svg.alpha = 1;
                svg.tint = 0xFFFFFF;
            }
            for (const maskGroup of __classPrivateFieldGet(this, _FighterHolder_maskSvgsByLabel, "f").values()) {
                for (const maskSvg of maskGroup) {
                    maskSvg.visible = false;
                    maskSvg.renderable = false;
                    maskSvg.mask = null;
                }
            }
            for (const container of __classPrivateFieldGet(this, _FighterHolder_allPooledContainers, "f")) {
                container.visible = false;
                container.mask = null;
                container.alpha = 1;
            }
        });
        _FighterHolder_acquireContainer.set(this, (label, parent, index) => {
            let poolsByLabel = __classPrivateFieldGet(this, _FighterHolder_containerPoolByParent, "f").get(parent);
            if (!poolsByLabel) {
                poolsByLabel = new Map();
                __classPrivateFieldGet(this, _FighterHolder_containerPoolByParent, "f").set(parent, poolsByLabel);
            }
            let containers = poolsByLabel.get(label);
            if (!containers) {
                containers = [];
                poolsByLabel.set(label, containers);
            }
            let container = containers[index];
            if (!container) {
                container = new pixi_js.Container();
                container.sortableChildren = true;
                container.label = label;
                container.visible = false;
                containers.push(container);
                __classPrivateFieldGet(this, _FighterHolder_allPooledContainers, "f").push(container);
            }
            if (container.parent !== parent) {
                parent.addChild(container);
            }
            return container;
        });
        _FighterHolder_acquireSvgSprite.set(this, (svgName, parent) => {
            const usedCount = __classPrivateFieldGet(this, _FighterHolder_usedSvgs, "f")[svgName] ?? 0;
            let sprites = __classPrivateFieldGet(this, _FighterHolder_svgsByLabel, "f").get(svgName);
            if (!sprites) {
                sprites = [];
                __classPrivateFieldGet(this, _FighterHolder_svgsByLabel, "f").set(svgName, sprites);
            }
            let sprite = sprites[usedCount];
            if (!sprite) {
                const texture = __classPrivateFieldGet(this, _FighterHolder_svgTexturesByLabel, "f").get(svgName);
                const svgData = __classPrivateFieldGet(this, _FighterHolder_svgDataByLabel, "f").get(svgName);
                if (!texture || !svgData) {
                    throw new Error(`Sprite ${svgName} texture not found`);
                }
                const size = SCALE * __classPrivateFieldGet(this, _FighterHolder_scale, "f");
                sprite = new pixi_js.Sprite(texture);
                sprite.label = svgName;
                sprite.scale.set(size);
                sprite.visible = false;
                if (svgData.offset) {
                    sprite.x = -(svgData.offset.x ?? 0) * size;
                    sprite.y = -(svgData.offset.y ?? 0) * size;
                }
                sprites.push(sprite);
                this.svgs.push(sprite);
            }
            if (sprite.parent !== parent) {
                parent.addChild(sprite);
            }
            __classPrivateFieldGet(this, _FighterHolder_usedSvgs, "f")[svgName] = usedCount + 1;
            return sprite;
        });
        _FighterHolder_acquireMaskSvgSprite.set(this, (svgName, parent) => {
            const usedCount = __classPrivateFieldGet(this, _FighterHolder_usedMaskSvgs, "f")[svgName] ?? 0;
            let sprites = __classPrivateFieldGet(this, _FighterHolder_maskSvgsByLabel, "f").get(svgName);
            if (!sprites) {
                sprites = [];
                __classPrivateFieldGet(this, _FighterHolder_maskSvgsByLabel, "f").set(svgName, sprites);
            }
            let sprite = sprites[usedCount];
            if (!sprite) {
                const texture = __classPrivateFieldGet(this, _FighterHolder_svgTexturesByLabel, "f").get(svgName);
                const svgData = __classPrivateFieldGet(this, _FighterHolder_svgDataByLabel, "f").get(svgName);
                if (!texture || !svgData) {
                    throw new Error(`Mask sprite ${svgName} texture not found`);
                }
                const size = SCALE * __classPrivateFieldGet(this, _FighterHolder_scale, "f");
                sprite = new pixi_js.Sprite(texture);
                sprite.label = svgName;
                sprite.scale.set(size);
                sprite.visible = false;
                sprite.renderable = false;
                if (svgData.offset) {
                    sprite.x = -(svgData.offset.x ?? 0) * size;
                    sprite.y = -(svgData.offset.y ?? 0) * size;
                }
                sprites.push(sprite);
            }
            if (sprite.parent !== parent) {
                parent.addChild(sprite);
            }
            __classPrivateFieldGet(this, _FighterHolder_usedMaskSvgs, "f")[svgName] = usedCount + 1;
            return sprite;
        });
        _FighterHolder_displayFrame.set(this, (container, symbol, placement, coloredTexture) => {
            if (!symbol)
                return;
            if (symbol.type === 'svg') {
                const sprite = __classPrivateFieldGet(this, _FighterHolder_acquireSvgSprite, "f").call(this, symbol.name, container);
                sprite.texture = coloredTexture ?? __classPrivateFieldGet(this, _FighterHolder_svgTexturesByLabel, "f").get(symbol.name);
                sprite.visible = symbol.name === SHIELD_SYMBOL[__classPrivateFieldGet(this, _FighterHolder_animationType, "f")]
                    ? this.shield
                    : this.weapon !== null || symbol.name !== 'Symbol39';
                return;
            }
            let frame = 0;
            if (placement?.partIdx) {
                const key = placement.partIdx.substring(1);
                const value = __classPrivateFieldGet(this, _FighterHolder_parts, "f")[key];
                if (value === undefined)
                    throw new Error(`Part ${key} not found in fighter config`);
                frame = __classPrivateFieldGet(this, _FighterHolder_instances, "m", _FighterHolder_selectPartFrame).call(this, symbol, value);
            }
            else if (symbol.name === WEAPON_SYMBOL) {
                frame = WEAPON_FRAMES.indexOf(this.weapon);
            }
            else if (symbol.name === 'Symbol526') {
                frame = 16;
            }
            else if (ANIMATION_SYMBOL_NAMES[__classPrivateFieldGet(this, _FighterHolder_animationType, "f")].includes(symbol.name)) {
                frame = Math.floor(__classPrivateFieldGet(this, _FighterHolder_frame, "f"));
            }
            for (const planned of getFramePlan(symbol, frame)) {
                const { placement: part, definition } = planned;
                if (definition.type === 'svg') {
                    __classPrivateFieldGet(this, _FighterHolder_displayFrame, "f").call(this, container, definition, part, coloredTexture);
                    continue;
                }
                const child = __classPrivateFieldGet(this, _FighterHolder_acquireContainer, "f").call(this, part.name, container, planned.occurrence);
                const transform = part.transform;
                const size = SCALE * __classPrivateFieldGet(this, _FighterHolder_scale, "f");
                child.setFromMatrix(__classPrivateFieldGet(this, _FighterHolder_placementMatrix, "f").set(transform?.a ?? 1, transform?.b ?? 0, transform?.c ?? 0, transform?.d ?? 1, (transform?.tx ?? 0) * size, (transform?.ty ?? 0) * size));
                child.zIndex = planned.zIndex;
                child.blendMode = part.blendMode ?? 'normal';
                child.visible = true;
                // Color selectors, color transforms, and effects belong to the placement,
                // so two instances of one definition can have different appearances.
                let nextTexture = coloredTexture;
                if (planned.coloredSvg) {
                    const color = __classPrivateFieldGet(this, _FighterHolder_colors, "f")[part.colorIdx.slice(1)];
                    if (!color)
                        throw new Error(`Color ${part.colorIdx} not found`);
                    nextTexture = __classPrivateFieldGet(this, _FighterHolder_instances, "m", _FighterHolder_getColoredTexture).call(this, planned.coloredSvg, color);
                    if (child.filters?.length)
                        child.filters = null;
                }
                else if (part.colorTransform || part.colorIdx || part.filters) {
                    __classPrivateFieldGet(this, _FighterHolder_instances, "m", _FighterHolder_applyPlacementFilters).call(this, child, planned);
                }
                else if (child.filters?.length) {
                    child.filters = null;
                }
                if (planned.mask) {
                    const { name, transform: maskTransform } = planned.mask;
                    const mask = __classPrivateFieldGet(this, _FighterHolder_acquireMaskSvgSprite, "f").call(this, name, container);
                    const artwork = __classPrivateFieldGet(this, _FighterHolder_svgDataByLabel, "f").get(name);
                    if (!artwork)
                        throw new Error(`Mask ${name} not found`);
                    const size = SCALE * __classPrivateFieldGet(this, _FighterHolder_scale, "f");
                    const origin = new pixi_js.Matrix(size, 0, 0, size, -artwork.offset.x * size, -artwork.offset.y * size);
                    mask.setFromMatrix(multiplyMatrices(matrixFromObject(maskTransform, size), origin));
                    mask.visible = true;
                    mask.renderable = false;
                    child.mask = mask;
                }
                else {
                    child.mask = null;
                }
                __classPrivateFieldGet(this, _FighterHolder_displayFrame, "f").call(this, child, definition, part, nextTexture);
            }
        });
        this.once = (event, callback) => {
            if (!this.onceEvents[event]) {
                this.onceEvents[event] = [];
            }
            (this.onceEvents[event] ?? []).push(callback);
        };
        this.on = (event, callback) => {
            if (!this.events[event]) {
                this.events[event] = [];
            }
            (this.events[event] ?? []).push(callback);
        };
        this.play = () => {
            __classPrivateFieldSet(this, _FighterHolder_playing, true, "f");
        };
        this.pause = () => {
            __classPrivateFieldSet(this, _FighterHolder_playing, false, "f");
        };
        this.waitForEvent = async (event) => new Promise((resolve) => {
            this.once(event, () => {
                resolve();
            });
        });
        // Stop / restart actualizing zIndex
        this.setAirborn = (airborn, seeking = false) => {
            this.seekPose.airborne = airborn;
            if (seeking)
                return;
            if (!airborn) {
                this.shadow.alpha = 1;
                this.shadow.y = 0;
                this.shadow.scale.set(1, 1);
                this.container.zIndex = this.container.y;
            }
            __classPrivateFieldSet(this, _FighterHolder_isAirborn, airborn, "f");
        };
        this.destroy = () => {
            if (__classPrivateFieldGet(this, _FighterHolder_isDestroyed, "f")) {
                return;
            }
            __classPrivateFieldSet(this, _FighterHolder_isDestroyed, true, "f");
            this.pause();
            // Remove ticker handler to avoid leaked callbacks
            if (__classPrivateFieldGet(this, _FighterHolder_appTicker, "f") && __classPrivateFieldGet(this, _FighterHolder_tickerHandler, "f")) {
                try {
                    __classPrivateFieldGet(this, _FighterHolder_appTicker, "f").remove(__classPrivateFieldGet(this, _FighterHolder_tickerHandler, "f"));
                }
                catch (e) {
                    console.error('Error removing ticker handler', e);
                }
                __classPrivateFieldSet(this, _FighterHolder_tickerHandler, null, "f");
                __classPrivateFieldSet(this, _FighterHolder_appTicker, null, "f");
            }
            // Filters are owned by pooled placements, while SVG textures are shared.
            for (const variants of __classPrivateFieldGet(this, _FighterHolder_coloredTextures, "f").values()) {
                for (const entry of variants.values()) {
                    __classPrivateFieldGet(this, _FighterHolder_instances, "m", _FighterHolder_releaseColoredTexture).call(this, entry);
                }
            }
            __classPrivateFieldGet(this, _FighterHolder_coloredTextures, "f").clear();
            for (const container of __classPrivateFieldGet(this, _FighterHolder_allPooledContainers, "f")) {
                for (const filter of __classPrivateFieldGet(this, _FighterHolder_placementFilters, "f").get(container)?.filters ?? [])
                    filter.destroy();
            }
            // Destroy container and its children
            try {
                this.container.destroy({ children: true, texture: false });
            }
            catch (e) {
                console.error('Error destroying container', e);
            }
            // Clear svg sprite references to allow GC; do not destroy their textures here.
            this.svgs = [];
            __classPrivateFieldGet(this, _FighterHolder_svgTexturesByLabel, "f").clear();
            __classPrivateFieldGet(this, _FighterHolder_svgDataByLabel, "f").clear();
            __classPrivateFieldGet(this, _FighterHolder_svgsByLabel, "f").clear();
            __classPrivateFieldGet(this, _FighterHolder_maskSvgsByLabel, "f").clear();
            __classPrivateFieldSet(this, _FighterHolder_allPooledContainers, [], "f");
            __classPrivateFieldSet(this, _FighterHolder_containerPoolByParent, new WeakMap(), "f");
            __classPrivateFieldSet(this, _FighterHolder_placementFilters, new WeakMap(), "f");
        };
        this.type = fighter.type;
        __classPrivateFieldSet(this, _FighterHolder_renderer, app.renderer, "f");
        this.name = fighter.name;
        this.shield = fighter.shield;
        this.weapon = null;
        this.idleAnimation = fighter.idleAnimation ?? 'idle';
        __classPrivateFieldSet(this, _FighterHolder_colors, { ...fighter.colors }, "f");
        __classPrivateFieldSet(this, _FighterHolder_parts, { ...fighter.parts }, "f");
        __classPrivateFieldSet(this, _FighterHolder_colorOffset, fighter.colorOffset ? { ...fighter.colorOffset } : undefined, "f");
        this.speed = speed;
        // Apply custom scale
        __classPrivateFieldSet(this, _FighterHolder_scale, scale, "f");
        __classPrivateFieldSet(this, _FighterHolder_animationType, fighter.model, "f");
        // Get all animations
        const animationsByType = Object.values(ANIMATIONS[__classPrivateFieldGet(this, _FighterHolder_animationType, "f")]);
        const symbolContainer = new pixi_js.Container();
        symbolContainer.sortableChildren = true;
        symbolContainer.x = 0;
        symbolContainer.y = 0;
        // Handle team side
        symbolContainer.scale.x = fighter.team === 'L' ? 1 : -1;
        // Reverse X for dog
        if (__classPrivateFieldGet(this, _FighterHolder_animationType, "f") === 'dog') {
            symbolContainer.scale.x *= -1;
        }
        this.container = symbolContainer;
        __classPrivateFieldGet(this, _FighterHolder_renderContainer, "f").sortableChildren = true;
        __classPrivateFieldGet(this, _FighterHolder_renderContainer, "f").visible = true;
        this.container.addChild(__classPrivateFieldGet(this, _FighterHolder_renderContainer, "f"));
        // Dimensions supplied by the caller are unscaled logical dimensions.
        const fighterModelType = fighter.model === 'male' || fighter.model === 'female'
            ? 'brute' : fighter.model;
        this.baseWidth = fighter.width * SCALE * __classPrivateFieldGet(this, _FighterHolder_scale, "f");
        this.baseHeight = fighter.height * SCALE * __classPrivateFieldGet(this, _FighterHolder_scale, "f");
        this.container.filters = fighter.filters ? [...fighter.filters] : null;
        // Create Shadow Graphics
        const shadowGraphics = new pixi_js.Graphics()
            .ellipse(0, 0, 30, 10)
            .fill({ color: 0x000000, alpha: 0.4 });
        // Create Shadow Sprite
        const shadowSprite = new pixi_js.Sprite();
        shadowSprite.texture = app.renderer.generateTexture(shadowGraphics);
        shadowSprite.anchor.set(0.5, 0.5);
        shadowSprite.width = this.baseWidth;
        shadowSprite.height = (this.baseHeight * 30) / this.baseWidth;
        if (fighterModelType === 'brute') {
            // Brute shadow
            shadowSprite.position.set(0, -0.02 * this.baseHeight);
            shadowSprite.scale.set(0.72 * __classPrivateFieldGet(this, _FighterHolder_scale, "f"), 0.7 * __classPrivateFieldGet(this, _FighterHolder_scale, "f"));
        }
        else if (fighterModelType === 'bear') {
            // Bear shadow
            shadowSprite.scale.set(1.3 * __classPrivateFieldGet(this, _FighterHolder_scale, "f"), 1.1 * __classPrivateFieldGet(this, _FighterHolder_scale, "f"));
        }
        else {
            // Dog shadow
            shadowSprite.position.set(-0.2 * this.baseHeight, 0);
            shadowSprite.scale.set(0.7 * __classPrivateFieldGet(this, _FighterHolder_scale, "f"), 0.5 * __classPrivateFieldGet(this, _FighterHolder_scale, "f"));
        }
        // Blur shadow depending on it's size
        shadowSprite.filters = [new pixi_js.BlurFilter({ strength: this.baseWidth * 0.065 })];
        // Add shadowSprite to shadow container
        this.shadow.addChild(shadowSprite);
        this.shadow.alpha = 0;
        // Add shadow Container to fightHolder
        this.container.addChild(this.shadow);
        const svgsToLoadByName = new Map();
        const svgLoadKey = JSON.stringify([
            __classPrivateFieldGet(this, _FighterHolder_animationType, "f"), __classPrivateFieldGet(this, _FighterHolder_parts, "f"), __classPrivateFieldGet(this, _FighterHolder_scale, "f"), app.renderer.resolution ?? 1,
        ]);
        const cachedSvgLoadEntries = __classPrivateFieldGet(FighterHolder, _a, "f", _FighterHolder_sharedSvgLoadEntries).get(svgLoadKey);
        __classPrivateFieldSet(this, _FighterHolder_animationSymbol, ANIMATIONS[__classPrivateFieldGet(this, _FighterHolder_animationType, "f")][this.animation], "f");
        __classPrivateFieldSet(this, _FighterHolder_frameCount, __classPrivateFieldGet(this, _FighterHolder_animationSymbol, "f")?.loopEnd !== undefined
            ? __classPrivateFieldGet(this, _FighterHolder_animationSymbol, "f").loopEnd + 1
            : __classPrivateFieldGet(this, _FighterHolder_animationSymbol, "f")?.frames?.length ?? 0, "f");
        // For each animation
        for (const animation of animationsByType) {
            if (!animation)
                continue;
            if (!cachedSvgLoadEntries) {
                for (const frame of animation.frames ?? []) {
                    __classPrivateFieldGet(this, _FighterHolder_collectSvgsToLoad, "f").call(this, svgsToLoadByName, animation.parts, frame, new pixi_js.Matrix(), app.renderer.resolution ?? 1);
                }
            }
        }
        // Color adjustment filters default to resolution 1, which would discard
        // texture detail on high-density displays after rasterization.
        for (const filter of this.container.filters ?? []) {
            filter.resolution = 'inherit';
        }
        // Load SVG textures
        const svgLoadEntries = cachedSvgLoadEntries ?? [...svgsToLoadByName.values()];
        // Refresh insertion order to retain the 32 most recently used models.
        __classPrivateFieldGet(FighterHolder, _a, "f", _FighterHolder_sharedSvgLoadEntries).delete(svgLoadKey);
        __classPrivateFieldGet(FighterHolder, _a, "f", _FighterHolder_sharedSvgLoadEntries).set(svgLoadKey, svgLoadEntries);
        if (__classPrivateFieldGet(FighterHolder, _a, "f", _FighterHolder_sharedSvgLoadEntries).size > 32) {
            const oldestKey = __classPrivateFieldGet(FighterHolder, _a, "f", _FighterHolder_sharedSvgLoadEntries).keys().next().value;
            if (oldestKey !== undefined)
                __classPrivateFieldGet(FighterHolder, _a, "f", _FighterHolder_sharedSvgLoadEntries).delete(oldestKey);
        }
        this.ready = __classPrivateFieldGet(this, _FighterHolder_loadSvgs, "f").call(this, svgLoadEntries).then(() => {
            if (__classPrivateFieldGet(this, _FighterHolder_isDestroyed, "f") || this.container.destroyed) {
                return;
            }
            // Loaded event
            this.loaded = true;
            // Play animation (loop on frames with PIXI ticker)
            __classPrivateFieldSet(this, _FighterHolder_appTicker, app.ticker ?? null, "f");
            __classPrivateFieldSet(this, _FighterHolder_tickerHandler, () => {
                if (this.container.destroyed)
                    return;
                // Update zIndex if not airborn
                if (!__classPrivateFieldGet(this, _FighterHolder_isAirborn, "f")) {
                    this.container.zIndex = this.container.y;
                }
                // Do nothing if not playing
                if (!__classPrivateFieldGet(this, _FighterHolder_playing, "f")) {
                    return;
                }
                const tickRate = 1000 / (30 * this.speed.current);
                __classPrivateFieldSet(this, _FighterHolder_timer, __classPrivateFieldGet(this, _FighterHolder_timer, "f") + ((__classPrivateFieldGet(this, _FighterHolder_appTicker, "f")?.elapsedMS) ?? 0), "f");
                if (__classPrivateFieldGet(this, _FighterHolder_timer, "f") === 0 || __classPrivateFieldGet(this, _FighterHolder_timer, "f") >= tickRate) {
                    __classPrivateFieldSet(this, _FighterHolder_timer, __classPrivateFieldGet(this, _FighterHolder_timer, "f") % tickRate, "f");
                    const loopStart = LOOP_START[__classPrivateFieldGet(this, _FighterHolder_animationType, "f")][this.animation];
                    if (__classPrivateFieldGet(this, _FighterHolder_frame, "f") >= __classPrivateFieldGet(this, _FighterHolder_frameCount, "f") && loopStart !== null) {
                        __classPrivateFieldSet(this, _FighterHolder_frame, loopStart, "f");
                    }
                    __classPrivateFieldGet(this, _FighterHolder_prepareFrameRender, "f").call(this);
                    // Display frame
                    __classPrivateFieldSet(this, _FighterHolder_usedSvgs, {}, "f");
                    __classPrivateFieldSet(this, _FighterHolder_usedMaskSvgs, {}, "f");
                    __classPrivateFieldGet(this, _FighterHolder_displayFrame, "f").call(this, __classPrivateFieldGet(this, _FighterHolder_renderContainer, "f"), __classPrivateFieldGet(this, _FighterHolder_animationSymbol, "f"));
                    __classPrivateFieldSet(this, _FighterHolder_displayedFrame, __classPrivateFieldGet(this, _FighterHolder_frame, "f"), "f");
                    __classPrivateFieldSet(this, _FighterHolder_displayedWeapon, this.weapon, "f");
                    __classPrivateFieldSet(this, _FighterHolder_displayedShield, this.shield, "f");
                    const currentFrame = Math.floor(__classPrivateFieldGet(this, _FighterHolder_frame, "f"));
                    const frameChanged = currentFrame !== __classPrivateFieldGet(this, _FighterHolder_previousFrame, "f");
                    // Only trigger events when we've moved to a new frame
                    if (frameChanged) {
                        // :start event
                        if (currentFrame === 0) {
                            __classPrivateFieldGet(this, _FighterHolder_triggerEvents, "f").call(this, `${this.animation}:start`);
                        }
                        // :trashed event
                        if (this.animation === 'trash' && currentFrame === 3) {
                            __classPrivateFieldGet(this, _FighterHolder_triggerEvents, "f").call(this, `${this.animation}:trashed`);
                        }
                        // :hand-raised event (win animation is faster for female)
                        if (this.animation === 'win'
                            && currentFrame === (__classPrivateFieldGet(this, _FighterHolder_animationType, "f") === 'male' ? 52 : 27)) {
                            __classPrivateFieldGet(this, _FighterHolder_triggerEvents, "f").call(this, `${this.animation}:hand-raised`);
                        }
                        // :hit event
                        if (this.animation === 'fist' && currentFrame === 2) {
                            __classPrivateFieldGet(this, _FighterHolder_triggerEvents, "f").call(this, `${this.animation}:hit`);
                        }
                        else if (this.animation === 'estoc' && currentFrame === 4) {
                            __classPrivateFieldGet(this, _FighterHolder_triggerEvents, "f").call(this, `${this.animation}:hit`);
                        }
                        else if (this.animation === 'slash' && currentFrame === 5) {
                            __classPrivateFieldGet(this, _FighterHolder_triggerEvents, "f").call(this, `${this.animation}:hit`);
                        }
                        else if (this.animation === 'whip' && currentFrame === 4) {
                            __classPrivateFieldGet(this, _FighterHolder_triggerEvents, "f").call(this, `${this.animation}:hit`);
                        }
                        else if (this.animation === 'attack' && __classPrivateFieldGet(this, _FighterHolder_animationType, "f") === 'dog' && currentFrame === 2) {
                            __classPrivateFieldGet(this, _FighterHolder_triggerEvents, "f").call(this, `${this.animation}:hit`);
                        }
                        else if (this.animation === 'attack' && __classPrivateFieldGet(this, _FighterHolder_animationType, "f") === 'bear' && currentFrame === 4) {
                            __classPrivateFieldGet(this, _FighterHolder_triggerEvents, "f").call(this, `${this.animation}:hit`);
                        }
                        // :drop event
                        if (this.animation === 'death' && currentFrame === LOOP_START[__classPrivateFieldGet(this, _FighterHolder_animationType, "f")].death) {
                            __classPrivateFieldGet(this, _FighterHolder_triggerEvents, "f").call(this, `${this.animation}:drop`);
                        }
                        __classPrivateFieldSet(this, _FighterHolder_previousFrame, currentFrame, "f");
                    }
                    __classPrivateFieldSet(this, _FighterHolder_frame, __classPrivateFieldGet(this, _FighterHolder_frame, "f") + this.animationSpeed, "f");
                    // :end event
                    if ((__classPrivateFieldGet(this, _FighterHolder_frame, "f") >= __classPrivateFieldGet(this, _FighterHolder_frameCount, "f") || __classPrivateFieldGet(this, _FighterHolder_frame, "f") < 0)
                        && LOOP_START[__classPrivateFieldGet(this, _FighterHolder_animationType, "f")]?.[this.animation] === null) {
                        __classPrivateFieldSet(this, _FighterHolder_playing, false, "f");
                        __classPrivateFieldGet(this, _FighterHolder_triggerEvents, "f").call(this, `${this.animation}:${__classPrivateFieldGet(this, _FighterHolder_frame, "f") < 0 ? 'start' : 'end'}`);
                    }
                }
            }, "f");
            if (__classPrivateFieldGet(this, _FighterHolder_appTicker, "f")) {
                __classPrivateFieldGet(this, _FighterHolder_appTicker, "f").add(__classPrivateFieldGet(this, _FighterHolder_tickerHandler, "f"));
            }
        });
    }
    // Getter and setter for animationSpeed that accounts for scale
    get animationSpeed() {
        return __classPrivateFieldGet(this, _FighterHolder_baseAnimationSpeed, "f") / __classPrivateFieldGet(this, _FighterHolder_scale, "f");
    }
    set animationSpeed(value) {
        __classPrivateFieldSet(this, _FighterHolder_baseAnimationSpeed, value, "f");
    }
    get baseAnimationSpeed() {
        return __classPrivateFieldGet(this, _FighterHolder_baseAnimationSpeed, "f");
    }
    /** Recolor the displayed pose without loading textures or restarting playback. */
    setColors(colors) {
        Object.assign(__classPrivateFieldGet(this, _FighterHolder_colors, "f"), colors);
        const retainedColors = new Set(Object.values(__classPrivateFieldGet(this, _FighterHolder_colors, "f")));
        for (const [svg, variants] of __classPrivateFieldGet(this, _FighterHolder_coloredTextures, "f")) {
            for (const [color, entry] of variants) {
                if (!retainedColors.has(color)) {
                    __classPrivateFieldGet(this, _FighterHolder_instances, "m", _FighterHolder_releaseColoredTexture).call(this, entry);
                    variants.delete(color);
                }
            }
            if (!variants.size)
                __classPrivateFieldGet(this, _FighterHolder_coloredTextures, "f").delete(svg);
        }
        if (!this.loaded || __classPrivateFieldGet(this, _FighterHolder_isDestroyed, "f")) {
            return;
        }
        // The playback cursor points at the next pose. Repaint the displayed pose
        // temporarily, then restore that cursor so animation timing stays intact.
        const nextFrame = __classPrivateFieldGet(this, _FighterHolder_frame, "f");
        try {
            __classPrivateFieldSet(this, _FighterHolder_frame, __classPrivateFieldGet(this, _FighterHolder_displayedFrame, "f"), "f");
            __classPrivateFieldGet(this, _FighterHolder_prepareFrameRender, "f").call(this);
            __classPrivateFieldSet(this, _FighterHolder_usedSvgs, {}, "f");
            __classPrivateFieldSet(this, _FighterHolder_usedMaskSvgs, {}, "f");
            __classPrivateFieldGet(this, _FighterHolder_displayFrame, "f").call(this, __classPrivateFieldGet(this, _FighterHolder_renderContainer, "f"), __classPrivateFieldGet(this, _FighterHolder_animationSymbol, "f"));
        }
        finally {
            __classPrivateFieldSet(this, _FighterHolder_frame, nextFrame, "f");
        }
    }
    setAnimation(animation, frame = 0, seeking = false) {
        // Skip win animation for pets and bosses
        if (animation === 'win' && this.type !== 'brute')
            return;
        // Handle idle differently for monks
        const nextAnimation = animation === 'idle' ? this.idleAnimation : animation;
        this.seekPose.animation = nextAnimation;
        if (seeking)
            return;
        this.animation = nextAnimation;
        __classPrivateFieldSet(this, _FighterHolder_animationSymbol, ANIMATIONS[__classPrivateFieldGet(this, _FighterHolder_animationType, "f")][this.animation], "f");
        // Reset frame
        __classPrivateFieldSet(this, _FighterHolder_frame, frame, "f");
        __classPrivateFieldSet(this, _FighterHolder_previousFrame, -1, "f");
        __classPrivateFieldSet(this, _FighterHolder_frameCount, __classPrivateFieldGet(this, _FighterHolder_animationSymbol, "f")?.loopEnd !== undefined
            ? __classPrivateFieldGet(this, _FighterHolder_animationSymbol, "f").loopEnd + 1
            : __classPrivateFieldGet(this, _FighterHolder_animationSymbol, "f")?.frames?.length ?? 0, "f");
        __classPrivateFieldSet(this, _FighterHolder_timer, 0, "f");
        __classPrivateFieldSet(this, _FighterHolder_playing, true, "f");
        // Display frame
        __classPrivateFieldSet(this, _FighterHolder_usedSvgs, {}, "f");
        __classPrivateFieldSet(this, _FighterHolder_usedMaskSvgs, {}, "f");
        __classPrivateFieldGet(this, _FighterHolder_prepareFrameRender, "f").call(this);
        __classPrivateFieldGet(this, _FighterHolder_displayFrame, "f").call(this, __classPrivateFieldGet(this, _FighterHolder_renderContainer, "f"), __classPrivateFieldGet(this, _FighterHolder_animationSymbol, "f"));
        __classPrivateFieldSet(this, _FighterHolder_displayedFrame, frame, "f");
        __classPrivateFieldSet(this, _FighterHolder_displayedWeapon, this.weapon, "f");
        __classPrivateFieldSet(this, _FighterHolder_displayedShield, this.shield, "f");
    }
    capturePlaybackFrame() {
        return {
            animation: this.animation,
            frame: __classPrivateFieldGet(this, _FighterHolder_displayedFrame, "f"),
            airborne: __classPrivateFieldGet(this, _FighterHolder_isAirborn, "f"),
        };
    }
    renderPlaybackFrame(playback) {
        __classPrivateFieldSet(this, _FighterHolder_isAirborn, playback.airborne, "f");
        if (this.animation !== playback.animation || __classPrivateFieldGet(this, _FighterHolder_displayedFrame, "f") !== playback.frame
            || __classPrivateFieldGet(this, _FighterHolder_displayedWeapon, "f") !== this.weapon || __classPrivateFieldGet(this, _FighterHolder_displayedShield, "f") !== this.shield) {
            this.setAnimation(playback.animation, playback.frame);
        }
        this.pause();
    }
}
_a = FighterHolder, _FighterHolder_animationType = new WeakMap(), _FighterHolder_colors = new WeakMap(), _FighterHolder_parts = new WeakMap(), _FighterHolder_colorOffset = new WeakMap(), _FighterHolder_renderContainer = new WeakMap(), _FighterHolder_animationSymbol = new WeakMap(), _FighterHolder_isAirborn = new WeakMap(), _FighterHolder_scale = new WeakMap(), _FighterHolder_playing = new WeakMap(), _FighterHolder_frame = new WeakMap(), _FighterHolder_displayedFrame = new WeakMap(), _FighterHolder_displayedWeapon = new WeakMap(), _FighterHolder_displayedShield = new WeakMap(), _FighterHolder_previousFrame = new WeakMap(), _FighterHolder_timer = new WeakMap(), _FighterHolder_baseAnimationSpeed = new WeakMap(), _FighterHolder_svgTexturesByLabel = new WeakMap(), _FighterHolder_svgDataByLabel = new WeakMap(), _FighterHolder_svgsByLabel = new WeakMap(), _FighterHolder_maskSvgsByLabel = new WeakMap(), _FighterHolder_containerPoolByParent = new WeakMap(), _FighterHolder_allPooledContainers = new WeakMap(), _FighterHolder_frameCount = new WeakMap(), _FighterHolder_usedSvgs = new WeakMap(), _FighterHolder_usedMaskSvgs = new WeakMap(), _FighterHolder_placementFilters = new WeakMap(), _FighterHolder_renderer = new WeakMap(), _FighterHolder_coloredTextures = new WeakMap(), _FighterHolder_placementMatrix = new WeakMap(), _FighterHolder_tickerHandler = new WeakMap(), _FighterHolder_appTicker = new WeakMap(), _FighterHolder_isDestroyed = new WeakMap(), _FighterHolder_triggerEvents = new WeakMap(), _FighterHolder_collectSvgsToLoad = new WeakMap(), _FighterHolder_loadSvgs = new WeakMap(), _FighterHolder_prepareFrameRender = new WeakMap(), _FighterHolder_acquireContainer = new WeakMap(), _FighterHolder_acquireSvgSprite = new WeakMap(), _FighterHolder_acquireMaskSvgSprite = new WeakMap(), _FighterHolder_displayFrame = new WeakMap(), _FighterHolder_instances = new WeakSet(), _FighterHolder_selectPartFrame = function _FighterHolder_selectPartFrame(symbol, value) {
    const count = symbol.frames?.length ?? 0;
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`Invalid body selector ${value} for ${symbol.name}`);
    }
    return count > 0 ? value % count : 0;
}, _FighterHolder_applyPlacementFilters = function _FighterHolder_applyPlacementFilters(container, planned) {
    const placement = planned.placement;
    const color = placement.colorIdx
        ? __classPrivateFieldGet(this, _FighterHolder_colors, "f")[placement.colorIdx.substring(1)]
        : undefined;
    if (placement.colorIdx && !color)
        throw new Error(`Color ${placement.colorIdx} not found`);
    const key = planned.filterKey;
    let cached = __classPrivateFieldGet(this, _FighterHolder_placementFilters, "f").get(container);
    if (!cached || cached.key !== key || cached.color !== color) {
        // These filters belong to this pooled placement, not to a shared texture.
        for (const filter of cached?.filters ?? [])
            filter.destroy();
        const effective = __classPrivateFieldGet(this, _FighterHolder_colorOffset, "f") && placement.colorTransform
            ? { ...placement, colorTransform: {
                    ...placement.colorTransform,
                    add: [__classPrivateFieldGet(this, _FighterHolder_colorOffset, "f").r, __classPrivateFieldGet(this, _FighterHolder_colorOffset, "f").g, __classPrivateFieldGet(this, _FighterHolder_colorOffset, "f").b, 0],
                } }
            : placement;
        cached = { key, color, filters: createPlacementFilters(effective, color, __classPrivateFieldGet(this, _FighterHolder_scale, "f")) };
        __classPrivateFieldGet(this, _FighterHolder_placementFilters, "f").set(container, cached);
    }
    if (container.filters?.[0] !== cached.filters[0]
        || (container.filters?.length ?? 0) !== cached.filters.length) {
        container.filters = cached.filters.length ? cached.filters : null;
    }
}, _FighterHolder_getColoredTexture = function _FighterHolder_getColoredTexture(svg, color) {
    const base = __classPrivateFieldGet(this, _FighterHolder_svgTexturesByLabel, "f").get(svg.name);
    if (!base)
        throw new Error(`Texture ${svg.name} not found`);
    if (color === '#ffffff' || color === '#FFFFFF')
        return base;
    let variants = __classPrivateFieldGet(this, _FighterHolder_coloredTextures, "f").get(svg);
    const cached = variants?.get(color);
    if (cached)
        return cached.texture;
    let shared = __classPrivateFieldGet(FighterHolder, _a, "f", _FighterHolder_sharedColoredTextures).get(__classPrivateFieldGet(this, _FighterHolder_renderer, "f"));
    if (!shared) {
        shared = new Map();
        __classPrivateFieldGet(FighterHolder, _a, "f", _FighterHolder_sharedColoredTextures).set(__classPrivateFieldGet(this, _FighterHolder_renderer, "f"), shared);
    }
    const key = `${svg.name}|${base.source.resolution}|${color}`;
    const existing = shared.get(key);
    if (existing) {
        existing.references++;
        if (!variants) {
            variants = new Map();
            __classPrivateFieldGet(this, _FighterHolder_coloredTextures, "f").set(svg, variants);
        }
        variants.set(color, existing);
        return existing.texture;
    }
    const sprite = new pixi_js.Sprite(base);
    sprite.label = svg.name;
    const filters = createPlacementFilters({ name: svg.name }, color);
    sprite.filters = filters;
    try {
        // Round the empty padding outward: fractional bounds must not crop artwork.
        const texture = __classPrivateFieldGet(this, _FighterHolder_renderer, "f").generateTexture({
            target: sprite,
            frame: new pixi_js.Rectangle(0, 0, Math.ceil(base.width), Math.ceil(base.height)),
            resolution: base.source.resolution,
            clearColor: [0, 0, 0, 0],
        });
        if (!variants) {
            variants = new Map();
            __classPrivateFieldGet(this, _FighterHolder_coloredTextures, "f").set(svg, variants);
        }
        const entry = { texture, owned: texture !== base, references: 1, key, cache: shared };
        shared.set(key, entry);
        variants.set(color, entry);
        return texture;
    }
    finally {
        sprite.destroy({ texture: false });
        for (const filter of filters)
            filter.destroy();
    }
}, _FighterHolder_releaseColoredTexture = function _FighterHolder_releaseColoredTexture(entry) {
    entry.references--;
    if (entry.references === 0) {
        entry.cache.delete(entry.key);
        if (entry.owned)
            entry.texture.destroy(true);
    }
};
// Shared across all FighterHolder instances to avoid reloading/reparsing the same SVG
// textures for each dojo pupil.
_FighterHolder_sharedSvgTextureCache = { value: new Map() };
// Reuse animation traversal for matching models. Bound this independently of
// textures so browsing many different brute appearances cannot grow it forever.
_FighterHolder_sharedSvgLoadEntries = { value: new Map() };
// Render textures belong to one renderer/context. Share matching variants
// only within that context, and keep them only while a fighter borrows them.
_FighterHolder_sharedColoredTextures = { value: new WeakMap() };

Object.defineProperty(exports, "Symbol1", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol1; }
});
Object.defineProperty(exports, "Symbol10", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol10; }
});
Object.defineProperty(exports, "Symbol100", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol100; }
});
Object.defineProperty(exports, "Symbol101", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol101; }
});
Object.defineProperty(exports, "Symbol102", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol102; }
});
Object.defineProperty(exports, "Symbol103", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol103; }
});
Object.defineProperty(exports, "Symbol104", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol104; }
});
Object.defineProperty(exports, "Symbol105", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol105; }
});
Object.defineProperty(exports, "Symbol106", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol106; }
});
Object.defineProperty(exports, "Symbol107", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol107; }
});
Object.defineProperty(exports, "Symbol108", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol108; }
});
Object.defineProperty(exports, "Symbol109", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol109; }
});
Object.defineProperty(exports, "Symbol11", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol11; }
});
Object.defineProperty(exports, "Symbol110", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol110; }
});
Object.defineProperty(exports, "Symbol111", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol111; }
});
Object.defineProperty(exports, "Symbol112", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol112; }
});
Object.defineProperty(exports, "Symbol113", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol113; }
});
Object.defineProperty(exports, "Symbol114", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol114; }
});
Object.defineProperty(exports, "Symbol115", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol115; }
});
Object.defineProperty(exports, "Symbol116", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol116; }
});
Object.defineProperty(exports, "Symbol117", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol117; }
});
Object.defineProperty(exports, "Symbol118", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol118; }
});
Object.defineProperty(exports, "Symbol119", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol119; }
});
Object.defineProperty(exports, "Symbol12", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol12; }
});
Object.defineProperty(exports, "Symbol120", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol120; }
});
Object.defineProperty(exports, "Symbol121", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol121; }
});
Object.defineProperty(exports, "Symbol122", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol122; }
});
Object.defineProperty(exports, "Symbol123", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol123; }
});
Object.defineProperty(exports, "Symbol124", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol124; }
});
Object.defineProperty(exports, "Symbol125", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol125; }
});
Object.defineProperty(exports, "Symbol126", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol126; }
});
Object.defineProperty(exports, "Symbol127", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol127; }
});
Object.defineProperty(exports, "Symbol128", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol128; }
});
Object.defineProperty(exports, "Symbol129", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol129; }
});
Object.defineProperty(exports, "Symbol13", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol13; }
});
Object.defineProperty(exports, "Symbol130", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol130; }
});
Object.defineProperty(exports, "Symbol131", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol131; }
});
Object.defineProperty(exports, "Symbol132", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol132; }
});
Object.defineProperty(exports, "Symbol133", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol133; }
});
Object.defineProperty(exports, "Symbol134", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol134; }
});
Object.defineProperty(exports, "Symbol135", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol135; }
});
Object.defineProperty(exports, "Symbol136", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol136; }
});
Object.defineProperty(exports, "Symbol137", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol137; }
});
Object.defineProperty(exports, "Symbol138", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol138; }
});
Object.defineProperty(exports, "Symbol139", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol139; }
});
Object.defineProperty(exports, "Symbol14", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol14; }
});
Object.defineProperty(exports, "Symbol140", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol140; }
});
Object.defineProperty(exports, "Symbol141", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol141; }
});
Object.defineProperty(exports, "Symbol142", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol142; }
});
Object.defineProperty(exports, "Symbol143", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol143; }
});
Object.defineProperty(exports, "Symbol144", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol144; }
});
Object.defineProperty(exports, "Symbol145", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol145; }
});
Object.defineProperty(exports, "Symbol146", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol146; }
});
Object.defineProperty(exports, "Symbol147", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol147; }
});
Object.defineProperty(exports, "Symbol148", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol148; }
});
Object.defineProperty(exports, "Symbol149", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol149; }
});
Object.defineProperty(exports, "Symbol15", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol15; }
});
Object.defineProperty(exports, "Symbol150", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol150; }
});
Object.defineProperty(exports, "Symbol151", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol151; }
});
Object.defineProperty(exports, "Symbol152", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol152; }
});
Object.defineProperty(exports, "Symbol153", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol153; }
});
Object.defineProperty(exports, "Symbol154", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol154; }
});
Object.defineProperty(exports, "Symbol155", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol155; }
});
Object.defineProperty(exports, "Symbol156", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol156; }
});
Object.defineProperty(exports, "Symbol157", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol157; }
});
Object.defineProperty(exports, "Symbol158", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol158; }
});
Object.defineProperty(exports, "Symbol159", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol159; }
});
Object.defineProperty(exports, "Symbol16", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol16; }
});
Object.defineProperty(exports, "Symbol160", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol160; }
});
Object.defineProperty(exports, "Symbol161", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol161; }
});
Object.defineProperty(exports, "Symbol162", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol162; }
});
Object.defineProperty(exports, "Symbol163", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol163; }
});
Object.defineProperty(exports, "Symbol164", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol164; }
});
Object.defineProperty(exports, "Symbol165", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol165; }
});
Object.defineProperty(exports, "Symbol166", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol166; }
});
Object.defineProperty(exports, "Symbol167", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol167; }
});
Object.defineProperty(exports, "Symbol168", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol168; }
});
Object.defineProperty(exports, "Symbol169", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol169; }
});
Object.defineProperty(exports, "Symbol17", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol17; }
});
Object.defineProperty(exports, "Symbol170", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol170; }
});
Object.defineProperty(exports, "Symbol171", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol171; }
});
Object.defineProperty(exports, "Symbol172", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol172; }
});
Object.defineProperty(exports, "Symbol173", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol173; }
});
Object.defineProperty(exports, "Symbol174", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol174; }
});
Object.defineProperty(exports, "Symbol175", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol175; }
});
Object.defineProperty(exports, "Symbol176", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol176; }
});
Object.defineProperty(exports, "Symbol177", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol177; }
});
Object.defineProperty(exports, "Symbol178", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol178; }
});
Object.defineProperty(exports, "Symbol179", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol179; }
});
Object.defineProperty(exports, "Symbol18", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol18; }
});
Object.defineProperty(exports, "Symbol180", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol180; }
});
Object.defineProperty(exports, "Symbol181", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol181; }
});
Object.defineProperty(exports, "Symbol182", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol182; }
});
Object.defineProperty(exports, "Symbol183", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol183; }
});
Object.defineProperty(exports, "Symbol184", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol184; }
});
Object.defineProperty(exports, "Symbol185", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol185; }
});
Object.defineProperty(exports, "Symbol186", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol186; }
});
Object.defineProperty(exports, "Symbol187", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol187; }
});
Object.defineProperty(exports, "Symbol188", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol188; }
});
Object.defineProperty(exports, "Symbol189", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol189; }
});
Object.defineProperty(exports, "Symbol19", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol19; }
});
Object.defineProperty(exports, "Symbol190", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol190; }
});
Object.defineProperty(exports, "Symbol191", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol191; }
});
Object.defineProperty(exports, "Symbol192", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol192; }
});
Object.defineProperty(exports, "Symbol193", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol193; }
});
Object.defineProperty(exports, "Symbol194", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol194; }
});
Object.defineProperty(exports, "Symbol195", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol195; }
});
Object.defineProperty(exports, "Symbol196", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol196; }
});
Object.defineProperty(exports, "Symbol197", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol197; }
});
Object.defineProperty(exports, "Symbol198", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol198; }
});
Object.defineProperty(exports, "Symbol199", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol199; }
});
Object.defineProperty(exports, "Symbol2", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol2; }
});
Object.defineProperty(exports, "Symbol20", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol20; }
});
Object.defineProperty(exports, "Symbol200", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol200; }
});
Object.defineProperty(exports, "Symbol201", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol201; }
});
Object.defineProperty(exports, "Symbol202", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol202; }
});
Object.defineProperty(exports, "Symbol203", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol203; }
});
Object.defineProperty(exports, "Symbol204", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol204; }
});
Object.defineProperty(exports, "Symbol205", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol205; }
});
Object.defineProperty(exports, "Symbol206", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol206; }
});
Object.defineProperty(exports, "Symbol207", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol207; }
});
Object.defineProperty(exports, "Symbol208", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol208; }
});
Object.defineProperty(exports, "Symbol209", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol209; }
});
Object.defineProperty(exports, "Symbol21", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol21; }
});
Object.defineProperty(exports, "Symbol210", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol210; }
});
Object.defineProperty(exports, "Symbol211", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol211; }
});
Object.defineProperty(exports, "Symbol212", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol212; }
});
Object.defineProperty(exports, "Symbol213", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol213; }
});
Object.defineProperty(exports, "Symbol214", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol214; }
});
Object.defineProperty(exports, "Symbol215", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol215; }
});
Object.defineProperty(exports, "Symbol216", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol216; }
});
Object.defineProperty(exports, "Symbol217", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol217; }
});
Object.defineProperty(exports, "Symbol218", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol218; }
});
Object.defineProperty(exports, "Symbol219", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol219; }
});
Object.defineProperty(exports, "Symbol22", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol22; }
});
Object.defineProperty(exports, "Symbol220", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol220; }
});
Object.defineProperty(exports, "Symbol221", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol221; }
});
Object.defineProperty(exports, "Symbol222", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol222; }
});
Object.defineProperty(exports, "Symbol223", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol223; }
});
Object.defineProperty(exports, "Symbol224", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol224; }
});
Object.defineProperty(exports, "Symbol225", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol225; }
});
Object.defineProperty(exports, "Symbol226", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol226; }
});
Object.defineProperty(exports, "Symbol227", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol227; }
});
Object.defineProperty(exports, "Symbol228", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol228; }
});
Object.defineProperty(exports, "Symbol229", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol229; }
});
Object.defineProperty(exports, "Symbol23", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol23; }
});
Object.defineProperty(exports, "Symbol230", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol230; }
});
Object.defineProperty(exports, "Symbol231", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol231; }
});
Object.defineProperty(exports, "Symbol232", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol232; }
});
Object.defineProperty(exports, "Symbol233", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol233; }
});
Object.defineProperty(exports, "Symbol234", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol234; }
});
Object.defineProperty(exports, "Symbol235", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol235; }
});
Object.defineProperty(exports, "Symbol236", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol236; }
});
Object.defineProperty(exports, "Symbol237", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol237; }
});
Object.defineProperty(exports, "Symbol238", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol238; }
});
Object.defineProperty(exports, "Symbol239", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol239; }
});
Object.defineProperty(exports, "Symbol24", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol24; }
});
Object.defineProperty(exports, "Symbol240", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol240; }
});
Object.defineProperty(exports, "Symbol241", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol241; }
});
Object.defineProperty(exports, "Symbol242", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol242; }
});
Object.defineProperty(exports, "Symbol243", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol243; }
});
Object.defineProperty(exports, "Symbol244", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol244; }
});
Object.defineProperty(exports, "Symbol245", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol245; }
});
Object.defineProperty(exports, "Symbol246", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol246; }
});
Object.defineProperty(exports, "Symbol247", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol247; }
});
Object.defineProperty(exports, "Symbol248", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol248; }
});
Object.defineProperty(exports, "Symbol249", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol249; }
});
Object.defineProperty(exports, "Symbol25", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol25; }
});
Object.defineProperty(exports, "Symbol250", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol250; }
});
Object.defineProperty(exports, "Symbol251", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol251; }
});
Object.defineProperty(exports, "Symbol252", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol252; }
});
Object.defineProperty(exports, "Symbol253", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol253; }
});
Object.defineProperty(exports, "Symbol254", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol254; }
});
Object.defineProperty(exports, "Symbol255", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol255; }
});
Object.defineProperty(exports, "Symbol256", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol256; }
});
Object.defineProperty(exports, "Symbol257", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol257; }
});
Object.defineProperty(exports, "Symbol258", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol258; }
});
Object.defineProperty(exports, "Symbol259", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol259; }
});
Object.defineProperty(exports, "Symbol26", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol26; }
});
Object.defineProperty(exports, "Symbol260", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol260; }
});
Object.defineProperty(exports, "Symbol261", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol261; }
});
Object.defineProperty(exports, "Symbol262", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol262; }
});
Object.defineProperty(exports, "Symbol263", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol263; }
});
Object.defineProperty(exports, "Symbol264", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol264; }
});
Object.defineProperty(exports, "Symbol265", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol265; }
});
Object.defineProperty(exports, "Symbol266", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol266; }
});
Object.defineProperty(exports, "Symbol267", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol267; }
});
Object.defineProperty(exports, "Symbol268", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol268; }
});
Object.defineProperty(exports, "Symbol269", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol269; }
});
Object.defineProperty(exports, "Symbol27", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol27; }
});
Object.defineProperty(exports, "Symbol270", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol270; }
});
Object.defineProperty(exports, "Symbol271", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol271; }
});
Object.defineProperty(exports, "Symbol272", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol272; }
});
Object.defineProperty(exports, "Symbol273", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol273; }
});
Object.defineProperty(exports, "Symbol274", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol274; }
});
Object.defineProperty(exports, "Symbol275", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol275; }
});
Object.defineProperty(exports, "Symbol276", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol276; }
});
Object.defineProperty(exports, "Symbol277", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol277; }
});
Object.defineProperty(exports, "Symbol278", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol278; }
});
Object.defineProperty(exports, "Symbol279", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol279; }
});
Object.defineProperty(exports, "Symbol28", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol28; }
});
Object.defineProperty(exports, "Symbol280", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol280; }
});
Object.defineProperty(exports, "Symbol281", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol281; }
});
Object.defineProperty(exports, "Symbol282", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol282; }
});
Object.defineProperty(exports, "Symbol283", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol283; }
});
Object.defineProperty(exports, "Symbol284", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol284; }
});
Object.defineProperty(exports, "Symbol285", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol285; }
});
Object.defineProperty(exports, "Symbol286", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol286; }
});
Object.defineProperty(exports, "Symbol287", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol287; }
});
Object.defineProperty(exports, "Symbol288", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol288; }
});
Object.defineProperty(exports, "Symbol289", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol289; }
});
Object.defineProperty(exports, "Symbol29", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol29; }
});
Object.defineProperty(exports, "Symbol290", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol290; }
});
Object.defineProperty(exports, "Symbol291", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol291; }
});
Object.defineProperty(exports, "Symbol292", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol292; }
});
Object.defineProperty(exports, "Symbol293", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol293; }
});
Object.defineProperty(exports, "Symbol294", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol294; }
});
Object.defineProperty(exports, "Symbol295", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol295; }
});
Object.defineProperty(exports, "Symbol296", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol296; }
});
Object.defineProperty(exports, "Symbol297", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol297; }
});
Object.defineProperty(exports, "Symbol298", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol298; }
});
Object.defineProperty(exports, "Symbol299", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol299; }
});
Object.defineProperty(exports, "Symbol3", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol3; }
});
Object.defineProperty(exports, "Symbol30", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol30; }
});
Object.defineProperty(exports, "Symbol300", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol300; }
});
Object.defineProperty(exports, "Symbol301", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol301; }
});
Object.defineProperty(exports, "Symbol302", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol302; }
});
Object.defineProperty(exports, "Symbol303", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol303; }
});
Object.defineProperty(exports, "Symbol304", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol304; }
});
Object.defineProperty(exports, "Symbol305", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol305; }
});
Object.defineProperty(exports, "Symbol306", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol306; }
});
Object.defineProperty(exports, "Symbol307", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol307; }
});
Object.defineProperty(exports, "Symbol308", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol308; }
});
Object.defineProperty(exports, "Symbol309", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol309; }
});
Object.defineProperty(exports, "Symbol31", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol31; }
});
Object.defineProperty(exports, "Symbol310", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol310; }
});
Object.defineProperty(exports, "Symbol311", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol311; }
});
Object.defineProperty(exports, "Symbol312", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol312; }
});
Object.defineProperty(exports, "Symbol313", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol313; }
});
Object.defineProperty(exports, "Symbol314", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol314; }
});
Object.defineProperty(exports, "Symbol315", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol315; }
});
Object.defineProperty(exports, "Symbol316", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol316; }
});
Object.defineProperty(exports, "Symbol317", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol317; }
});
Object.defineProperty(exports, "Symbol318", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol318; }
});
Object.defineProperty(exports, "Symbol319", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol319; }
});
Object.defineProperty(exports, "Symbol32", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol32; }
});
Object.defineProperty(exports, "Symbol320", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol320; }
});
Object.defineProperty(exports, "Symbol321", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol321; }
});
Object.defineProperty(exports, "Symbol322", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol322; }
});
Object.defineProperty(exports, "Symbol323", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol323; }
});
Object.defineProperty(exports, "Symbol324", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol324; }
});
Object.defineProperty(exports, "Symbol325", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol325; }
});
Object.defineProperty(exports, "Symbol326", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol326; }
});
Object.defineProperty(exports, "Symbol327", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol327; }
});
Object.defineProperty(exports, "Symbol328", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol328; }
});
Object.defineProperty(exports, "Symbol329", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol329; }
});
Object.defineProperty(exports, "Symbol33", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol33; }
});
Object.defineProperty(exports, "Symbol330", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol330; }
});
Object.defineProperty(exports, "Symbol331", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol331; }
});
Object.defineProperty(exports, "Symbol332", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol332; }
});
Object.defineProperty(exports, "Symbol333", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol333; }
});
Object.defineProperty(exports, "Symbol334", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol334; }
});
Object.defineProperty(exports, "Symbol335", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol335; }
});
Object.defineProperty(exports, "Symbol336", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol336; }
});
Object.defineProperty(exports, "Symbol337", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol337; }
});
Object.defineProperty(exports, "Symbol338", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol338; }
});
Object.defineProperty(exports, "Symbol339", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol339; }
});
Object.defineProperty(exports, "Symbol34", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol34; }
});
Object.defineProperty(exports, "Symbol340", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol340; }
});
Object.defineProperty(exports, "Symbol341", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol341; }
});
Object.defineProperty(exports, "Symbol342", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol342; }
});
Object.defineProperty(exports, "Symbol343", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol343; }
});
Object.defineProperty(exports, "Symbol344", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol344; }
});
Object.defineProperty(exports, "Symbol345", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol345; }
});
Object.defineProperty(exports, "Symbol346", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol346; }
});
Object.defineProperty(exports, "Symbol347", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol347; }
});
Object.defineProperty(exports, "Symbol348", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol348; }
});
Object.defineProperty(exports, "Symbol349", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol349; }
});
Object.defineProperty(exports, "Symbol35", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol35; }
});
Object.defineProperty(exports, "Symbol350", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol350; }
});
Object.defineProperty(exports, "Symbol351", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol351; }
});
Object.defineProperty(exports, "Symbol352", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol352; }
});
Object.defineProperty(exports, "Symbol353", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol353; }
});
Object.defineProperty(exports, "Symbol354", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol354; }
});
Object.defineProperty(exports, "Symbol355", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol355; }
});
Object.defineProperty(exports, "Symbol356", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol356; }
});
Object.defineProperty(exports, "Symbol357", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol357; }
});
Object.defineProperty(exports, "Symbol358", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol358; }
});
Object.defineProperty(exports, "Symbol359", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol359; }
});
Object.defineProperty(exports, "Symbol36", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol36; }
});
Object.defineProperty(exports, "Symbol360", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol360; }
});
Object.defineProperty(exports, "Symbol361", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol361; }
});
Object.defineProperty(exports, "Symbol362", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol362; }
});
Object.defineProperty(exports, "Symbol363", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol363; }
});
Object.defineProperty(exports, "Symbol364", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol364; }
});
Object.defineProperty(exports, "Symbol365", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol365; }
});
Object.defineProperty(exports, "Symbol366", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol366; }
});
Object.defineProperty(exports, "Symbol367", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol367; }
});
Object.defineProperty(exports, "Symbol368", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol368; }
});
Object.defineProperty(exports, "Symbol369", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol369; }
});
Object.defineProperty(exports, "Symbol37", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol37; }
});
Object.defineProperty(exports, "Symbol370", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol370; }
});
Object.defineProperty(exports, "Symbol371", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol371; }
});
Object.defineProperty(exports, "Symbol372", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol372; }
});
Object.defineProperty(exports, "Symbol373", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol373; }
});
Object.defineProperty(exports, "Symbol374", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol374; }
});
Object.defineProperty(exports, "Symbol375", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol375; }
});
Object.defineProperty(exports, "Symbol376", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol376; }
});
Object.defineProperty(exports, "Symbol377", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol377; }
});
Object.defineProperty(exports, "Symbol378", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol378; }
});
Object.defineProperty(exports, "Symbol379", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol379; }
});
Object.defineProperty(exports, "Symbol38", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol38; }
});
Object.defineProperty(exports, "Symbol380", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol380; }
});
Object.defineProperty(exports, "Symbol381", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol381; }
});
Object.defineProperty(exports, "Symbol382", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol382; }
});
Object.defineProperty(exports, "Symbol383", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol383; }
});
Object.defineProperty(exports, "Symbol384", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol384; }
});
Object.defineProperty(exports, "Symbol385", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol385; }
});
Object.defineProperty(exports, "Symbol386", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol386; }
});
Object.defineProperty(exports, "Symbol387", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol387; }
});
Object.defineProperty(exports, "Symbol388", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol388; }
});
Object.defineProperty(exports, "Symbol389", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol389; }
});
Object.defineProperty(exports, "Symbol39", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol39; }
});
Object.defineProperty(exports, "Symbol390", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol390; }
});
Object.defineProperty(exports, "Symbol391", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol391; }
});
Object.defineProperty(exports, "Symbol392", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol392; }
});
Object.defineProperty(exports, "Symbol393", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol393; }
});
Object.defineProperty(exports, "Symbol394", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol394; }
});
Object.defineProperty(exports, "Symbol395", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol395; }
});
Object.defineProperty(exports, "Symbol396", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol396; }
});
Object.defineProperty(exports, "Symbol397", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol397; }
});
Object.defineProperty(exports, "Symbol398", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol398; }
});
Object.defineProperty(exports, "Symbol399", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol399; }
});
Object.defineProperty(exports, "Symbol4", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol4; }
});
Object.defineProperty(exports, "Symbol40", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol40; }
});
Object.defineProperty(exports, "Symbol400", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol400; }
});
Object.defineProperty(exports, "Symbol401", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol401; }
});
Object.defineProperty(exports, "Symbol402", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol402; }
});
Object.defineProperty(exports, "Symbol403", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol403; }
});
Object.defineProperty(exports, "Symbol404", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol404; }
});
Object.defineProperty(exports, "Symbol405", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol405; }
});
Object.defineProperty(exports, "Symbol406", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol406; }
});
Object.defineProperty(exports, "Symbol407", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol407; }
});
Object.defineProperty(exports, "Symbol408", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol408; }
});
Object.defineProperty(exports, "Symbol409", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol409; }
});
Object.defineProperty(exports, "Symbol41", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol41; }
});
Object.defineProperty(exports, "Symbol410", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol410; }
});
Object.defineProperty(exports, "Symbol411", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol411; }
});
Object.defineProperty(exports, "Symbol412", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol412; }
});
Object.defineProperty(exports, "Symbol413", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol413; }
});
Object.defineProperty(exports, "Symbol414", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol414; }
});
Object.defineProperty(exports, "Symbol415", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol415; }
});
Object.defineProperty(exports, "Symbol416", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol416; }
});
Object.defineProperty(exports, "Symbol417", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol417; }
});
Object.defineProperty(exports, "Symbol418", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol418; }
});
Object.defineProperty(exports, "Symbol419", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol419; }
});
Object.defineProperty(exports, "Symbol42", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol42; }
});
Object.defineProperty(exports, "Symbol420", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol420; }
});
Object.defineProperty(exports, "Symbol421", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol421; }
});
Object.defineProperty(exports, "Symbol422", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol422; }
});
Object.defineProperty(exports, "Symbol423", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol423; }
});
Object.defineProperty(exports, "Symbol424", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol424; }
});
Object.defineProperty(exports, "Symbol425", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol425; }
});
Object.defineProperty(exports, "Symbol426", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol426; }
});
Object.defineProperty(exports, "Symbol427", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol427; }
});
Object.defineProperty(exports, "Symbol428", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol428; }
});
Object.defineProperty(exports, "Symbol429", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol429; }
});
Object.defineProperty(exports, "Symbol43", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol43; }
});
Object.defineProperty(exports, "Symbol430", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol430; }
});
Object.defineProperty(exports, "Symbol431", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol431; }
});
Object.defineProperty(exports, "Symbol432", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol432; }
});
Object.defineProperty(exports, "Symbol433", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol433; }
});
Object.defineProperty(exports, "Symbol434", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol434; }
});
Object.defineProperty(exports, "Symbol435", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol435; }
});
Object.defineProperty(exports, "Symbol436", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol436; }
});
Object.defineProperty(exports, "Symbol437", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol437; }
});
Object.defineProperty(exports, "Symbol438", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol438; }
});
Object.defineProperty(exports, "Symbol439", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol439; }
});
Object.defineProperty(exports, "Symbol44", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol44; }
});
Object.defineProperty(exports, "Symbol440", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol440; }
});
Object.defineProperty(exports, "Symbol441", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol441; }
});
Object.defineProperty(exports, "Symbol442", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol442; }
});
Object.defineProperty(exports, "Symbol443", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol443; }
});
Object.defineProperty(exports, "Symbol444", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol444; }
});
Object.defineProperty(exports, "Symbol445", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol445; }
});
Object.defineProperty(exports, "Symbol446", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol446; }
});
Object.defineProperty(exports, "Symbol447", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol447; }
});
Object.defineProperty(exports, "Symbol448", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol448; }
});
Object.defineProperty(exports, "Symbol449", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol449; }
});
Object.defineProperty(exports, "Symbol45", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol45; }
});
Object.defineProperty(exports, "Symbol450", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol450; }
});
Object.defineProperty(exports, "Symbol451", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol451; }
});
Object.defineProperty(exports, "Symbol452", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol452; }
});
Object.defineProperty(exports, "Symbol453", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol453; }
});
Object.defineProperty(exports, "Symbol454", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol454; }
});
Object.defineProperty(exports, "Symbol455", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol455; }
});
Object.defineProperty(exports, "Symbol456", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol456; }
});
Object.defineProperty(exports, "Symbol457", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol457; }
});
Object.defineProperty(exports, "Symbol458", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol458; }
});
Object.defineProperty(exports, "Symbol459", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol459; }
});
Object.defineProperty(exports, "Symbol46", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol46; }
});
Object.defineProperty(exports, "Symbol460", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol460; }
});
Object.defineProperty(exports, "Symbol461", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol461; }
});
Object.defineProperty(exports, "Symbol462", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol462; }
});
Object.defineProperty(exports, "Symbol463", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol463; }
});
Object.defineProperty(exports, "Symbol464", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol464; }
});
Object.defineProperty(exports, "Symbol465", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol465; }
});
Object.defineProperty(exports, "Symbol466", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol466; }
});
Object.defineProperty(exports, "Symbol467", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol467; }
});
Object.defineProperty(exports, "Symbol468", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol468; }
});
Object.defineProperty(exports, "Symbol469", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol469; }
});
Object.defineProperty(exports, "Symbol47", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol47; }
});
Object.defineProperty(exports, "Symbol470", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol470; }
});
Object.defineProperty(exports, "Symbol471", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol471; }
});
Object.defineProperty(exports, "Symbol472", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol472; }
});
Object.defineProperty(exports, "Symbol473", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol473; }
});
Object.defineProperty(exports, "Symbol474", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol474; }
});
Object.defineProperty(exports, "Symbol475", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol475; }
});
Object.defineProperty(exports, "Symbol476", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol476; }
});
Object.defineProperty(exports, "Symbol477", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol477; }
});
Object.defineProperty(exports, "Symbol478", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol478; }
});
Object.defineProperty(exports, "Symbol479", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol479; }
});
Object.defineProperty(exports, "Symbol48", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol48; }
});
Object.defineProperty(exports, "Symbol480", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol480; }
});
Object.defineProperty(exports, "Symbol481", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol481; }
});
Object.defineProperty(exports, "Symbol482", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol482; }
});
Object.defineProperty(exports, "Symbol483", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol483; }
});
Object.defineProperty(exports, "Symbol484", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol484; }
});
Object.defineProperty(exports, "Symbol485", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol485; }
});
Object.defineProperty(exports, "Symbol486", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol486; }
});
Object.defineProperty(exports, "Symbol487", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol487; }
});
Object.defineProperty(exports, "Symbol488", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol488; }
});
Object.defineProperty(exports, "Symbol489", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol489; }
});
Object.defineProperty(exports, "Symbol49", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol49; }
});
Object.defineProperty(exports, "Symbol490", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol490; }
});
Object.defineProperty(exports, "Symbol491", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol491; }
});
Object.defineProperty(exports, "Symbol492", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol492; }
});
Object.defineProperty(exports, "Symbol493", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol493; }
});
Object.defineProperty(exports, "Symbol494", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol494; }
});
Object.defineProperty(exports, "Symbol495", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol495; }
});
Object.defineProperty(exports, "Symbol496", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol496; }
});
Object.defineProperty(exports, "Symbol497", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol497; }
});
Object.defineProperty(exports, "Symbol498", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol498; }
});
Object.defineProperty(exports, "Symbol499", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol499; }
});
Object.defineProperty(exports, "Symbol5", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol5; }
});
Object.defineProperty(exports, "Symbol50", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol50; }
});
Object.defineProperty(exports, "Symbol500", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol500; }
});
Object.defineProperty(exports, "Symbol501", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol501; }
});
Object.defineProperty(exports, "Symbol502", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol502; }
});
Object.defineProperty(exports, "Symbol503", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol503; }
});
Object.defineProperty(exports, "Symbol504", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol504; }
});
Object.defineProperty(exports, "Symbol505", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol505; }
});
Object.defineProperty(exports, "Symbol506", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol506; }
});
Object.defineProperty(exports, "Symbol507", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol507; }
});
Object.defineProperty(exports, "Symbol508", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol508; }
});
Object.defineProperty(exports, "Symbol509", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol509; }
});
Object.defineProperty(exports, "Symbol51", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol51; }
});
Object.defineProperty(exports, "Symbol510", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol510; }
});
Object.defineProperty(exports, "Symbol511", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol511; }
});
Object.defineProperty(exports, "Symbol512", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol512; }
});
Object.defineProperty(exports, "Symbol513", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol513; }
});
Object.defineProperty(exports, "Symbol514", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol514; }
});
Object.defineProperty(exports, "Symbol515", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol515; }
});
Object.defineProperty(exports, "Symbol516", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol516; }
});
Object.defineProperty(exports, "Symbol517", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol517; }
});
Object.defineProperty(exports, "Symbol518", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol518; }
});
Object.defineProperty(exports, "Symbol519", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol519; }
});
Object.defineProperty(exports, "Symbol52", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol52; }
});
Object.defineProperty(exports, "Symbol520", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol520; }
});
Object.defineProperty(exports, "Symbol521", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol521; }
});
Object.defineProperty(exports, "Symbol522", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol522; }
});
Object.defineProperty(exports, "Symbol523", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol523; }
});
Object.defineProperty(exports, "Symbol524", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol524; }
});
Object.defineProperty(exports, "Symbol525", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol525; }
});
Object.defineProperty(exports, "Symbol526", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol526; }
});
Object.defineProperty(exports, "Symbol527", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol527; }
});
Object.defineProperty(exports, "Symbol528", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol528; }
});
Object.defineProperty(exports, "Symbol529", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol529; }
});
Object.defineProperty(exports, "Symbol53", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol53; }
});
Object.defineProperty(exports, "Symbol530", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol530; }
});
Object.defineProperty(exports, "Symbol531", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol531; }
});
Object.defineProperty(exports, "Symbol532", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol532; }
});
Object.defineProperty(exports, "Symbol533", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol533; }
});
Object.defineProperty(exports, "Symbol534", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol534; }
});
Object.defineProperty(exports, "Symbol535", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol535; }
});
Object.defineProperty(exports, "Symbol536", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol536; }
});
Object.defineProperty(exports, "Symbol537", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol537; }
});
Object.defineProperty(exports, "Symbol538", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol538; }
});
Object.defineProperty(exports, "Symbol539", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol539; }
});
Object.defineProperty(exports, "Symbol54", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol54; }
});
Object.defineProperty(exports, "Symbol540", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol540; }
});
Object.defineProperty(exports, "Symbol541", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol541; }
});
Object.defineProperty(exports, "Symbol542", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol542; }
});
Object.defineProperty(exports, "Symbol543", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol543; }
});
Object.defineProperty(exports, "Symbol544", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol544; }
});
Object.defineProperty(exports, "Symbol545", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol545; }
});
Object.defineProperty(exports, "Symbol546", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol546; }
});
Object.defineProperty(exports, "Symbol547", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol547; }
});
Object.defineProperty(exports, "Symbol548", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol548; }
});
Object.defineProperty(exports, "Symbol549", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol549; }
});
Object.defineProperty(exports, "Symbol55", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol55; }
});
Object.defineProperty(exports, "Symbol550", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol550; }
});
Object.defineProperty(exports, "Symbol551", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol551; }
});
Object.defineProperty(exports, "Symbol552", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol552; }
});
Object.defineProperty(exports, "Symbol553", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol553; }
});
Object.defineProperty(exports, "Symbol554", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol554; }
});
Object.defineProperty(exports, "Symbol555", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol555; }
});
Object.defineProperty(exports, "Symbol556", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol556; }
});
Object.defineProperty(exports, "Symbol557", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol557; }
});
Object.defineProperty(exports, "Symbol558", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol558; }
});
Object.defineProperty(exports, "Symbol559", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol559; }
});
Object.defineProperty(exports, "Symbol56", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol56; }
});
Object.defineProperty(exports, "Symbol560", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol560; }
});
Object.defineProperty(exports, "Symbol561", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol561; }
});
Object.defineProperty(exports, "Symbol562", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol562; }
});
Object.defineProperty(exports, "Symbol563", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol563; }
});
Object.defineProperty(exports, "Symbol564", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol564; }
});
Object.defineProperty(exports, "Symbol565", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol565; }
});
Object.defineProperty(exports, "Symbol566", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol566; }
});
Object.defineProperty(exports, "Symbol567", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol567; }
});
Object.defineProperty(exports, "Symbol568", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol568; }
});
Object.defineProperty(exports, "Symbol569", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol569; }
});
Object.defineProperty(exports, "Symbol57", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol57; }
});
Object.defineProperty(exports, "Symbol570", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol570; }
});
Object.defineProperty(exports, "Symbol571", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol571; }
});
Object.defineProperty(exports, "Symbol572", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol572; }
});
Object.defineProperty(exports, "Symbol573", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol573; }
});
Object.defineProperty(exports, "Symbol574", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol574; }
});
Object.defineProperty(exports, "Symbol575", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol575; }
});
Object.defineProperty(exports, "Symbol576", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol576; }
});
Object.defineProperty(exports, "Symbol577", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol577; }
});
Object.defineProperty(exports, "Symbol578", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol578; }
});
Object.defineProperty(exports, "Symbol579", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol579; }
});
Object.defineProperty(exports, "Symbol58", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol58; }
});
Object.defineProperty(exports, "Symbol580", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol580; }
});
Object.defineProperty(exports, "Symbol581", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol581; }
});
Object.defineProperty(exports, "Symbol582", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol582; }
});
Object.defineProperty(exports, "Symbol583", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol583; }
});
Object.defineProperty(exports, "Symbol584", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol584; }
});
Object.defineProperty(exports, "Symbol585", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol585; }
});
Object.defineProperty(exports, "Symbol586", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol586; }
});
Object.defineProperty(exports, "Symbol587", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol587; }
});
Object.defineProperty(exports, "Symbol588", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol588; }
});
Object.defineProperty(exports, "Symbol589", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol589; }
});
Object.defineProperty(exports, "Symbol59", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol59; }
});
Object.defineProperty(exports, "Symbol590", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol590; }
});
Object.defineProperty(exports, "Symbol591", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol591; }
});
Object.defineProperty(exports, "Symbol592", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol592; }
});
Object.defineProperty(exports, "Symbol593", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol593; }
});
Object.defineProperty(exports, "Symbol594", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol594; }
});
Object.defineProperty(exports, "Symbol595", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol595; }
});
Object.defineProperty(exports, "Symbol596", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol596; }
});
Object.defineProperty(exports, "Symbol597", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol597; }
});
Object.defineProperty(exports, "Symbol598", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol598; }
});
Object.defineProperty(exports, "Symbol599", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol599; }
});
Object.defineProperty(exports, "Symbol6", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol6; }
});
Object.defineProperty(exports, "Symbol60", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol60; }
});
Object.defineProperty(exports, "Symbol600", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol600; }
});
Object.defineProperty(exports, "Symbol601", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol601; }
});
Object.defineProperty(exports, "Symbol602", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol602; }
});
Object.defineProperty(exports, "Symbol603", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol603; }
});
Object.defineProperty(exports, "Symbol604", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol604; }
});
Object.defineProperty(exports, "Symbol605", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol605; }
});
Object.defineProperty(exports, "Symbol606", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol606; }
});
Object.defineProperty(exports, "Symbol607", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol607; }
});
Object.defineProperty(exports, "Symbol608", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol608; }
});
Object.defineProperty(exports, "Symbol609", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol609; }
});
Object.defineProperty(exports, "Symbol61", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol61; }
});
Object.defineProperty(exports, "Symbol610", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol610; }
});
Object.defineProperty(exports, "Symbol611", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol611; }
});
Object.defineProperty(exports, "Symbol612", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol612; }
});
Object.defineProperty(exports, "Symbol613", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol613; }
});
Object.defineProperty(exports, "Symbol614", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol614; }
});
Object.defineProperty(exports, "Symbol615", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol615; }
});
Object.defineProperty(exports, "Symbol616", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol616; }
});
Object.defineProperty(exports, "Symbol617", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol617; }
});
Object.defineProperty(exports, "Symbol618", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol618; }
});
Object.defineProperty(exports, "Symbol619", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol619; }
});
Object.defineProperty(exports, "Symbol62", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol62; }
});
Object.defineProperty(exports, "Symbol620", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol620; }
});
Object.defineProperty(exports, "Symbol621", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol621; }
});
Object.defineProperty(exports, "Symbol622", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol622; }
});
Object.defineProperty(exports, "Symbol623", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol623; }
});
Object.defineProperty(exports, "Symbol624", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol624; }
});
Object.defineProperty(exports, "Symbol625", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol625; }
});
Object.defineProperty(exports, "Symbol626", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol626; }
});
Object.defineProperty(exports, "Symbol627", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol627; }
});
Object.defineProperty(exports, "Symbol628", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol628; }
});
Object.defineProperty(exports, "Symbol629", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol629; }
});
Object.defineProperty(exports, "Symbol63", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol63; }
});
Object.defineProperty(exports, "Symbol630", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol630; }
});
Object.defineProperty(exports, "Symbol631", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol631; }
});
Object.defineProperty(exports, "Symbol632", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol632; }
});
Object.defineProperty(exports, "Symbol633", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol633; }
});
Object.defineProperty(exports, "Symbol634", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol634; }
});
Object.defineProperty(exports, "Symbol635", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol635; }
});
Object.defineProperty(exports, "Symbol636", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol636; }
});
Object.defineProperty(exports, "Symbol637", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol637; }
});
Object.defineProperty(exports, "Symbol638", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol638; }
});
Object.defineProperty(exports, "Symbol639", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol639; }
});
Object.defineProperty(exports, "Symbol64", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol64; }
});
Object.defineProperty(exports, "Symbol640", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol640; }
});
Object.defineProperty(exports, "Symbol641", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol641; }
});
Object.defineProperty(exports, "Symbol642", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol642; }
});
Object.defineProperty(exports, "Symbol643", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol643; }
});
Object.defineProperty(exports, "Symbol644", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol644; }
});
Object.defineProperty(exports, "Symbol645", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol645; }
});
Object.defineProperty(exports, "Symbol646", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol646; }
});
Object.defineProperty(exports, "Symbol647", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol647; }
});
Object.defineProperty(exports, "Symbol648", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol648; }
});
Object.defineProperty(exports, "Symbol649", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol649; }
});
Object.defineProperty(exports, "Symbol65", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol65; }
});
Object.defineProperty(exports, "Symbol650", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol650; }
});
Object.defineProperty(exports, "Symbol651", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol651; }
});
Object.defineProperty(exports, "Symbol652", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol652; }
});
Object.defineProperty(exports, "Symbol653", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol653; }
});
Object.defineProperty(exports, "Symbol654", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol654; }
});
Object.defineProperty(exports, "Symbol655", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol655; }
});
Object.defineProperty(exports, "Symbol656", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol656; }
});
Object.defineProperty(exports, "Symbol657", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol657; }
});
Object.defineProperty(exports, "Symbol658", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol658; }
});
Object.defineProperty(exports, "Symbol659", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol659; }
});
Object.defineProperty(exports, "Symbol66", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol66; }
});
Object.defineProperty(exports, "Symbol660", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol660; }
});
Object.defineProperty(exports, "Symbol661", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol661; }
});
Object.defineProperty(exports, "Symbol662", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol662; }
});
Object.defineProperty(exports, "Symbol663", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol663; }
});
Object.defineProperty(exports, "Symbol664", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol664; }
});
Object.defineProperty(exports, "Symbol665", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol665; }
});
Object.defineProperty(exports, "Symbol666", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol666; }
});
Object.defineProperty(exports, "Symbol667", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol667; }
});
Object.defineProperty(exports, "Symbol668", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol668; }
});
Object.defineProperty(exports, "Symbol669", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol669; }
});
Object.defineProperty(exports, "Symbol67", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol67; }
});
Object.defineProperty(exports, "Symbol670", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol670; }
});
Object.defineProperty(exports, "Symbol671", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol671; }
});
Object.defineProperty(exports, "Symbol672", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol672; }
});
Object.defineProperty(exports, "Symbol673", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol673; }
});
Object.defineProperty(exports, "Symbol674", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol674; }
});
Object.defineProperty(exports, "Symbol675", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol675; }
});
Object.defineProperty(exports, "Symbol676", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol676; }
});
Object.defineProperty(exports, "Symbol677", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol677; }
});
Object.defineProperty(exports, "Symbol678", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol678; }
});
Object.defineProperty(exports, "Symbol679", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol679; }
});
Object.defineProperty(exports, "Symbol68", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol68; }
});
Object.defineProperty(exports, "Symbol680", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol680; }
});
Object.defineProperty(exports, "Symbol681", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol681; }
});
Object.defineProperty(exports, "Symbol682", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol682; }
});
Object.defineProperty(exports, "Symbol683", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol683; }
});
Object.defineProperty(exports, "Symbol684", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol684; }
});
Object.defineProperty(exports, "Symbol685", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol685; }
});
Object.defineProperty(exports, "Symbol686", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol686; }
});
Object.defineProperty(exports, "Symbol687", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol687; }
});
Object.defineProperty(exports, "Symbol688", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol688; }
});
Object.defineProperty(exports, "Symbol689", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol689; }
});
Object.defineProperty(exports, "Symbol69", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol69; }
});
Object.defineProperty(exports, "Symbol690", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol690; }
});
Object.defineProperty(exports, "Symbol691", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol691; }
});
Object.defineProperty(exports, "Symbol692", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol692; }
});
Object.defineProperty(exports, "Symbol693", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol693; }
});
Object.defineProperty(exports, "Symbol694", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol694; }
});
Object.defineProperty(exports, "Symbol695", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol695; }
});
Object.defineProperty(exports, "Symbol696", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol696; }
});
Object.defineProperty(exports, "Symbol697", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol697; }
});
Object.defineProperty(exports, "Symbol698", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol698; }
});
Object.defineProperty(exports, "Symbol699", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol699; }
});
Object.defineProperty(exports, "Symbol7", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol7; }
});
Object.defineProperty(exports, "Symbol70", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol70; }
});
Object.defineProperty(exports, "Symbol700", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol700; }
});
Object.defineProperty(exports, "Symbol701", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol701; }
});
Object.defineProperty(exports, "Symbol702", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol702; }
});
Object.defineProperty(exports, "Symbol703", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol703; }
});
Object.defineProperty(exports, "Symbol704", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol704; }
});
Object.defineProperty(exports, "Symbol705", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol705; }
});
Object.defineProperty(exports, "Symbol706", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol706; }
});
Object.defineProperty(exports, "Symbol707", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol707; }
});
Object.defineProperty(exports, "Symbol708", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol708; }
});
Object.defineProperty(exports, "Symbol709", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol709; }
});
Object.defineProperty(exports, "Symbol71", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol71; }
});
Object.defineProperty(exports, "Symbol710", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol710; }
});
Object.defineProperty(exports, "Symbol711", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol711; }
});
Object.defineProperty(exports, "Symbol712", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol712; }
});
Object.defineProperty(exports, "Symbol713", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol713; }
});
Object.defineProperty(exports, "Symbol714", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol714; }
});
Object.defineProperty(exports, "Symbol715", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol715; }
});
Object.defineProperty(exports, "Symbol716", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol716; }
});
Object.defineProperty(exports, "Symbol717", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol717; }
});
Object.defineProperty(exports, "Symbol718", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol718; }
});
Object.defineProperty(exports, "Symbol719", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol719; }
});
Object.defineProperty(exports, "Symbol72", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol72; }
});
Object.defineProperty(exports, "Symbol720", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol720; }
});
Object.defineProperty(exports, "Symbol721", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol721; }
});
Object.defineProperty(exports, "Symbol722", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol722; }
});
Object.defineProperty(exports, "Symbol723", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol723; }
});
Object.defineProperty(exports, "Symbol724", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol724; }
});
Object.defineProperty(exports, "Symbol725", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol725; }
});
Object.defineProperty(exports, "Symbol726", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol726; }
});
Object.defineProperty(exports, "Symbol727", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol727; }
});
Object.defineProperty(exports, "Symbol728", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol728; }
});
Object.defineProperty(exports, "Symbol729", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol729; }
});
Object.defineProperty(exports, "Symbol73", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol73; }
});
Object.defineProperty(exports, "Symbol730", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol730; }
});
Object.defineProperty(exports, "Symbol731", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol731; }
});
Object.defineProperty(exports, "Symbol732", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol732; }
});
Object.defineProperty(exports, "Symbol733", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol733; }
});
Object.defineProperty(exports, "Symbol734", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol734; }
});
Object.defineProperty(exports, "Symbol735", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol735; }
});
Object.defineProperty(exports, "Symbol736", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol736; }
});
Object.defineProperty(exports, "Symbol737", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol737; }
});
Object.defineProperty(exports, "Symbol738", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol738; }
});
Object.defineProperty(exports, "Symbol739", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol739; }
});
Object.defineProperty(exports, "Symbol74", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol74; }
});
Object.defineProperty(exports, "Symbol740", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol740; }
});
Object.defineProperty(exports, "Symbol741", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol741; }
});
Object.defineProperty(exports, "Symbol742", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol742; }
});
Object.defineProperty(exports, "Symbol743", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol743; }
});
Object.defineProperty(exports, "Symbol744", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol744; }
});
Object.defineProperty(exports, "Symbol745", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol745; }
});
Object.defineProperty(exports, "Symbol746", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol746; }
});
Object.defineProperty(exports, "Symbol747", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol747; }
});
Object.defineProperty(exports, "Symbol748", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol748; }
});
Object.defineProperty(exports, "Symbol749", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol749; }
});
Object.defineProperty(exports, "Symbol75", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol75; }
});
Object.defineProperty(exports, "Symbol750", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol750; }
});
Object.defineProperty(exports, "Symbol751", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol751; }
});
Object.defineProperty(exports, "Symbol752", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol752; }
});
Object.defineProperty(exports, "Symbol753", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol753; }
});
Object.defineProperty(exports, "Symbol754", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol754; }
});
Object.defineProperty(exports, "Symbol755", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol755; }
});
Object.defineProperty(exports, "Symbol756", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol756; }
});
Object.defineProperty(exports, "Symbol757", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol757; }
});
Object.defineProperty(exports, "Symbol758", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol758; }
});
Object.defineProperty(exports, "Symbol759", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol759; }
});
Object.defineProperty(exports, "Symbol76", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol76; }
});
Object.defineProperty(exports, "Symbol760", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol760; }
});
Object.defineProperty(exports, "Symbol761", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol761; }
});
Object.defineProperty(exports, "Symbol762", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol762; }
});
Object.defineProperty(exports, "Symbol763", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol763; }
});
Object.defineProperty(exports, "Symbol764", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol764; }
});
Object.defineProperty(exports, "Symbol765", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol765; }
});
Object.defineProperty(exports, "Symbol766", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol766; }
});
Object.defineProperty(exports, "Symbol767", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol767; }
});
Object.defineProperty(exports, "Symbol768", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol768; }
});
Object.defineProperty(exports, "Symbol769", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol769; }
});
Object.defineProperty(exports, "Symbol77", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol77; }
});
Object.defineProperty(exports, "Symbol770", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol770; }
});
Object.defineProperty(exports, "Symbol771", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol771; }
});
Object.defineProperty(exports, "Symbol772", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol772; }
});
Object.defineProperty(exports, "Symbol773", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol773; }
});
Object.defineProperty(exports, "Symbol774", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol774; }
});
Object.defineProperty(exports, "Symbol775", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol775; }
});
Object.defineProperty(exports, "Symbol776", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol776; }
});
Object.defineProperty(exports, "Symbol777", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol777; }
});
Object.defineProperty(exports, "Symbol778", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol778; }
});
Object.defineProperty(exports, "Symbol779", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol779; }
});
Object.defineProperty(exports, "Symbol78", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol78; }
});
Object.defineProperty(exports, "Symbol780", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol780; }
});
Object.defineProperty(exports, "Symbol781", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol781; }
});
Object.defineProperty(exports, "Symbol782", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol782; }
});
Object.defineProperty(exports, "Symbol783", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol783; }
});
Object.defineProperty(exports, "Symbol784", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol784; }
});
Object.defineProperty(exports, "Symbol785", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol785; }
});
Object.defineProperty(exports, "Symbol786", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol786; }
});
Object.defineProperty(exports, "Symbol787", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol787; }
});
Object.defineProperty(exports, "Symbol788", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol788; }
});
Object.defineProperty(exports, "Symbol789", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol789; }
});
Object.defineProperty(exports, "Symbol79", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol79; }
});
Object.defineProperty(exports, "Symbol790", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol790; }
});
Object.defineProperty(exports, "Symbol791", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol791; }
});
Object.defineProperty(exports, "Symbol792", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol792; }
});
Object.defineProperty(exports, "Symbol793", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol793; }
});
Object.defineProperty(exports, "Symbol794", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol794; }
});
Object.defineProperty(exports, "Symbol795", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol795; }
});
Object.defineProperty(exports, "Symbol796", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol796; }
});
Object.defineProperty(exports, "Symbol797", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol797; }
});
Object.defineProperty(exports, "Symbol798", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol798; }
});
Object.defineProperty(exports, "Symbol799", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol799; }
});
Object.defineProperty(exports, "Symbol80", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol80; }
});
Object.defineProperty(exports, "Symbol800", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol800; }
});
Object.defineProperty(exports, "Symbol801", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol801; }
});
Object.defineProperty(exports, "Symbol802", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol802; }
});
Object.defineProperty(exports, "Symbol803", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol803; }
});
Object.defineProperty(exports, "Symbol804", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol804; }
});
Object.defineProperty(exports, "Symbol805", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol805; }
});
Object.defineProperty(exports, "Symbol806", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol806; }
});
Object.defineProperty(exports, "Symbol807", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol807; }
});
Object.defineProperty(exports, "Symbol808", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol808; }
});
Object.defineProperty(exports, "Symbol809", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol809; }
});
Object.defineProperty(exports, "Symbol81", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol81; }
});
Object.defineProperty(exports, "Symbol810", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol810; }
});
Object.defineProperty(exports, "Symbol811", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol811; }
});
Object.defineProperty(exports, "Symbol812", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol812; }
});
Object.defineProperty(exports, "Symbol813", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol813; }
});
Object.defineProperty(exports, "Symbol814", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol814; }
});
Object.defineProperty(exports, "Symbol815", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol815; }
});
Object.defineProperty(exports, "Symbol816", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol816; }
});
Object.defineProperty(exports, "Symbol817", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol817; }
});
Object.defineProperty(exports, "Symbol818", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol818; }
});
Object.defineProperty(exports, "Symbol819", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol819; }
});
Object.defineProperty(exports, "Symbol82", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol82; }
});
Object.defineProperty(exports, "Symbol820", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol820; }
});
Object.defineProperty(exports, "Symbol821", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol821; }
});
Object.defineProperty(exports, "Symbol822", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol822; }
});
Object.defineProperty(exports, "Symbol823", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol823; }
});
Object.defineProperty(exports, "Symbol824", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol824; }
});
Object.defineProperty(exports, "Symbol825", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol825; }
});
Object.defineProperty(exports, "Symbol826", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol826; }
});
Object.defineProperty(exports, "Symbol827", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol827; }
});
Object.defineProperty(exports, "Symbol828", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol828; }
});
Object.defineProperty(exports, "Symbol829", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol829; }
});
Object.defineProperty(exports, "Symbol83", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol83; }
});
Object.defineProperty(exports, "Symbol830", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol830; }
});
Object.defineProperty(exports, "Symbol831", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol831; }
});
Object.defineProperty(exports, "Symbol832", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol832; }
});
Object.defineProperty(exports, "Symbol833", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol833; }
});
Object.defineProperty(exports, "Symbol834", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol834; }
});
Object.defineProperty(exports, "Symbol835", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol835; }
});
Object.defineProperty(exports, "Symbol836", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol836; }
});
Object.defineProperty(exports, "Symbol837", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol837; }
});
Object.defineProperty(exports, "Symbol838", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol838; }
});
Object.defineProperty(exports, "Symbol839", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol839; }
});
Object.defineProperty(exports, "Symbol84", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol84; }
});
Object.defineProperty(exports, "Symbol840", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol840; }
});
Object.defineProperty(exports, "Symbol841", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol841; }
});
Object.defineProperty(exports, "Symbol842", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol842; }
});
Object.defineProperty(exports, "Symbol843", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol843; }
});
Object.defineProperty(exports, "Symbol844", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol844; }
});
Object.defineProperty(exports, "Symbol845", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol845; }
});
Object.defineProperty(exports, "Symbol846", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol846; }
});
Object.defineProperty(exports, "Symbol847", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol847; }
});
Object.defineProperty(exports, "Symbol848", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol848; }
});
Object.defineProperty(exports, "Symbol849", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol849; }
});
Object.defineProperty(exports, "Symbol85", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol85; }
});
Object.defineProperty(exports, "Symbol850", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol850; }
});
Object.defineProperty(exports, "Symbol851", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol851; }
});
Object.defineProperty(exports, "Symbol852", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol852; }
});
Object.defineProperty(exports, "Symbol853", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol853; }
});
Object.defineProperty(exports, "Symbol854", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol854; }
});
Object.defineProperty(exports, "Symbol855", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol855; }
});
Object.defineProperty(exports, "Symbol856", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol856; }
});
Object.defineProperty(exports, "Symbol857", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol857; }
});
Object.defineProperty(exports, "Symbol858", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol858; }
});
Object.defineProperty(exports, "Symbol859", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol859; }
});
Object.defineProperty(exports, "Symbol86", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol86; }
});
Object.defineProperty(exports, "Symbol860", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol860; }
});
Object.defineProperty(exports, "Symbol861", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol861; }
});
Object.defineProperty(exports, "Symbol862", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol862; }
});
Object.defineProperty(exports, "Symbol863", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol863; }
});
Object.defineProperty(exports, "Symbol864", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol864; }
});
Object.defineProperty(exports, "Symbol865", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol865; }
});
Object.defineProperty(exports, "Symbol866", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol866; }
});
Object.defineProperty(exports, "Symbol867", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol867; }
});
Object.defineProperty(exports, "Symbol868", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol868; }
});
Object.defineProperty(exports, "Symbol869", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol869; }
});
Object.defineProperty(exports, "Symbol87", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol87; }
});
Object.defineProperty(exports, "Symbol870", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol870; }
});
Object.defineProperty(exports, "Symbol871", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol871; }
});
Object.defineProperty(exports, "Symbol872", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol872; }
});
Object.defineProperty(exports, "Symbol873", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol873; }
});
Object.defineProperty(exports, "Symbol874", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol874; }
});
Object.defineProperty(exports, "Symbol875", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol875; }
});
Object.defineProperty(exports, "Symbol876", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol876; }
});
Object.defineProperty(exports, "Symbol877", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol877; }
});
Object.defineProperty(exports, "Symbol878", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol878; }
});
Object.defineProperty(exports, "Symbol879", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol879; }
});
Object.defineProperty(exports, "Symbol88", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol88; }
});
Object.defineProperty(exports, "Symbol880", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol880; }
});
Object.defineProperty(exports, "Symbol881", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol881; }
});
Object.defineProperty(exports, "Symbol882", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol882; }
});
Object.defineProperty(exports, "Symbol883", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol883; }
});
Object.defineProperty(exports, "Symbol884", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol884; }
});
Object.defineProperty(exports, "Symbol885", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol885; }
});
Object.defineProperty(exports, "Symbol886", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol886; }
});
Object.defineProperty(exports, "Symbol887", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol887; }
});
Object.defineProperty(exports, "Symbol888", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol888; }
});
Object.defineProperty(exports, "Symbol889", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol889; }
});
Object.defineProperty(exports, "Symbol89", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol89; }
});
Object.defineProperty(exports, "Symbol890", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol890; }
});
Object.defineProperty(exports, "Symbol891", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol891; }
});
Object.defineProperty(exports, "Symbol892", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol892; }
});
Object.defineProperty(exports, "Symbol893", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol893; }
});
Object.defineProperty(exports, "Symbol894", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol894; }
});
Object.defineProperty(exports, "Symbol895", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol895; }
});
Object.defineProperty(exports, "Symbol896", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol896; }
});
Object.defineProperty(exports, "Symbol897", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol897; }
});
Object.defineProperty(exports, "Symbol898", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol898; }
});
Object.defineProperty(exports, "Symbol899", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol899; }
});
Object.defineProperty(exports, "Symbol9", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol9; }
});
Object.defineProperty(exports, "Symbol90", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol90; }
});
Object.defineProperty(exports, "Symbol900", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol900; }
});
Object.defineProperty(exports, "Symbol901", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol901; }
});
Object.defineProperty(exports, "Symbol902", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol902; }
});
Object.defineProperty(exports, "Symbol903", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol903; }
});
Object.defineProperty(exports, "Symbol904", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol904; }
});
Object.defineProperty(exports, "Symbol905", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol905; }
});
Object.defineProperty(exports, "Symbol906", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol906; }
});
Object.defineProperty(exports, "Symbol907", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol907; }
});
Object.defineProperty(exports, "Symbol908", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol908; }
});
Object.defineProperty(exports, "Symbol909", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol909; }
});
Object.defineProperty(exports, "Symbol91", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol91; }
});
Object.defineProperty(exports, "Symbol910", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol910; }
});
Object.defineProperty(exports, "Symbol911", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol911; }
});
Object.defineProperty(exports, "Symbol912", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol912; }
});
Object.defineProperty(exports, "Symbol913", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol913; }
});
Object.defineProperty(exports, "Symbol914", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol914; }
});
Object.defineProperty(exports, "Symbol915", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol915; }
});
Object.defineProperty(exports, "Symbol916", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol916; }
});
Object.defineProperty(exports, "Symbol917", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol917; }
});
Object.defineProperty(exports, "Symbol918", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol918; }
});
Object.defineProperty(exports, "Symbol919", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol919; }
});
Object.defineProperty(exports, "Symbol92", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol92; }
});
Object.defineProperty(exports, "Symbol920", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol920; }
});
Object.defineProperty(exports, "Symbol921", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol921; }
});
Object.defineProperty(exports, "Symbol922", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol922; }
});
Object.defineProperty(exports, "Symbol923", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol923; }
});
Object.defineProperty(exports, "Symbol924", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol924; }
});
Object.defineProperty(exports, "Symbol925", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol925; }
});
Object.defineProperty(exports, "Symbol926", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol926; }
});
Object.defineProperty(exports, "Symbol927", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol927; }
});
Object.defineProperty(exports, "Symbol928", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol928; }
});
Object.defineProperty(exports, "Symbol929", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol929; }
});
Object.defineProperty(exports, "Symbol93", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol93; }
});
Object.defineProperty(exports, "Symbol930", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol930; }
});
Object.defineProperty(exports, "Symbol931", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol931; }
});
Object.defineProperty(exports, "Symbol932", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol932; }
});
Object.defineProperty(exports, "Symbol933", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol933; }
});
Object.defineProperty(exports, "Symbol934", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol934; }
});
Object.defineProperty(exports, "Symbol935", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol935; }
});
Object.defineProperty(exports, "Symbol936", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol936; }
});
Object.defineProperty(exports, "Symbol937", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol937; }
});
Object.defineProperty(exports, "Symbol938", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol938; }
});
Object.defineProperty(exports, "Symbol939", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol939; }
});
Object.defineProperty(exports, "Symbol94", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol94; }
});
Object.defineProperty(exports, "Symbol940", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol940; }
});
Object.defineProperty(exports, "Symbol941", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol941; }
});
Object.defineProperty(exports, "Symbol942", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol942; }
});
Object.defineProperty(exports, "Symbol943", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol943; }
});
Object.defineProperty(exports, "Symbol944", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol944; }
});
Object.defineProperty(exports, "Symbol945", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol945; }
});
Object.defineProperty(exports, "Symbol946", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol946; }
});
Object.defineProperty(exports, "Symbol95", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol95; }
});
Object.defineProperty(exports, "Symbol96", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol96; }
});
Object.defineProperty(exports, "Symbol97", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol97; }
});
Object.defineProperty(exports, "Symbol98", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol98; }
});
Object.defineProperty(exports, "Symbol99", {
    enumerable: true,
    get: function () { return symbolData_cjs.Symbol99; }
});
exports.FighterHolder = FighterHolder;
