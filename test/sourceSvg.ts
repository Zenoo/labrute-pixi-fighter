import { prepareSvg as preparePresentationSvg } from '../src/prepareSvg';

/** Compare source geometry independently of the intentional presentation floor. */
export function prepareSvg(svg: string, resolution: number): string {
  return preparePresentationSvg(svg, resolution, 1);
}
