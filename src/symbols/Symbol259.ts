// Generated from mini_perso.swf by npm run export:swf.
import type { FramePart, Symbol } from '../common';
import { Symbol253 } from './Symbol253';
import { Symbol254 } from './Symbol254';
import { Symbol256 } from './Symbol256';
import { Symbol258 } from './Symbol258';

const placement0: FramePart = {
  "name": "Symbol256",
  "partIdx": "_p1a",
  "transform": {
    "b": 0.1340179443359375,
    "tx": -1.25,
    "ty": -6.65
  }
};

const placement1: FramePart = {
  "name": "Symbol253",
  "colorIdx": "_col2",
  "transform": {
    "a": 0.99102783203125,
    "b": 0.2448577880859375,
    "c": -0.0366363525390625,
    "tx": 1.1,
    "ty": -0.65
  }
};

export const Symbol259: Symbol = {
  "type": "symbol",
  "name": "Symbol259",
  "parts": [
    Symbol253,
    Symbol254,
    Symbol256,
    Symbol258
  ],
  "frames": [
    [
      placement0,
      {
        "name": "Symbol254"
      },
      placement1
    ],
    [
      placement0,
      {
        "name": "Symbol258",
        "partIdx": "_p1b",
        "transform": {
          "b": 0.2081298828125,
          "tx": 0.2,
          "ty": 3.7
        }
      },
      {
        "name": "Symbol254"
      },
      placement1
    ]
  ]
};
