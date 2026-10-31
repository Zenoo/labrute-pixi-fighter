// Generated from mini_perso.swf by npm run export:swf.
import type { FramePart, Symbol } from '../common';
import { Symbol331 } from './Symbol331';
import { Symbol333 } from './Symbol333';
import { Symbol335 } from './Symbol335';
import { Symbol337 } from './Symbol337';

const placement0: FramePart = {
  "name": "Symbol333",
  "colorIdx": "_col4",
  "transform": {
    "a": 0.998138427734375,
    "b": 0.0577392578125,
    "c": -0.0577392578125,
    "d": 0.998138427734375,
    "tx": -4.8,
    "ty": 16.45
  }
};

const placement1: FramePart = {
  "name": "Symbol331",
  "colorIdx": "_col2",
  "transform": {
    "a": 0.9076690673828125,
    "d": 0.9076690673828125,
    "tx": 0.9,
    "ty": -0.8
  },
  "colorTransform": {
    "add": [
      -110,
      -90,
      -80,
      0
    ]
  }
};

export const Symbol338: Symbol = {
  "type": "symbol",
  "name": "Symbol338",
  "parts": [
    Symbol331,
    Symbol333,
    Symbol335,
    Symbol337
  ],
  "frames": [
    [
      placement0,
      placement1
    ],
    [
      {
        "name": "Symbol337",
        "transform": {
          "a": 0.955596923828125,
          "b": 0.0972900390625,
          "c": -0.0378570556640625,
          "d": 1.0347747802734375,
          "tx": -1.4,
          "ty": -0.75
        },
        "colorTransform": {
          "add": [
            -108,
            -113,
            -108,
            0
          ]
        }
      },
      {
        "name": "Symbol335",
        "colorIdx": "_col3b",
        "transform": {
          "a": 0.955596923828125,
          "b": 0.0972900390625,
          "c": -0.0378570556640625,
          "d": 1.0347747802734375,
          "tx": -0.05,
          "ty": 1
        }
      },
      placement0,
      placement1
    ]
  ]
};
