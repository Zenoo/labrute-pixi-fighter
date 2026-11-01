/** Build-only SVG analysis. Runtime templates contain encoded text and widths. */
function compileSvg(svg) {
  const widths = [];
  const slot = (width) => `__FIGHTER_WIDTH_${widths.push(width) - 1}__`;
  const widen = (element, inside = false) => element.replace(/\sstroke-width="([\d.]+)"/g,
    (_, width) => ` stroke-width="${slot(inside ? -Number(width) : Number(width))}"`);
  const inner = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
  const visible = inner.replace(/<defs\b[^>]*>[\s\S]*?<\/defs>/g, '');
  const silhouette = [];
  const transforms = [];
  for (const [element] of visible.matchAll(/<g\b[^>]*>|<\/g>|<path\b[^>]*\/>/g)) {
    if (element.startsWith('</g')) transforms.pop();
    else if (element.startsWith('<g')) transforms.push(element.match(/\stransform="([^"]*)"/)?.[1] ?? '');
    else if (/\sd="[^"]+"/.test(element)
      && !/\sfill="none"|\sfill-opacity="0(?:\.0*)?"/.test(element)) {
      const transform = [...transforms, element.match(/\stransform="([^"]*)"/)?.[1] ?? ''].join(' ');
      silhouette.push(element
        .replace(/\s(?:stroke(?:-width|-opacity|-linecap|-linejoin)?|transform)="[^"]*"/g, '')
        .replace(/\sfill-rule=/g, ' clip-rule=')
        .replace('<path', `<path transform="${transform}"`));
    }
  }
  const outlines = new Set();
  const artwork = inner.replace(/<path\b[^>]*\/>/g, (element) => {
    const opacity = Number(element.match(/\sstroke-opacity="([\d.]+)"/)?.[1] ?? 1);
    if (silhouette.length && opacity > 0 && opacity < 1 && /\sstroke-width=/.test(element)) {
      outlines.add(element);
      return element;
    }
    return widen(element);
  });
  let template;
  if (outlines.size) {
    const widened = visible.replace(/<path\b[^>]*\/>/g, (element) => {
      if (!outlines.has(element)) return '';
      const stroke = widen(element, true);
      return /\sfill=/.test(stroke) ? stroke.replace(/\sfill="[^"]*"/, ' fill="none"')
        : stroke.replace('<path', '<path fill="none"');
    }).replace(/<use\b[^>]*\/>/g, '');
    template = svg.slice(0, svg.indexOf('>') + 1)
      + `<defs><clipPath id="fighter-outline" clipPathUnits="userSpaceOnUse">${silhouette.join('')}</clipPath></defs>`
      + artwork + `<g clip-path="url(#fighter-outline)">${widened}</g></svg>`;
  } else template = widen(svg);

  // Reference the encoded source instead of copying path geometry into clips.
  // The same source also supplies the public, lazily decoded Svg.svg property.
  const source = encodeURIComponent(svg);
  const parts = [];
  const addText = (text) => {
    if (!text) return;
    const index = svg.indexOf(text);
    if (index < 0) parts.push(encodeURIComponent(text));
    else {
      const start = encodeURIComponent(svg.slice(0, index)).length;
      const end = start + encodeURIComponent(text).length;
      const previous = parts[parts.length - 1];
      if (Array.isArray(previous) && previous[1] === start) previous[1] = end;
      else parts.push([start, end]);
    }
  };
  let offset = 0;
  for (const match of template.matchAll(/\bd="[^"]*"|__FIGHTER_WIDTH_(\d+)__/g)) {
    addText(template.slice(offset, match.index));
    if (match[1] === undefined) addText(match[0]);
    else parts.push(widths[Number(match[1])]);
    offset = match.index + match[0].length;
  }
  addText(template.slice(offset));
  return { source, parts };
}

/** Used by both Rollup's package build and webpack's source playground. */
function compileSymbolSvgs(code) {
  let changed = false;
  const result = code.replace(/"svg"\s*:\s*("(?:\\.|[^"\\])*")/g, (_, literal) => {
    changed = true;
    return `get svg() { return readSvgSource(this.raster); }, "raster": ${JSON.stringify(compileSvg(JSON.parse(literal)))}`;
  });
  return changed ? `import { readSvgSource } from '../svgSource';\n${result}` : code;
}

module.exports = { compileSvg, compileSymbolSvgs };
