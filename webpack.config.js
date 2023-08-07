const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    mode: 'development', // or 'production'
    entry: './public/script.js', // Entry point for the JavaScript file
    output: {
        filename: 'bundle.js',
            path: path.resolve(__dirname, 'dist'),
    },
    devServer: {
        static: './dist', // Directory where bundled files will be served from
        proxy: {
            '/api': 'http://localhost:1337', // Proxy API requests to your backend server
            logLevel: 'debug',
        },
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html', // Path to your HTML file
        }),
    ],
};
