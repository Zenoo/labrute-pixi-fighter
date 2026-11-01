/** Build-generated encoded spans, static markup, and numeric stroke-width slots. */
export type SvgRasterTemplate = Readonly<{
  source: string;
  parts: readonly (string | number | readonly [number, number])[];
}>;

export type Svg = Readonly<{
  type: 'svg';
  name: string;
  svg: string;
  /** @internal Supplied by the package/playground builds, without duplicating geometry. */
  raster?: SvgRasterTemplate;
  offset: Readonly<{
    x: number;
    y: number;
  }>;
}>;

export type ColorOffset = Readonly<{ r: number; g: number; b: number }>;

export type FramePart = Readonly<{
  name: string;
  partIdx?: string;
  colorIdx?: string;
  transform?: Readonly<{
    tx?: number;
    ty?: number;
    a?: number;
    d?: number;
    b?: number;
    c?: number;
  }>;
  maskedBy?: number;
  isMask?: boolean;
  colorTransform?: Readonly<{
    multiply?: readonly number[];
    add?: readonly number[];
  }>;
  filters?: readonly FlashFilter[];
  blendMode?: 'add';
}>;

export type FlashFilter = Readonly<{
  type: 'blur' | 'glow' | 'colorMatrix';
  blurX?: number;
  blurY?: number;
  flags?: number;
  color?: readonly number[];
  strength?: number;
  matrix?: readonly number[];
}>;

export type Symbol = Readonly<{
  // Main symbol
  type: 'symbol';
  name: string;
  parts?: readonly (Symbol | Svg)[];
  frames?: readonly (readonly FramePart[])[];
  labels?: Readonly<Record<string, number>>;
  /** Last played frame before a source gotoAndPlay('loop'), without truncating data. */
  loopEnd?: number;
}>;
