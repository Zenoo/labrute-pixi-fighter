import {
  Symbol475,
  Symbol476, Symbol478, Symbol479, Symbol488, Symbol489,
  Symbol490, Symbol491, Symbol493, Symbol494, Symbol495,
  Symbol496, Symbol497, Symbol498, Symbol503, Symbol505,
  Symbol506, Symbol507, Symbol508, Symbol509,
  Symbol510, Symbol513, Symbol516, Symbol517,
  Symbol541, Symbol542, Symbol543, Symbol544,
  Symbol545, Symbol546, Symbol846, Symbol847,
  Symbol848, Symbol849, Symbol851, Symbol854,
  Symbol855, Symbol856, Symbol857, Symbol858,
  Symbol859, Symbol860, Symbol861, Symbol863,
  Symbol864, Symbol865, Symbol866, Symbol867,
  Symbol868, Symbol869, Symbol870, Symbol871,
  Symbol875, Symbol876, Symbol877, Symbol878,
  Symbol879, Symbol880, Symbol894, Symbol903,
  Symbol904, Symbol905, Symbol906, Symbol907,
  Symbol910, Symbol911, Symbol912, Symbol913,
  Symbol935, Symbol936, Symbol937, Symbol938,
  Symbol939, Symbol940, Symbol941, Symbol942,
  Symbol943, Symbol944
} from './symbols/index';
import type { ColorOffset, FramePart, Symbol as LaBruteSymbol, Svg } from './common';
import type { Animation, FighterAppearance, FighterModel, WeaponName, SpeedRef } from './fighterTypes';
import {
  Application,
  Assets,
  BlurFilter, Container, Filter, Graphics, Matrix, Rectangle, Sprite, Texture,
  Ticker
} from 'pixi.js';
import { createPlacementFilters } from './flashFilters';
import { prepareSvg } from './prepareSvg';
import { getDefinitions, getFramePlan } from './framePlan';
import type { PlannedPart } from './framePlan';

const ANIMATIONS: Record<
  FighterModel,
  Record<Animation, LaBruteSymbol | null>
