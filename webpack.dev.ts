import * as webpack from 'webpack';
import { default as common } from './webpack.common';

const development : webpack.Configuration = {
    mode: 'development',
    devtool: 'source-map',
    stats: {
        children: false,
        moduleTrace: false,
        modules: false,
    },
    optimization: {
        removeAvailableModules: true,
        removeEmptyChunks: false,
        splitChunks: false
    },
    output: {
        pathinfo: false,
    }
};

module.exports = env => common(env, development);