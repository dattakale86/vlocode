//
// PLEASE DO NOT MODIFY / DELETE UNLESS YOU KNOW WHAT YOU ARE DOING
//

import * as fs from 'fs';
import * as glob from 'glob';
import * as paths from 'path';

import istanbul = require('istanbul');
import mocha = require('mocha');
import remapIstanbul = require('remap-istanbul');

declare var global: any;

export interface TestRunnerOptions {
    includeFiles: string;
    reportCoverage?: boolean;
    coverageVar?: string;
    coverageReports?: string[];
    reportingDir?: string;
}

/**
 * Custom test runner using mocha and istanbul
 */
export class TestRunner {

    constructor(private readonly runnerOptions: mocha.MochaOptions & TestRunnerOptions) {
    }

    /**
     * Runs the tests in the specified test root.
     * @param testsRoot Root of the tests to execute.
     * @param callback Callback to invoke after test completion
     */
    public run(testsRoot: string): Promise<number> {
        const mochaRunner = new mocha(this.runnerOptions);
        const testsFiles = glob.sync(this.runnerOptions.includeFiles || '**/**.test.js', { cwd: testsRoot });

        for (const file of testsFiles) {
            mochaRunner.addFile(paths.resolve(testsRoot, file));
        }
        
        return new Promise(resolve => {
            mochaRunner.run(failures => {
                if(this.runnerOptions.reportCoverage) {
                    this.writeCoverageReport(this.runnerOptions.reportingDir || '.');
                }
                resolve(failures);
            });
        });
    }

    private writeCoverageReport(reportingDir: string): void {
        const coverageVar = this.runnerOptions.coverageVar || '__coverage__';
        const coverageFile = paths.resolve(reportingDir, 'coverage.json');

        const coverageData = global[coverageVar];
        if (typeof coverageData === 'undefined' || Object.keys(coverageData).length === 0) {
            return console.error('CodeCoverage: No coverage information was collected, exit without writing coverage information');
        } 

        this.ensureExists(reportingDir);
        fs.writeFileSync(coverageFile, JSON.stringify(coverageData), 'utf8');
        const remappedCollector = remapIstanbul.remap(coverageData);
    
        const reporter = new istanbul.Reporter(undefined, reportingDir);
        reporter.addAll(this.runnerOptions.coverageReports || [ 'html' ]);
        reporter.write(remappedCollector, true, () => {
            console.log(`CodeCoverage: reports written to ${reportingDir}`);
        });
    }

    /**
     * Ensures a particular directory exists and otherwise creates it
     * @param dir Path to the directory
     */
    private ensureExists(dir: string): void {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }
    }
}