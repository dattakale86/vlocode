//
// PLEASE DO NOT MODIFY / DELETE UNLESS YOU KNOW WHAT YOU ARE DOING
//
// This file is providing the test runner to use when running extension tests.
// By default the test runner in use is Mocha based.
//
// You can provide your own test runner if you want to override it by exporting
// a function run(testRoot: string, clb: (error:Error) => void) that the extension
// host can call to run the tests. The test runner is expected to use console.log
// to report the results back to the caller. When the tests are finished, return
// a possible error to the callback or null if none.

import * as testRunner from 'vscode/lib/testrunner';

// // You can directly control Mocha options by uncommenting the following lines
// // See https://github.com/mochajs/mocha/wiki/Using-mocha-programmatically#set-options for more info
// const testRunnerConfig = {
//     ui: 'bdd',
//     useColors: true,
//     reporter: process.env.TEST_RESULTS_FILE ? 'mocha-sonarqube-reporter' : null,
//     reporterOptions: {
//         output: process.env.TEST_RESULTS_FILE
//     }
// };

// testRunner.configure(<testRunner.MochaSetupOptions>testRunnerConfig);
// module.exports = testRunner;

declare var global: any;

/* tslint:disable no-require-imports */

import * as fs from 'fs';
import * as glob from 'glob';
import * as paths from 'path';

const istanbul = require('istanbul');
import Mocha = require('mocha');
const remapIstanbul = require('remap-istanbul');

// Linux: prevent a weird NPE when mocha on Linux requires the window size from the TTY
// Since we are not running in a tty environment, we just implementt he method statically
const tty = require('tty');
if (!tty.getWindowSize) {
    tty.getWindowSize = (): number[] => {
        return [80, 75];
    };
}

let mocha = new Mocha({
    ui: 'bdd',
    useColors: true
});

function configure(mochaOpts: any): void {
    console.log('### configure');
    mocha = new Mocha(mochaOpts);
}
exports.configure = configure;

function _mkDirIfExists(dir: string): void {
    console.log('### _mkDirIfExists');
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}

function _readCoverOptions(testsRoot: string): ITestRunnerOptions | undefined {
    console.log('### _readCoverOptions START');
    const coverConfigPath = paths.join(testsRoot, '..', '..', 'coverconfig.json');
    if (fs.existsSync(coverConfigPath)) {
        const configContent = fs.readFileSync(coverConfigPath, 'utf-8');
        return JSON.parse(configContent);
    }
    console.log('### _readCoverOptions END');
    return undefined;
}

function reportCoverage(testsRoot: string): void {
    console.log(`reportCoverage`);
    const coverageVar = '__coverage__';
    const coverageFile = paths.resolve(testsRoot, '..', '..', 'coverage.json');
    const reportingDir = paths.resolve(testsRoot, '..', '..');
    //istanbul.hook.unhookRequire();
    let cov: any;
    if (typeof global[coverageVar] === 'undefined' || Object.keys(global[coverageVar]).length === 0) {
        console.error('No coverage information was collected, exit without writing coverage information');
        return;
    } else {
        cov = global[coverageVar];
    }

    fs.writeFileSync(coverageFile, JSON.stringify(cov), 'utf8');
    const remappedCollector = remapIstanbul.remap(cov, {
        warn: (warning: any) => {
            // We expect some warnings as any JS file without a typescript mapping will cause this.
            // By default, we'll skip printing these to the console as it clutters it up
            console.warn(warning);
        }
    });

        const reporter = new istanbul.Reporter(undefined, reportingDir);
        reporter.addAll(['lcov', 'html']);
        reporter.write(remappedCollector, true, () => {
            console.log(`reports written to ${reportingDir}`);
        });

    console.log(`cov`, cov);
}

