// Generated from mini_perso.swf by npm run export:swf.
import type { FramePart, Symbol } from '../common';
import { Symbol314 } from './Symbol314';
import { Symbol316 } from './Symbol316';
import { Symbol317 } from './Symbol317';

const placement0: FramePart = {
  "name": "Symbol316",
  "colorIdx": "_col2",
  "transform": {
    "tx": -3.45,
    "ty": 1.65
  }
};

const placement1: FramePart = {
  "name": "Symbol314",
  "colorIdx": "_col3",
  "transform": {
    "tx": 0.3,
    "ty": -1.8
  }
};

const frame0: FramePart[] = [
  {
    "name": "Symbol317"
  },
  placement0,
  placement1
];

export const Symbol318: Symbol = {
  "type": "symbol",
  "name": "Symbol318",
  "parts": [
    Symbol314,
    Symbol316,
    Symbol317
  ],
  "frames": [
    frame0,
    frame0
  ]
};
