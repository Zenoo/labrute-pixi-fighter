// Generated from mini_perso.swf by npm run export:swf.
import type { FramePart, Symbol } from '../common';
import { Symbol711 } from './Symbol711';
import { Symbol713 } from './Symbol713';
import { Symbol714 } from './Symbol714';
import { Symbol716 } from './Symbol716';

const placement0: FramePart = {
  "name": "Symbol713",
  "transform": {
    "tx": -32.85,
    "ty": -12.05
  },
  "colorTransform": {
    "add": [
      -87,
      -148,
      -159,
      0
    ]
  }
};

const placement1: FramePart = {
  "name": "Symbol711",
  "colorIdx": "_col2",
  "transform": {
    "tx": 2.75,
    "ty": 0.15
  }
};

export const Symbol717: Symbol = {
  "type": "symbol",
  "name": "Symbol717",
  "parts": [
    Symbol711,
    Symbol713,
    Symbol714,
    Symbol716
  ],
  "frames": [
    [
      {
        "name": "Symbol714"
      },
      placement0,
      placement1
    ],
    [
      {
        "name": "Symbol714"
      },
      placement0,
      {
        "name": "Symbol716",
        "transform": {
          "tx": -26.6,
          "ty": -18.7
        }
      },
      placement1
    ]
  ]
};