function run(testsRoot: string, clb: any): any {
    console.log('### run', Array.from(arguments));
    // Read configuration for the coverage file
    const coverOptions = _readCoverOptions(testsRoot);
    let coverageRunner;
    if (coverOptions && coverOptions.enabled) {
        // Setup coverage pre-test, including post-test hook to report
        const coverageRunner = new CoverageRunner(coverOptions, testsRoot);
        console.log('### setupCoverage');
        //coverageRunner.setupCoverage();
    }

    // Glob test files
    console.log('### Glob test files');
    glob('**/**.test.js', { cwd: testsRoot }, (error, files): any => {
        if (error) {
            return clb(error);
        }
        try {
            console.log('### Fill into Mocha', files);
            for (const file of files) {
                mocha.addFile(paths.resolve(testsRoot, file));
            }

            // Run the tests
            let failureCount = 0;
            
            console.log('### mocha.run()');
            mocha.run(
                (failures) => {
                    console.log('### end:', failures);
                    reportCoverage(testsRoot);
                    clb(undefined, failures);
                }
            );
        } catch (error) {
            console.log('error', error);
            return clb(error);
        }
    });
}
exports.run = run;

interface ITestRunnerOptions {
    enabled?: boolean;
    relativeCoverageDir: string;
    relativeSourcePath: string;
    ignorePatterns: string[];
    includePid?: boolean;
    reports?: string[];
    verbose?: boolean;
}

class CoverageRunner {

    private coverageVar: string = '__coverage__';
    private transformer: any = undefined;
    private matchFn: any = undefined;
    private instrumenter: any = undefined;

    constructor(private options: ITestRunnerOptions, private testsRoot: string) {
        if (!options.relativeSourcePath) {
            return;
        }
    }

    public setupCoverage(): void {
        // initialize the global variable to stop mocha from complaining about leaks
        global[this.coverageVar] = {};
        console.log(`setupCoverage IN`);
        // Hook the process exit event to handle reporting
        // Only report coverage if the process is exiting successfully
        process.on('exit', (code: number) => {
            console.log(`process.on->exit`);
            console.log(this.reportCoverage);
            //this.reportCoverage();
            process.exitCode = code;
        });
    }

    /**
     * Writes a coverage report.
     * Note that as this is called in the process exit callback, all calls must be synchronous.
     *
     * @returns {void}
     *
     * @memberOf CoverageRunner
     */
    public reportCoverage(): void {
        console.log(`reportCoverage`);
        const self = this;
        //istanbul.hook.unhookRequire();
        let cov: any;
        if (typeof global[self.coverageVar] === 'undefined' || Object.keys(global[self.coverageVar]).length === 0) {
            console.error('No coverage information was collected, exit without writing coverage information');
            return;
        } else {
            cov = global[self.coverageVar];
        }

        console.log(`cov`, cov);

        // TODO consider putting this under a conditional flag
        // Files that are not touched by code ran by the test runner is manually instrumented, to
        // illustrate the missing coverage.       

        self.matchFn.files.forEach((file: any) => {
            if (cov[file]) {
                return;
            }
            self.transformer(fs.readFileSync(file, 'utf-8'), file);

            // When instrumenting the code, istanbul will give each FunctionDeclaration a value of 1 in coverState.s,
            // presumably to compensate for function hoisting. We need to reset this, as the function was not hoisted,
            // as it was never loaded.
            Object.keys(self.instrumenter.coverState.s).forEach((key) => {
                self.instrumenter.coverState.s[key] = 0;
            });

            cov[file] = self.instrumenter.coverState;
        });

        // TODO Allow config of reporting directory with
        const reportingDir = paths.join(self.testsRoot, self.options.relativeCoverageDir);
        const includePid = self.options.includePid;
        const pidExt = includePid ? ('-' + process.pid) : '';
        const coverageFile = paths.resolve(reportingDir, 'coverage' + pidExt + '.json');

        // yes, do this again since some test runners could clean the dir initially created
        _mkDirIfExists(reportingDir);

        fs.writeFileSync(coverageFile, JSON.stringify(cov), 'utf8');

        const remappedCollector = remapIstanbul.remap(cov, {
            warn: (warning: any) => {
                // We expect some warnings as any JS file without a typescript mapping will cause this.
                // By default, we'll skip printing these to the console as it clutters it up
                if (self.options.verbose) {
                    console.warn(warning);
                }
            }
        });

        const reporter = new istanbul.Reporter(undefined, reportingDir);
        const reportTypes = (self.options.reports instanceof Array) ? self.options.reports : ['lcov'];
        reporter.addAll(reportTypes);
        reporter.write(remappedCollector, true, () => {
            console.log(`reports written to ${reportingDir}`);
        });
    }
}