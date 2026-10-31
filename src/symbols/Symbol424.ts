// Generated from mini_perso.swf by npm run export:swf.
import type { FramePart, Symbol } from '../common';
import { Symbol70 } from './Symbol70';
import { Symbol423 } from './Symbol423';
import { Symbol77 } from './Symbol77';

const placement0: FramePart = {
  "name": "Symbol423",
  "partIdx": "_p7",
  "transform": {
    "tx": 0.3,
    "ty": 3.3
  }
};

const placement1: FramePart = {
  "name": "Symbol70",
  "colorIdx": "_col0",
  "transform": {
    "a": 0.955169677734375,
    "b": -0.2927398681640625,
    "c": 0.2927398681640625,
    "d": 0.955169677734375,
    "tx": -4.2,
    "ty": -13.7
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

export const Symbol424: Symbol = {
  "type": "symbol",
  "name": "Symbol424",
  "parts": [
    Symbol70,
    Symbol423,
    Symbol77
  ],
  "frames": [
    [
      placement0,
      placement1
    ],
    [
      placement0,
      {
        "name": "Symbol77",
        "colorIdx": "_col4",
        "transform": {
          "a": 0.955169677734375,
          "b": -0.2927398681640625,
          "c": 0.2927398681640625,
          "d": 0.955169677734375,
          "tx": -4.2,
          "ty": -13.7
        },
        "colorTransform": {
          "add": [
            -16,
            -50,
            -80,
            0
          ]
        }
      },
      placement1
    ]
  ]
};
