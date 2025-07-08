const path = require('path');

module.exports = {
  entry: {
    encryptionWorker: './src/services/encryption/encryptionWorker.ts',
    decryptionWorker: './src/services/encryption/decryptionWorker.ts',
  },
  output: {
    filename: '[name].js',
    path: path.resolve(__dirname, 'public/workers'),
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@opencall/core': path.resolve(__dirname, '../core/src'),
    },
  },
  target: 'webworker',
  mode: process.env.NODE_ENV || 'development',
};