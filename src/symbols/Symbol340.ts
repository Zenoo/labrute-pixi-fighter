// Generated from mini_perso.swf by npm run export:swf.
import type { FramePart, Symbol } from '../common';
import { Symbol285 } from './Symbol285';
import { Symbol287 } from './Symbol287';
import { Symbol339 } from './Symbol339';
import { Symbol331 } from './Symbol331';

const placement0: FramePart = {
  "name": "Symbol339",
  "partIdx": "_p7",
  "transform": {
    "tx": 16.6,
    "ty": 15.15
  }
};

const placement1: FramePart = {
  "name": "Symbol287",
  "colorIdx": "_col0",
  "transform": {
    "a": 0.9076690673828125,
    "d": 0.9076690673828125,
    "tx": 18,
    "ty": 15.9
  },
  "colorTransform": {
    "add": [
      -16,
      -50,
      -80,
      0
    ]
  }
};

const placement2: FramePart = {
  "name": "Symbol285",
  "partIdx": "_p7b",
  "transform": {
    "tx": 16.6,
    "ty": 15.15
  }
};

export const Symbol340: Symbol = {
  "type": "symbol",
  "name": "Symbol340",
  "parts": [
    Symbol285,
    Symbol287,
    Symbol339,
    Symbol331
  ],
  "frames": [
    [
      placement0,
      placement1,
      placement2
    ],
    [
      placement0,
      {
        "name": "Symbol331",
        "colorIdx": "_col4",
        "transform": {
          "a": 0.9076690673828125,
          "d": 0.9076690673828125,
          "tx": 18,
          "ty": 15.9
        },
        "colorTransform": {
          "add": [
            -110,
            -90,
            -80,
            0
          ]
        }
      },
      placement1,
      placement2
    ]
  ]
};
