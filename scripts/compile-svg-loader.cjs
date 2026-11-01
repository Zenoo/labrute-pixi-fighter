const { compileSymbolSvgs } = require('./compile-svg.cjs');

module.exports = function compileSvgLoader(source) {
  return /[\\/]src[\\/]symbols[\\/][^\\/]+\.ts$/.test(this.resourcePath)
    ? compileSymbolSvgs(source) : source;
};
