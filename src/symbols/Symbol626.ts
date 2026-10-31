// Generated from mini_perso.swf by npm run export:swf.
import type { FramePart, Symbol } from '../common';
import { Symbol608 } from './Symbol608';
import { Symbol625 } from './Symbol625';

const placement0: FramePart = {
  "name": "Symbol625",
  "partIdx": "_p7",
  "transform": {
    "a": 0.9969329833984375,
    "b": -0.0749359130859375,
    "c": 0.0749359130859375,
    "d": 0.9969329833984375,
    "tx": 0.55,
    "ty": 1.55
  }
};

const placement1: FramePart = {
  "name": "Symbol608",
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

const frame0: FramePart[] = [
  placement0,
  placement1
];

export const Symbol626: Symbol = {
  "type": "symbol",
  "name": "Symbol626",
  "parts": [
    Symbol608,
    Symbol625
  ],
  "frames": [
    frame0,
    frame0
  ]
};
