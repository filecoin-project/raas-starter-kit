const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    mode: 'development',
    entry: {
        index: './api/src/script.js',
    },
    devtool: 'inline-source-map',
    devServer: {
    static: './api/dist',
    port: 8080,
    },
    plugins: [
        new HtmlWebpackPlugin({
        title: 'Development',
        }),
    ],
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'api/dist'),
        clean: true,
    },
    optimization: {
    runtimeChunk: 'single',
    },
};