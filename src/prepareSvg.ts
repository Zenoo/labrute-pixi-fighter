/** Express the fighter's minimum stroke in SVG units at its raster resolution. */
export function prepareSvg(svg: string, resolution: number, minimumPixels: number): string {
  const minimumWidth = minimumPixels / resolution;

  // Keep hairlines one native fighter pixel wide as display size and DPR grow.
  // Nested symbol magnification must not turn the minimum into a whole SVG unit.
  // Wider authored strokes remain intact.
  return svg.replace(/\sstroke-width="([\d.]+)"/g, (_, width) =>
    ` stroke-width="${Math.max(Number(width), minimumWidth)}"`);
}
