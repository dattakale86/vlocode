import { TestRunner } from "./testRunner";
import * as path from "path";

/**
 * Entry point for VSCode test runner.
 * @param testsRoot Root directory on which to execute the tests.
 * @param callback Function call back invoked when the execution is done.
 */
export function run(testsRoot: string, callback: (error: Error, failures?: number) => void) {
    // Initialize the test runner using the default config
    const runner = new TestRunner({
        ui: 'bdd',
        useColors: true,
        reportingDir: path.resolve(testsRoot, '..', '..', 'testReports'),
        includeFiles: '**/**.test.js',
        reportCoverage: true
    });

    // As VSCode expects a callback doesn't handle promises in the test executor we instead convert the 
    // async TestRunner run call back to a classic promise handling
    runner.run(testsRoot)
        .then(failures => callback(undefined, failures))
        .catch(callback);
}