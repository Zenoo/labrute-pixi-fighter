/* eslint-disable prefer-named-capture-group */
const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const dev = argv.mode === 'development';

  const plugins = [
    new HtmlWebpackPlugin({ template: './test/index.html' })
  ];

  return {
    entry: './test/index.ts',
    devtool: dev ? 'source-map' : false,
    mode: 'development',
    module: {
      rules: [
        {
          test: /\.(js|ts)$/,
          exclude: /(node_modules|bower_components)/,
          use: [
            { loader: 'babel-loader', options: { presets: ['@babel/env'] } },
            { loader: path.resolve(__dirname, 'scripts/compile-svg-loader.cjs') },
          ]
        }
      ]
    },
    resolve: { extensions: ['*', '.js', '.ts'] },
    output: {
      path: path.resolve(__dirname, 'dist2/'),
      filename: 'bundle.js'
    },
    devServer: {
      port: 3000,
      static: {
        directory: path.resolve(__dirname, 'node_modules/@ruffle-rs/ruffle'),
        publicPath: '/ruffle',
        watch: false,
      },
      setupMiddlewares(middlewares, server) {
        require('./test/swfMiddleware.cjs')(server.app);
        return middlewares;
      },
      hot: false,
      liveReload: true,
    },
    plugins
  };
};
