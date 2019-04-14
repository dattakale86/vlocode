const merge = require('webpack-merge').smart;
const common = require('./webpack.common.js');
const path = require('path');

const devModeConfig = {
    mode: 'development',
    devtool: 'source-map',
    optimization: {
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: false,
    }    
}

module.exports = [
    merge(common.extestion, devModeConfig),
    merge(common.tests, devModeConfig),
    merge(common.views, devModeConfig)
];