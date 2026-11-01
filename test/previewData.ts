import * as symbols from '../src/Symbols';
import type { Animation, FighterModel, Symbol as FighterSymbol, WeaponName } from '../src/Symbols';

// Preview choices mirror the animation timelines in FighterHolder.
const animationIds: Record<FighterModel, Partial<Record<Animation, number>>> = {
  male: {
    idle: 475,
    monk: 476,
    fist: 478,
    arrive: 479,
    'hit-0': 488,
    'hit-1': 489,
    'hit-2': 490,
    run: 491,
    equip: 493,
    evade: 494,
    block: 495,
    trash: 496,
    death: 497,
    estoc: 498,
    slash: 503,
    throw: 505,
    'prepare-throw': 506,
    grab: 507,
    steal: 508,
    grabbed: 509,
    stolen: 510,
    trapped: 513,
    drink: 516,
    strengthen: 517,
    whip: 541,
    launch: 542,
    win: 543,
    train: 544,
    train2: 545,
    eat: 546,
  },
  female: {
    idle: 846,
    monk: 847,
    fist: 848,
    arrive: 849,
    hit: 851,
    run: 854,
    equip: 855,
    evade: 856,
    block: 857,
    trash: 858,
    death: 859,
    estoc: 860,
    slash: 861,
    throw: 863,
    'prepare-throw': 864,
    grab: 865,
    steal: 866,
    grabbed: 867,
    stolen: 868,
    trapped: 869,
    drink: 870,
    strengthen: 871,
    whip: 875,
    launch: 876,
    win: 877,
    train: 878,
    train2: 879,
    eat: 880,
  },
  dog: {
    idle: 894,
    attack: 903,
    arrive: 904,
    hit: 905,
    run: 906,
    evade: 907,
    death: 910,
    grab: 911,
    grabbed: 912,
    trapped: 913,
  },
  bear: {
    idle: 935,
    attack: 936,
    arrive: 937,
    hit: 938,
    run: 939,
    evade: 940,
    death: 941,
    grab: 942,
    grabbed: 943,
    trapped: 944,
  },
};

export const weapons: WeaponName[] = [
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
export const partKeys = ['p1', 'p1a', 'p1b', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p7b', 'p8'];
export const colorKeys = [
  'col0',
  'col0a',
  'col0c',
  'col1',
  'col1a',
  'col1b',
  'col1c',
  'col1d',
  'col2',
  'col2a',
  'col2b',
  'col3',
  'col3b',
  'col4',
  'col4a',
  'col4b',
];

export const animationsFor = (model: FighterModel) =>
  Object.keys(animationIds[model]) as Animation[];
export const animationSymbol = (model: FighterModel, animation: Animation) =>
  (symbols as unknown as Record<string, FighterSymbol>)[`Symbol${animationIds[model][animation]}`];

const clothingDetails = new Map<string, boolean>();

/** Check the selected outfit across all poses and body builds, once per set. */
export function hasClothingDetails(model: FighterModel, set: number): boolean {
  const key = `${model}:${set}`;
  const cached = clothingDetails.get(key);
  if (cached !== undefined) return cached;

  const visited = new Set<string>();
  let different = false;

  function visit(symbol: FighterSymbol, selectedFrame?: number): void {
    const visitKey = `${symbol.name}:${selectedFrame}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    // Outfit selectors stay fixed; inspect every frame of other selectors so
    // a detail used only by another pose or body build is still discoverable.
    const frames = selectedFrame === undefined
      ? symbol.frames ?? []
      : [symbol.frames![selectedFrame]];

    for (const frame of frames) {
      for (const placement of frame) {
        const child = symbol.parts?.find((part) => part.name === placement.name);
        if (child?.type !== 'symbol') continue;

        if (placement.partIdx === '_p1' && child.frames?.length) {
          const basic = child.frames[0];
          const detailed = child.frames[1 % child.frames.length];
          if (JSON.stringify(basic) !== JSON.stringify(detailed)) different = true;
        }

        const outfit = placement.partIdx === '_p7' || placement.partIdx === '_p7b';
        visit(child, outfit ? set % (child.frames?.length ?? 1) : undefined);
      }
    }
  }

  for (const animation of animationsFor(model)) visit(animationSymbol(model, animation));
  clothingDetails.set(key, different);
  return different;
}

export const partCounts = (model: FighterModel) => {
  // Choices come from the source timelines, including empty frames. Encoded
  // appearance values can be larger because the renderer wraps them by length.
  const counts = Object.fromEntries(partKeys.map((key) => [key, 1]));
  const visited = new Set<string>();

  function visit(symbol: FighterSymbol): void {
    if (visited.has(symbol.name)) return;
    visited.add(symbol.name);

    for (const frame of symbol.frames ?? []) {
      for (const placement of frame) {
        const child = symbol.parts?.find((part) => part.name === placement.name);

        if (placement.partIdx && child?.type === 'symbol') {
          const key = placement.partIdx.slice(1);
          counts[key] = Math.max(counts[key] ?? 1, child.frames?.length ?? 1);
        }
      }
    }

    for (const child of symbol.parts ?? []) {
      if (child.type === 'symbol') visit(child);
    }
  }

  for (const animation of animationsFor(model)) visit(animationSymbol(model, animation));
  return counts;
};
