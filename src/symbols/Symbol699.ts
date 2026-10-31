// Generated from mini_perso.swf by npm run export:swf.
import type { FramePart, Symbol } from '../common';
import { Symbol630 } from './Symbol630';
import { Symbol632 } from './Symbol632';
import { Symbol698 } from './Symbol698';

const placement0: FramePart = {
  "name": "Symbol698",
  "partIdx": "_p7",
  "transform": {
    "tx": -0.05,
    "ty": 12.75
  }
};

const placement1: FramePart = {
  "name": "Symbol630",
  "colorIdx": "_col0",
  "colorTransform": {
    "add": [
      -16,
      -50,
      -80,
      0
    ]
  }
};

export const Symbol699: Symbol = {
  "type": "symbol",
  "name": "Symbol699",
  "parts": [
    Symbol630,
    Symbol632,
    Symbol698
  ],
  "frames": [
    [
      placement0,
      {
        "name": "Symbol632",
        "colorIdx": "_col3",
        "transform": {
          "tx": 0.1,
          "ty": -0.3
        }
      },
      placement1
    ],
    [
      placement0,
      placement1
    ]
  ]
};
