import type { Filter } from 'pixi.js';
import type { ColorOffset } from './common';

export type Animation = 'idle' | 'monk' | 'fist' | 'arrive' | 'hit-0' | 'hit-1' | 'hit-2'
  | 'run' | 'equip' | 'evade' | 'block' | 'trash' | 'death' | 'estoc' | 'slash'
  | 'throw' | 'prepare-throw' | 'grab' | 'steal' | 'grabbed' | 'stolen' | 'trapped'
  | 'drink' | 'strengthen' | 'whip' | 'launch' | 'win' | 'train' | 'train2' | 'eat'
  | 'attack' | 'hit';

export type FighterModel = 'male' | 'female' | 'dog' | 'bear';

export type WeaponName = 'knife' | 'broadsword' | 'lance' | 'baton' | 'trident'
  | 'hatchet' | 'scimitar' | 'axe' | 'sword' | 'fan' | 'shuriken' | 'bumps'
  | 'morningStar' | 'mammothBone' | 'flail' | 'whip' | 'sai' | 'leek' | 'mug'
  | 'fryingPan' | 'piopio' | 'halbard' | 'trombone' | 'keyboard' | 'noodleBowl'
  | 'racquet';

/** Structurally compatible with a React ref, without requiring React. */
export type SpeedRef = { readonly current: number };

/** Resolved visual data. Game rules and encoded appearance strings belong to callers. */
export interface FighterAppearance {
  type: 'brute' | 'pet' | 'boss';
  name: string;
  model: FighterModel;
  team: 'L' | 'R';
  shield: boolean;
  /** Keys such as p1, p1a, p2; values select timeline frames. */
  parts: Readonly<Record<string, number>>;
  /** Keys such as col0, col1; values are hexadecimal colors. */
  colors: Readonly<Record<string, string>>;
  /** Logical dimensions before the constructor's scale is applied. */
  width: number;
  height: number;
  idleAnimation?: Animation;
  /** Optional replacement for timeline color offsets, e.g. a panther's tint. */
  colorOffset?: ColorOffset;
  /** Caller-created filters, e.g. boss or pet color adjustments. */
  filters?: Filter[];
}
