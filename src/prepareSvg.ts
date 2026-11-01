import type { Svg } from './common';

/** Assemble build-encoded spans; only numeric stroke widths depend on fight size. */
export function prepareSvg(svg: Svg, resolution: number, minimumPixels: number): string {
  const template = svg.raster;
  if (!template) throw new Error(`Missing build-time SVG template for ${svg.name}`);
  const minimumWidth = minimumPixels / resolution;
  let url = 'data:image/svg+xml,';
  for (const part of template.parts) {
    if (typeof part === 'string') url += part;
    else if (typeof part === 'number') {
      // Negative widths are the extra, inside-only translucent outlines.
      url += part < 0 ? (minimumWidth > -part ? minimumWidth : 0) : Math.max(part, minimumWidth);
    } else url += template.source.slice(part[0], part[1]);
  }
  // Pixi keys SVG assets by URL, so different raster densities need distinct URLs.
  return url + `%3C!--${resolution}--%3E`;
}
