import type { SvgRasterTemplate } from './common';

const sources = new WeakMap<SvgRasterTemplate, string>();

/** Compatibility access for consumers of raw SVGs; fighter loading never decodes them. */
export function readSvgSource(template: SvgRasterTemplate): string {
  let source = sources.get(template);
  if (source === undefined) {
    source = decodeURIComponent(template.source);
    sources.set(template, source);
  }
  return source;
}
