'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as vlocity from 'vlocity';
import * as path from 'path';
import * as process from 'process';
import constants from '../constants';

export default interface CommandModel {
    name: string;
    callback: (... args) => void;
}