> = {
  male: {
    idle: Symbol475,
    monk: Symbol476,
    fist: Symbol478,
    arrive: Symbol479,
    'hit-0': Symbol488,
    'hit-1': Symbol489,
    'hit-2': Symbol490,
    run: Symbol491,
    equip: Symbol493,
    evade: Symbol494,
    block: Symbol495,
    trash: Symbol496,
    death: Symbol497,
    estoc: Symbol498,
    slash: Symbol503,
    throw: Symbol505,
    'prepare-throw': Symbol506,
    grab: Symbol507,
    steal: Symbol508,
    grabbed: Symbol509,
    stolen: Symbol510,
    trapped: Symbol513,
    drink: Symbol516,
    strengthen: Symbol517,
    whip: Symbol541,
    launch: Symbol542,
    win: Symbol543,
    train: Symbol544,
    train2: Symbol545,
    eat: Symbol546,
    attack: null,
    hit: null,
  },
  female: {
    idle: Symbol846,
    monk: Symbol847,
    fist: Symbol848,
    arrive: Symbol849,
    hit: Symbol851,
    run: Symbol854,
    equip: Symbol855,
    evade: Symbol856,
    block: Symbol857,
    trash: Symbol858,
    death: Symbol859,
    estoc: Symbol860,
    slash: Symbol861,
    throw: Symbol863,
    'prepare-throw': Symbol864,
    grab: Symbol865,
    steal: Symbol866,
    grabbed: Symbol867,
    stolen: Symbol868,
    trapped: Symbol869,
    drink: Symbol870,
    strengthen: Symbol871,
    whip: Symbol875,
    launch: Symbol876,
    win: Symbol877,
    train: Symbol878,
    train2: Symbol879,
    eat: Symbol880,
    attack: null,
    'hit-0': null,
    'hit-1': null,
    'hit-2': null,
  },
  dog: {
    idle: Symbol894,
    attack: Symbol903,
    arrive: Symbol904,
    hit: Symbol905,
    run: Symbol906,
    evade: Symbol907,
    death: Symbol910,
    grab: Symbol911,
    grabbed: Symbol912,
    trapped: Symbol913,
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
    idle: Symbol935,
    attack: Symbol936,
    arrive: Symbol937,
    hit: Symbol938,
    run: Symbol939,
    evade: Symbol940,
    death: Symbol941,
    grab: Symbol942,
    grabbed: Symbol943,
    trapped: Symbol944,
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

const LOOP_START: Record<
  FighterModel,
  Record<Animation, number | null>
> = {
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
const SHIELD_SYMBOL: Record<FighterModel, string> = {
  male: 'Symbol472',
  female: 'Symbol472',
  dog: '',
  bear: '',
};

const WEAPON_FRAMES: (WeaponName | null)[] = [
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

type SvgLoadEntry = {
  svg: Svg;
  renderScale: number;
  minimumPixels: number;
};

type ColoredTexture = {
  texture: Texture;
  owned: boolean;
  references: number;
  key: string;
  cache: Map<string, ColoredTexture>;
};

const matrixFromObject = (obj: FramePart['transform'], scale = 1) => new Matrix(obj?.a ?? 1, obj?.b ?? 0, obj?.c ?? 0, obj?.d ?? 1, (obj?.tx ?? 0) * scale, (obj?.ty ?? 0) * scale);

const multiplyMatrices = (left: Matrix, right: Matrix) => new Matrix(
  left.a * right.a + left.c * right.b,
  left.b * right.a + left.d * right.b,
  left.a * right.c + left.c * right.d,
  left.b * right.c + left.d * right.d,
  left.a * right.tx + left.c * right.ty + left.tx,
  left.b * right.tx + left.d * right.ty + left.ty,
);

// Largest stretch of a transform, including rotation, skew and reflection.
const getMatrixScale = ({ a, b, c, d }: Matrix) => {
  const xSquared = a * a + b * b;
  const ySquared = c * c + d * d;
  const cross = a * c + b * d;
  return Math.sqrt((xSquared + ySquared + Math.hypot(xSquared - ySquared, 2 * cross)) / 2);
};

export class FighterHolder {
  // Shared across all FighterHolder instances to avoid reloading/reparsing the same SVG
  // textures for each dojo pupil.
  static readonly #sharedSvgTextureCache = new Map<string, Promise<Texture | null>>();

  // Reuse animation traversal for matching models. Bound this independently of
  // textures so browsing many different brute appearances cannot grow it forever.
  static readonly #sharedSvgLoadEntries = new Map<string, SvgLoadEntry[]>();

  // Render textures belong to one renderer/context. Share matching variants
  // only within that context, and keep them only while a fighter borrows them.
  static readonly #sharedColoredTextures = new WeakMap<Application['renderer'], Map<string, ColoredTexture>>();

  // Setup data
  readonly type: FighterAppearance['type'];

  readonly #animationType: FighterModel;

  readonly name: string;

  readonly #colors: Record<string, string>;

  readonly #parts: Record<string, number>;

  /** Animation used when idle is requested; callers can update this mid-fight. */
  idleAnimation: Animation;

  readonly #colorOffset: ColorOffset | undefined;

  // Those can change mid-fight
  animation: Animation = 'arrive';
  seekPose = {
    animation: 'idle' as Animation,
    visible: true,
    airborne: false,
    hypnotised: false,
  };

  shield = false;

  weapon: WeaponName | null = null;

  readonly baseWidth: number;

  readonly baseHeight: number;

  // PIXI
  readonly container: Container;

  #renderContainer = new Container();

  #animationSymbol: LaBruteSymbol | null = null;

  shadow: Container = new Container();

  #isAirborn = false;

  #scale = 1;

  #playing = true;

  #frame = 0;

  #displayedFrame = 0;

  #displayedWeapon: WeaponName | null = null;

  #displayedShield = false;

  #previousFrame = -1;

  #timer = 0;

  #baseAnimationSpeed = 1;

  svgs: Sprite[] = [];

  #svgTexturesByLabel = new Map<string, Texture>();

  #svgDataByLabel = new Map<string, Svg>();

  #svgsByLabel = new Map<string, Sprite[]>();

  #maskSvgsByLabel = new Map<string, Sprite[]>();

  #containerPoolByParent = new WeakMap<Container, Map<string, Container[]>>();

  #allPooledContainers: Container[] = [];

  speed: SpeedRef;

  #frameCount = 0;

  #usedSvgs: Record<string, number> = {};

  #usedMaskSvgs: Record<string, number> = {};

  #placementFilters = new WeakMap<Container, {
    key: string | undefined; color: string | undefined; filters: Filter[];
  }>();

  readonly #renderer: Application['renderer'];

  #coloredTextures = new Map<Svg, Map<string, ColoredTexture>>();
  #placementMatrix = new Matrix();

  #tickerHandler: ((ticker: Ticker) => void) | null = null;

  #appTicker: Ticker | null = null;

  #isDestroyed = false;

  loaded = false;

  /** Resolves after textures are loaded and the ticker is attached. */
  readonly ready: Promise<void>;

  // Events
  events: Record<string, ((event: string) => void)[]> = {};

  onceEvents: Record<string, ((event: string) => void)[]> = {};

  constructor(
    app: Application,
    fighter: FighterAppearance,
    speed: SpeedRef,
    scale = 1,
  ) {
    this.type = fighter.type;
    this.#renderer = app.renderer;
    this.name = fighter.name;
    this.shield = fighter.shield;
    this.weapon = null;
    this.idleAnimation = fighter.idleAnimation ?? 'idle';
    this.#colors = { ...fighter.colors };
    this.#parts = { ...fighter.parts };
    this.#colorOffset = fighter.colorOffset ? { ...fighter.colorOffset } : undefined;
    this.speed = speed;

    // Apply custom scale
    this.#scale = scale;

    this.#animationType = fighter.model;

    // Get all animations
    const animationsByType = Object.values(ANIMATIONS[this.#animationType]);

    const symbolContainer = new Container();
    symbolContainer.sortableChildren = true;
    symbolContainer.x = 0;
    symbolContainer.y = 0;

    // Handle team side
    symbolContainer.scale.x = fighter.team === 'L' ? 1 : -1;

    // Reverse X for dog
    if (this.#animationType === 'dog') {
      symbolContainer.scale.x *= -1;
    }

    this.container = symbolContainer;

    this.#renderContainer.sortableChildren = true;
    this.#renderContainer.visible = true;
    this.container.addChild(this.#renderContainer);

    // Dimensions supplied by the caller are unscaled logical dimensions.
    const fighterModelType = fighter.model === 'male' || fighter.model === 'female'
      ? 'brute' : fighter.model;
    this.baseWidth = fighter.width * SCALE * this.#scale;
    this.baseHeight = fighter.height * SCALE * this.#scale;
    this.container.filters = fighter.filters ? [...fighter.filters] : null;

    // Create Shadow Graphics
    const shadowGraphics = new Graphics()
      .ellipse(0, 0, 30, 10)
      .fill({ color: 0x000000, alpha: 0.4 });

    // Create Shadow Sprite
    const shadowSprite = new Sprite();
    shadowSprite.texture = app.renderer.generateTexture(shadowGraphics);
    shadowSprite.anchor.set(0.5, 0.5);
    shadowSprite.width = this.baseWidth;
    shadowSprite.height = (this.baseHeight * 30) / this.baseWidth;

    if (fighterModelType === 'brute') {
      // Brute shadow
      shadowSprite.position.set(0, -0.02 * this.baseHeight);
      shadowSprite.scale.set(0.72 * this.#scale, 0.7 * this.#scale);
    } else if (fighterModelType === 'bear') {
      // Bear shadow
      shadowSprite.scale.set(1.3 * this.#scale, 1.1 * this.#scale);
    } else {
      // Dog shadow
      shadowSprite.position.set(-0.2 * this.baseHeight, 0);
      shadowSprite.scale.set(0.7 * this.#scale, 0.5 * this.#scale);
    }

    // Blur shadow depending on it's size
    shadowSprite.filters = [new BlurFilter({ strength: this.baseWidth * 0.065 })];
    // Add shadowSprite to shadow container
    this.shadow.addChild(shadowSprite);
    this.shadow.alpha = 0;
    // Add shadow Container to fightHolder
    this.container.addChild(this.shadow);

    const svgsToLoadByName = new Map<string, SvgLoadEntry>();
    const svgLoadKey = JSON.stringify([
      this.#animationType, this.#parts, this.#scale, app.renderer.resolution ?? 1,
    ]);
    const cachedSvgLoadEntries = FighterHolder.#sharedSvgLoadEntries.get(svgLoadKey);

    this.#animationSymbol = ANIMATIONS[this.#animationType][this.animation];
    this.#frameCount = this.#animationSymbol?.loopEnd !== undefined
      ? this.#animationSymbol.loopEnd + 1
      : this.#animationSymbol?.frames?.length ?? 0;

    // For each animation
    for (const animation of animationsByType) {
      if (!animation) continue;

      if (!cachedSvgLoadEntries) {
        for (const frame of animation.frames ?? []) {
          this.#collectSvgsToLoad(
            svgsToLoadByName,
            animation.parts,
            frame,
            new Matrix(),
            app.renderer.resolution ?? 1,
          );
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
    FighterHolder.#sharedSvgLoadEntries.delete(svgLoadKey);
    FighterHolder.#sharedSvgLoadEntries.set(svgLoadKey, svgLoadEntries);
    if (FighterHolder.#sharedSvgLoadEntries.size > 32) {
      const oldestKey = FighterHolder.#sharedSvgLoadEntries.keys().next().value;
      if (oldestKey !== undefined) FighterHolder.#sharedSvgLoadEntries.delete(oldestKey);
    }
    this.ready = this.#loadSvgs(svgLoadEntries).then(() => {
      if (this.#isDestroyed || this.container.destroyed) {
        return;
      }

      // Loaded event
      this.loaded = true;

      // Play animation (loop on frames with PIXI ticker)
      this.#appTicker = app.ticker ?? null;
      this.#tickerHandler = () => {
        if (this.container.destroyed) return;

        // Update zIndex if not airborn
        if (!this.#isAirborn) {
          this.container.zIndex = this.container.y;
        }

        // Do nothing if not playing
        if (!this.#playing) {
          return;
        }

        const tickRate = 1000 / (30 * this.speed.current);

        this.#timer += (this.#appTicker?.elapsedMS) ?? 0;
        if (this.#timer === 0 || this.#timer >= tickRate) {
          this.#timer %= tickRate;

          const loopStart = LOOP_START[this.#animationType][this.animation];
          if (this.#frame >= this.#frameCount && loopStart !== null) {
            this.#frame = loopStart;
          }

          this.#prepareFrameRender();

          // Display frame
          this.#usedSvgs = {};
          this.#usedMaskSvgs = {};
          this.#displayFrame(this.#renderContainer, this.#animationSymbol);
          this.#displayedFrame = this.#frame;
          this.#displayedWeapon = this.weapon;
          this.#displayedShield = this.shield;

          const currentFrame = Math.floor(this.#frame);
          const frameChanged = currentFrame !== this.#previousFrame;

          // Only trigger events when we've moved to a new frame
          if (frameChanged) {
            // :start event
            if (currentFrame === 0) {
              this.#triggerEvents(`${this.animation}:start`);
            }

            // :trashed event
            if (this.animation === 'trash' && currentFrame === 3) {
              this.#triggerEvents(`${this.animation}:trashed`);
            }

            // :hand-raised event (win animation is faster for female)
            if (this.animation === 'win'
              && currentFrame === (this.#animationType === 'male' ? 52 : 27)) {
              this.#triggerEvents(`${this.animation}:hand-raised`);
            }

            // :hit event
            if (this.animation === 'fist' && currentFrame === 2) {
              this.#triggerEvents(`${this.animation}:hit`);
            } else if (this.animation === 'estoc' && currentFrame === 4) {
              this.#triggerEvents(`${this.animation}:hit`);
            } else if (this.animation === 'slash' && currentFrame === 5) {
              this.#triggerEvents(`${this.animation}:hit`);
            } else if (this.animation === 'whip' && currentFrame === 4) {
              this.#triggerEvents(`${this.animation}:hit`);
            } else if (this.animation === 'attack' && this.#animationType === 'dog' && currentFrame === 2) {
              this.#triggerEvents(`${this.animation}:hit`);
            } else if (this.animation === 'attack' && this.#animationType === 'bear' && currentFrame === 4) {
              this.#triggerEvents(`${this.animation}:hit`);
            }

            // :drop event
            if (this.animation === 'death' && currentFrame === LOOP_START[this.#animationType].death) {
              this.#triggerEvents(`${this.animation}:drop`);
            }

            this.#previousFrame = currentFrame;
          }

          this.#frame += this.animationSpeed;

          // :end event
          if ((this.#frame >= this.#frameCount || this.#frame < 0)
            && LOOP_START[this.#animationType]?.[this.animation] === null) {
            this.#playing = false;
            this.#triggerEvents(`${this.animation}:${this.#frame < 0 ? 'start' : 'end'}`);
          }
        }
      };

      if (this.#appTicker) {
        this.#appTicker.add(this.#tickerHandler);
      }
    });
  }

  // Getter and setter for animationSpeed that accounts for scale
  get animationSpeed(): number {
    return this.#baseAnimationSpeed / this.#scale;
  }

  set animationSpeed(value: number) {
    this.#baseAnimationSpeed = value;
  }

  get baseAnimationSpeed(): number {
    return this.#baseAnimationSpeed;
  }

  #triggerEvents = (event: string) => {
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
  };

  /** Recolor the displayed pose without loading textures or restarting playback. */
  setColors(colors: Readonly<Record<string, string>>) {
    Object.assign(this.#colors, colors);

    const retainedColors = new Set(Object.values(this.#colors));
    for (const [svg, variants] of this.#coloredTextures) {
      for (const [color, entry] of variants) {
        if (!retainedColors.has(color)) {
          this.#releaseColoredTexture(entry);
          variants.delete(color);
        }
      }
      if (!variants.size) this.#coloredTextures.delete(svg);
    }

    if (!this.loaded || this.#isDestroyed) {
      return;
    }

    // The playback cursor points at the next pose. Repaint the displayed pose
    // temporarily, then restore that cursor so animation timing stays intact.
    const nextFrame = this.#frame;

    try {
      this.#frame = this.#displayedFrame;
      this.#prepareFrameRender();
      this.#usedSvgs = {};
      this.#usedMaskSvgs = {};
      this.#displayFrame(this.#renderContainer, this.#animationSymbol);
    } finally {
      this.#frame = nextFrame;
    }
  }

  setAnimation(animation: Animation, frame = 0, seeking = false) {
    // Skip win animation for pets and bosses
    if (animation === 'win' && this.type !== 'brute') return;
    // Handle idle differently for monks
    const nextAnimation = animation === 'idle' ? this.idleAnimation : animation;
    this.seekPose.animation = nextAnimation;
    if (seeking) return;
    this.animation = nextAnimation;

    this.#animationSymbol = ANIMATIONS[this.#animationType][this.animation];

    // The source controller timelines (547/881) place these hurt clips at -20.
    // Their local artwork alone sits below the fighter's ground origin.
    this.#renderContainer.y = (
      (this.#animationType === 'female' && this.animation === 'hit')
      || (this.#animationType === 'male' && this.animation === 'hit-0')
    ) ? -20 * SCALE * this.#scale : 0;

    // Reset frame
    this.#frame = frame;
    this.#previousFrame = -1;
    this.#frameCount = this.#animationSymbol?.loopEnd !== undefined
      ? this.#animationSymbol.loopEnd + 1
      : this.#animationSymbol?.frames?.length ?? 0;
    this.#timer = 0;
    this.#playing = true;

    // Display frame
    this.#usedSvgs = {};
    this.#usedMaskSvgs = {};
    this.#prepareFrameRender();
    this.#displayFrame(this.#renderContainer, this.#animationSymbol);
    this.#displayedFrame = frame;
    this.#displayedWeapon = this.weapon;
    this.#displayedShield = this.shield;
  }

  capturePlaybackFrame() {
    return {
      animation: this.animation,
      frame: this.#displayedFrame,
      airborne: this.#isAirborn,
    };
  }

  renderPlaybackFrame(playback: ReturnType<FighterHolder['capturePlaybackFrame']>) {
    this.#isAirborn = playback.airborne;

    if (this.animation !== playback.animation || this.#displayedFrame !== playback.frame
      || this.#displayedWeapon !== this.weapon || this.#displayedShield !== this.shield) {
      this.setAnimation(playback.animation, playback.frame);
    }

    this.pause();
  }

  #collectSvgsToLoad = (
    svgsToLoadByName: Map<string, SvgLoadEntry>,
    parts: LaBruteSymbol['parts'],
    frame: readonly FramePart[] = [],
    parentTransform = new Matrix(),
    resolution = 1,
  ) => {
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
        const size = SCALE * this.#scale;
        // Integer resolution buckets share textures between similar placements.
        // Texture resolution changes pixel density, preserving logical size/offsets.
        const renderScale = Math.max(1, Math.ceil(size * getMatrixScale(transform) * resolution));
        const existing = svgsToLoadByName.get(symbol.name);
        if (!existing || renderScale > existing.renderScale) {
          svgsToLoadByName.set(symbol.name, {
            svg: symbol,
            renderScale,
            minimumPixels: size * resolution,
          });
        }
      } else {
        // Get frames to load
        let framesToLoad: number[] = [];

        // If symbol has partIdx, only load the corresponding frame
        const partIdx = framePart.partIdx;
        if (partIdx) {
          const partValue = this.#parts[partIdx.substring(1)];

          if (partValue === undefined) {
            throw new Error(`Part ${partIdx.substring(1)} not found in fighter config`);
          }

          framesToLoad = [this.#selectPartFrame(symbol, partValue)];
        } else if (symbol.name === WEAPON_SYMBOL) {
          // Load all weapon frames
          framesToLoad = WEAPON_FRAMES.map((_, index) => index);
        } else if (symbol.name === 'Symbol526') {
          // Special case for whip animation
          framesToLoad = [16];
        } else {
          // Load only the first frame
          framesToLoad = [0];
        }

        // For each frame, load the corresponding SVGs
        for (const frameIdx of framesToLoad) {
          const currentFrame = symbol.frames?.[frameIdx];
          if (!currentFrame) {
            continue;
          }

          this.#collectSvgsToLoad(
            svgsToLoadByName,
            symbol.parts,
            currentFrame,
            transform,
            resolution,
          );
        }
      }
    });
  };

  #loadSvgs = async (svgsToLoad: SvgLoadEntry[]) => {
    const loadingSvgs: Promise<void>[] = [];

    const getTexture = (
      { svg, renderScale, minimumPixels }: SvgLoadEntry,
      cacheKey: string,
    ) => {
      const cached = FighterHolder.#sharedSvgTextureCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const svgDataUrl = prepareSvg(svg, renderScale, minimumPixels);
      const loadPromise = Assets.load<Texture>({
        src: svgDataUrl,
        data: {
          parseAsGraphicsContext: false,
          resolution: renderScale,
        },
      }).catch((error) => {
        console.error('Error creating SVG texture via Assets.load', error, svg.name);
        try {
          return Texture.from(svgDataUrl);
        } catch (fallbackError) {
          console.error('Error creating fallback SVG texture', fallbackError, svg.name);
          return null;
        }
      });

      FighterHolder.#sharedSvgTextureCache.set(cacheKey, loadPromise);
      return loadPromise;
    };

    for (const svgToLoad of svgsToLoad) {
      const { svg, renderScale, minimumPixels } = svgToLoad;

      loadingSvgs.push(new Promise((resolve) => {
        const cacheKey = `${svg.name}|${renderScale}|${minimumPixels}`;

        getTexture(svgToLoad, cacheKey)
          .then((texture) => {
            if (texture) {
              this.#svgTexturesByLabel.set(svg.name, texture);
              this.#svgDataByLabel.set(svg.name, svg);
            }
          })
          .finally(() => {
            resolve();
          });
      }));
    }

    await Promise.all(loadingSvgs);
  };

  #prepareFrameRender = () => {
    for (const svg of this.svgs) {
      svg.visible = false;
      svg.renderable = true;
      svg.mask = null;
      svg.alpha = 1;
      svg.tint = 0xFFFFFF;
    }

    for (const maskGroup of this.#maskSvgsByLabel.values()) {
      for (const maskSvg of maskGroup) {
        maskSvg.visible = false;
        maskSvg.renderable = false;
        maskSvg.mask = null;
      }
    }

    for (const container of this.#allPooledContainers) {
      container.visible = false;
      container.mask = null;
      container.alpha = 1;
    }
  };

  #acquireContainer = (label: string, parent: Container, index: number) => {
    let poolsByLabel = this.#containerPoolByParent.get(parent);
    if (!poolsByLabel) {
      poolsByLabel = new Map<string, Container[]>();
      this.#containerPoolByParent.set(parent, poolsByLabel);
    }

    let containers = poolsByLabel.get(label);
    if (!containers) {
      containers = [];
      poolsByLabel.set(label, containers);
    }

    let container = containers[index];
    if (!container) {
      container = new Container();
      container.sortableChildren = true;
      container.label = label;
      container.visible = false;
      containers.push(container);
      this.#allPooledContainers.push(container);
    }

    if (container.parent !== parent) {
      parent.addChild(container);
    }

    return container;
  };

  #acquireSvgSprite = (svgName: string, parent: Container) => {
    const usedCount = this.#usedSvgs[svgName] ?? 0;
    let sprites = this.#svgsByLabel.get(svgName);

    if (!sprites) {
      sprites = [];
      this.#svgsByLabel.set(svgName, sprites);
    }

    let sprite = sprites[usedCount];
    if (!sprite) {
      const texture = this.#svgTexturesByLabel.get(svgName);
      const svgData = this.#svgDataByLabel.get(svgName);

      if (!texture || !svgData) {
        throw new Error(`Sprite ${svgName} texture not found`);
      }

      const size = SCALE * this.#scale;
      sprite = new Sprite(texture);
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

    this.#usedSvgs[svgName] = usedCount + 1;
    return sprite;
  };

  #acquireMaskSvgSprite = (svgName: string, parent: Container) => {
    const usedCount = this.#usedMaskSvgs[svgName] ?? 0;
    let sprites = this.#maskSvgsByLabel.get(svgName);

    if (!sprites) {
      sprites = [];
      this.#maskSvgsByLabel.set(svgName, sprites);
    }

    let sprite = sprites[usedCount];
    if (!sprite) {
      const texture = this.#svgTexturesByLabel.get(svgName);
      const svgData = this.#svgDataByLabel.get(svgName);

      if (!texture || !svgData) {
        throw new Error(`Mask sprite ${svgName} texture not found`);
      }

      const size = SCALE * this.#scale;
      sprite = new Sprite(texture);
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

    this.#usedMaskSvgs[svgName] = usedCount + 1;
    return sprite;
  };

  #selectPartFrame(symbol: LaBruteSymbol, value: number): number {
    const count = symbol.frames?.length ?? 0;

    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`Invalid body selector ${value} for ${symbol.name}`);
    }

    return count > 0 ? value % count : 0;
  }

  #applyPlacementFilters(container: Container, planned: PlannedPart) {
    const placement = planned.placement;
    const color = placement.colorIdx
      ? this.#colors[placement.colorIdx.substring(1)]
      : undefined;
    if (placement.colorIdx && !color) throw new Error(`Color ${placement.colorIdx} not found`);
    const key = planned.filterKey;
    let cached = this.#placementFilters.get(container);

    if (!cached || cached.key !== key || cached.color !== color) {
      // These filters belong to this pooled placement, not to a shared texture.
      for (const filter of cached?.filters ?? []) filter.destroy();

      const effective = this.#colorOffset && placement.colorTransform
        ? { ...placement, colorTransform: {
          ...placement.colorTransform,
          add: [this.#colorOffset.r, this.#colorOffset.g, this.#colorOffset.b, 0],
        } }
        : placement;

      cached = { key, color, filters: createPlacementFilters(effective, color, this.#scale) };
      this.#placementFilters.set(container, cached);
    }

    if (container.filters?.[0] !== cached.filters[0]
      || (container.filters?.length ?? 0) !== cached.filters.length) {
      container.filters = cached.filters.length ? cached.filters : null;
    }
  }

  #getColoredTexture(svg: Svg, color: string): Texture {
    const base = this.#svgTexturesByLabel.get(svg.name);
    if (!base) throw new Error(`Texture ${svg.name} not found`);
    if (color === '#ffffff' || color === '#FFFFFF') return base;
    let variants = this.#coloredTextures.get(svg);
    const cached = variants?.get(color);
    if (cached) return cached.texture;

    let shared = FighterHolder.#sharedColoredTextures.get(this.#renderer);
    if (!shared) {
      shared = new Map();
      FighterHolder.#sharedColoredTextures.set(this.#renderer, shared);
    }
    // Distinct stroke minima can share a resolution bucket but not colored pixels.
    const key = `${svg.name}|${base.uid}|${color}`;
    const existing = shared.get(key);
    if (existing) {
      existing.references++;
      if (!variants) {
        variants = new Map();
        this.#coloredTextures.set(svg, variants);
      }
      variants.set(color, existing);
      return existing.texture;
    }

    const sprite = new Sprite(base);
    sprite.label = svg.name;
    const filters = createPlacementFilters({ name: svg.name }, color);
    sprite.filters = filters;

    try {
      // Round the empty padding outward: fractional bounds must not crop artwork.
      const texture = this.#renderer.generateTexture({
        target: sprite,
        frame: new Rectangle(0, 0, Math.ceil(base.width), Math.ceil(base.height)),
        resolution: base.source.resolution,
        clearColor: [0, 0, 0, 0],
      });
      if (!variants) {
        variants = new Map();
        this.#coloredTextures.set(svg, variants);
      }
      const entry = { texture, owned: texture !== base, references: 1, key, cache: shared };
      shared.set(key, entry);
      variants.set(color, entry);
      return texture;
    } finally {
      sprite.destroy({ texture: false });
      for (const filter of filters) filter.destroy();
    }
  }

  #releaseColoredTexture(entry: ColoredTexture) {
    entry.references--;
    if (entry.references === 0) {
      entry.cache.delete(entry.key);
      if (entry.owned) entry.texture.destroy(true);
    }
  }

  #displayFrame = (
    container: Container,
    symbol: LaBruteSymbol | Svg | null,
    placement?: FramePart,
    coloredTexture?: Texture,
  ) => {
    if (!symbol) return;

    if (symbol.type === 'svg') {
      const sprite = this.#acquireSvgSprite(symbol.name, container);
      sprite.texture = coloredTexture ?? this.#svgTexturesByLabel.get(symbol.name)!;
      sprite.visible = symbol.name === SHIELD_SYMBOL[this.#animationType]
        ? this.shield
        : this.weapon !== null || symbol.name !== 'Symbol39';
      return;
    }

    let frame = 0;

    if (placement?.partIdx) {
      const key = placement.partIdx.substring(1);
      const value = this.#parts[key];
      if (value === undefined) throw new Error(`Part ${key} not found in fighter config`);
      frame = this.#selectPartFrame(symbol, value);
    } else if (symbol.name === WEAPON_SYMBOL) {
      frame = WEAPON_FRAMES.indexOf(this.weapon);
    } else if (symbol.name === 'Symbol526') {
      frame = 16;
    } else if (ANIMATION_SYMBOL_NAMES[this.#animationType].includes(symbol.name)) {
      frame = Math.floor(this.#frame);
    }

    for (const planned of getFramePlan(symbol, frame)) {
      const { placement: part, definition } = planned;

      if (definition.type === 'svg') {
        this.#displayFrame(container, definition, part, coloredTexture);
        continue;
      }

      const child = this.#acquireContainer(part.name, container, planned.occurrence);
      const transform = part.transform;
      const size = SCALE * this.#scale;
      child.setFromMatrix(this.#placementMatrix.set(
        transform?.a ?? 1, transform?.b ?? 0, transform?.c ?? 0, transform?.d ?? 1,
        (transform?.tx ?? 0) * size, (transform?.ty ?? 0) * size,
      ));
      child.zIndex = planned.zIndex;
      child.blendMode = part.blendMode ?? 'normal';
      child.visible = true;

      // Color selectors, color transforms, and effects belong to the placement,
      // so two instances of one definition can have different appearances.
      let nextTexture = coloredTexture;
      if (planned.coloredSvg) {
        const color = this.#colors[part.colorIdx!.slice(1)];
        if (!color) throw new Error(`Color ${part.colorIdx} not found`);
        nextTexture = this.#getColoredTexture(planned.coloredSvg, color);
        if (child.filters?.length) child.filters = null;
      } else if (part.colorTransform || part.colorIdx || part.filters) {
        this.#applyPlacementFilters(child, planned);
      } else if (child.filters?.length) {
        child.filters = null;
      }

      if (planned.mask) {
        const { name, transform: maskTransform } = planned.mask;
        const mask = this.#acquireMaskSvgSprite(name, container);
        const artwork = this.#svgDataByLabel.get(name);
        if (!artwork) throw new Error(`Mask ${name} not found`);

        const size = SCALE * this.#scale;
        const origin = new Matrix(
          size, 0, 0, size,
          -artwork.offset.x * size,
          -artwork.offset.y * size,
        );
        mask.setFromMatrix(multiplyMatrices(
          matrixFromObject(maskTransform, size), origin,
        ));
        mask.visible = true;
        mask.renderable = false;
        // Flash masks use coverage, regardless of the shape's fill color.
        // Symbol39 is green, so Pixi's default red-channel mask is empty.
        child.setMask({ mask, channel: 'alpha' });
      } else {
        child.mask = null;
      }

      this.#displayFrame(child, definition, part, nextTexture);
    }
  };

  once = (event: string, callback: (e: string) => void) => {
    if (!this.onceEvents[event]) {
      this.onceEvents[event] = [];
    }

    (this.onceEvents[event] ?? []).push(callback);
  };

  on = (event: string, callback: (e: string) => void) => {
    if (!this.events[event]) {
      this.events[event] = [];
    }

    (this.events[event] ?? []).push(callback);
  };

  play = () => {
    this.#playing = true;
  };

  pause = () => {
    this.#playing = false;
  };

  waitForEvent = async (event: string) => new Promise<void>((resolve) => {
    this.once(event, () => {
      resolve();
    });
  });

  // Stop / restart actualizing zIndex
  setAirborn = (airborn: boolean, seeking = false) => {
    this.seekPose.airborne = airborn;
    if (seeking) return;
    if (!airborn) {
      this.shadow.alpha = 1;
      this.shadow.y = 0;
      this.shadow.scale.set(1, 1);
      this.container.zIndex = this.container.y;
    }
    this.#isAirborn = airborn;
  };

  destroy = () => {
    if (this.#isDestroyed) {
      return;
    }
    this.#isDestroyed = true;

    this.pause();

    // Remove ticker handler to avoid leaked callbacks
    if (this.#appTicker && this.#tickerHandler) {
      try {
        this.#appTicker.remove(this.#tickerHandler);
      } catch (e) {
        console.error('Error removing ticker handler', e);
      }
      this.#tickerHandler = null;
      this.#appTicker = null;
    }

    // Filters are owned by pooled placements, while SVG textures are shared.
    for (const variants of this.#coloredTextures.values()) {
      for (const entry of variants.values()) {
        this.#releaseColoredTexture(entry);
      }
    }
    this.#coloredTextures.clear();
    for (const container of this.#allPooledContainers) {
      for (const filter of this.#placementFilters.get(container)?.filters ?? []) filter.destroy();
    }

    // Destroy container and its children
    try {
      this.container.destroy({ children: true, texture: false });
    } catch (e) {
      console.error('Error destroying container', e);
    }

    // Clear svg sprite references to allow GC; do not destroy their textures here.
    this.svgs = [];
    this.#svgTexturesByLabel.clear();
    this.#svgDataByLabel.clear();
    this.#svgsByLabel.clear();
    this.#maskSvgsByLabel.clear();
    this.#allPooledContainers = [];
    this.#containerPoolByParent = new WeakMap<Container, Map<string, Container[]>>();

    this.#placementFilters = new WeakMap();
  };
}
