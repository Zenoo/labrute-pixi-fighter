import type { Svg } from '../src/common';

/** Compare source geometry independently of the intentional presentation floor. */
export function prepareSvg(svg: Svg, resolution: number): string {
  const source = svg.svg.replace(/\sstroke-width="([\d.]+)"/g, (_, width) =>
    ` stroke-width="${Math.max(Number(width), 1 / resolution)}"`);
  return `data:image/svg+xml,${encodeURIComponent(source)}%3C!--${resolution}--%3E`;
}
