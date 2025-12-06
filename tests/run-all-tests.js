/**
 * GFV LLC - Master Test Runner
 * Runs all test suites and generates comprehensive reports
 */

const path = require('path');

// Import all test modules
const { runStructureTests } = require('./structure.test');
const { runNavigationTests } = require('./navigation.test');
const { runFormTests } = require('./forms.test');
const { runResponsiveTests } = require('./responsive.test');
const { runAccessibilityTests } = require('./accessibility.test');
const { runAnimationTests } = require('./animations.test');
const { runCompatibilityTests } = require('./compatibility.test');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m'
};

function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function printHeader() {
    console.log('\n');
    console.log(colors.cyan + '╔══════════════════════════════════════════════════════════════════╗' + colors.reset);
    console.log(colors.cyan + '║' + colors.reset + colors.bright + '          GFV LLC - Web UX Playground Test Suite                  ' + colors.reset + colors.cyan + '║' + colors.reset);
    console.log(colors.cyan + '║' + colors.reset + '          Molecular-Level Granularity Testing                     ' + colors.cyan + '║' + colors.reset);
    console.log(colors.cyan + '╚══════════════════════════════════════════════════════════════════╝' + colors.reset);
    console.log('\n');
}

function printSuiteHeader(suiteName) {
    console.log('\n' + colors.blue + '━'.repeat(70) + colors.reset);
    console.log(colors.bright + colors.blue + '  📋 ' + suiteName + colors.reset);
    console.log(colors.blue + '━'.repeat(70) + colors.reset);
}

function printTestResult(test) {
    let icon, color;
    
    switch (test.status) {
        case 'PASS':
            icon = '✓';
            color = colors.green;
            break;
        case 'FAIL':
            icon = '✗';
            color = colors.red;
            break;
        case 'WARN':
            icon = '⚠';
            color = colors.yellow;
            break;
        case 'SKIP':
            icon = '○';
            color = colors.dim;
            break;
        default:
            icon = '?';
            color = colors.white;
    }
    
    console.log(`  ${color}${icon}${colors.reset} ${test.name}`);
    
    if (test.status === 'FAIL' && test.error) {
        console.log(`    ${colors.red}└─ Error: ${test.error}${colors.reset}`);
    }
    
    if (test.status === 'WARN' && test.warning) {
        console.log(`    ${colors.yellow}└─ ${test.warning}${colors.reset}`);
    }
}

function printSuiteSummary(result) {
    const { passed, failed, warnings, skipped, total, duration } = result;
    
    console.log('\n  ' + colors.dim + '─'.repeat(50) + colors.reset);
    
    const parts = [];
    if (passed > 0) parts.push(colors.green + `${passed} passed` + colors.reset);
    if (failed > 0) parts.push(colors.red + `${failed} failed` + colors.reset);
    if (warnings > 0) parts.push(colors.yellow + `${warnings} warnings` + colors.reset);
    if (skipped > 0) parts.push(colors.dim + `${skipped} skipped` + colors.reset);
    
    console.log(`  ${parts.join(', ')} ${colors.dim}(${formatDuration(duration)})${colors.reset}`);
}

function printFinalReport(allResults) {
    const totalPassed = allResults.reduce((sum, r) => sum + r.passed, 0);
    const totalFailed = allResults.reduce((sum, r) => sum + r.failed, 0);
    const totalWarnings = allResults.reduce((sum, r) => sum + r.warnings, 0);
    const totalSkipped = allResults.reduce((sum, r) => sum + r.skipped, 0);
    const totalTests = allResults.reduce((sum, r) => sum + r.total, 0);
    const totalDuration = allResults.reduce((sum, r) => sum + r.duration, 0);
    
    console.log('\n\n');
    console.log(colors.cyan + '╔══════════════════════════════════════════════════════════════════╗' + colors.reset);
    console.log(colors.cyan + '║' + colors.reset + colors.bright + '                        FINAL REPORT                              ' + colors.reset + colors.cyan + '║' + colors.reset);
    console.log(colors.cyan + '╚══════════════════════════════════════════════════════════════════╝' + colors.reset);
    
    console.log('\n  ' + colors.bright + 'Test Suites:' + colors.reset);
    console.log('  ─'.repeat(30));
    
    allResults.forEach(result => {
        const status = result.failed > 0 
            ? colors.red + 'FAIL' + colors.reset
            : result.warnings > 0 
                ? colors.yellow + 'WARN' + colors.reset
                : colors.green + 'PASS' + colors.reset;
        
        console.log(`  ${status}  ${result.suite}`);
        console.log(`       ${colors.dim}${result.passed}/${result.total} passed, ${result.warnings} warnings${colors.reset}`);
    });
    
    console.log('\n  ' + colors.bright + 'Overall Statistics:' + colors.reset);
    console.log('  ─'.repeat(30));
    console.log(`  Total Tests:    ${totalTests}`);
    console.log(`  ${colors.green}Passed:         ${totalPassed}${colors.reset}`);
    console.log(`  ${colors.red}Failed:         ${totalFailed}${colors.reset}`);
    console.log(`  ${colors.yellow}Warnings:       ${totalWarnings}${colors.reset}`);
    console.log(`  ${colors.dim}Skipped:        ${totalSkipped}${colors.reset}`);
    console.log(`  Duration:       ${formatDuration(totalDuration)}`);
    
    // Pass rate
    const passRate = ((totalPassed / (totalTests - totalSkipped)) * 100).toFixed(1);
    console.log(`\n  ${colors.bright}Pass Rate: ${passRate >= 90 ? colors.green : passRate >= 70 ? colors.yellow : colors.red}${passRate}%${colors.reset}`);
    
    // Critical issues summary
    const criticalIssues = allResults.flatMap(r => 
        r.tests.filter(t => t.status === 'FAIL').map(t => ({
            suite: r.suite,
            test: t.name,
            error: t.error
        }))
    );
    
    if (criticalIssues.length > 0) {
        console.log('\n  ' + colors.red + colors.bright + '🚨 CRITICAL ISSUES REQUIRING ATTENTION:' + colors.reset);
        console.log('  ─'.repeat(30));
        criticalIssues.forEach((issue, i) => {
            console.log(`  ${i + 1}. ${colors.red}[${issue.suite}]${colors.reset} ${issue.test}`);
            if (issue.error) {
                console.log(`     ${colors.dim}${issue.error}${colors.reset}`);
            }
        });
    }
    
    // Warnings summary
    const allWarnings = allResults.flatMap(r => 
        r.tests.filter(t => t.status === 'WARN').map(t => ({
            suite: r.suite,
            test: t.name,
            warning: t.warning
        }))
    );
    
    if (allWarnings.length > 0) {
        console.log('\n  ' + colors.yellow + colors.bright + '⚠️  WARNINGS TO CONSIDER:' + colors.reset);
        console.log('  ─'.repeat(30));
        allWarnings.slice(0, 10).forEach((w, i) => {
            console.log(`  ${i + 1}. ${colors.yellow}[${w.suite}]${colors.reset} ${w.test}`);
        });
        if (allWarnings.length > 10) {
            console.log(`  ${colors.dim}... and ${allWarnings.length - 10} more warnings${colors.reset}`);
        }
    }
    
    // Final status banner
    console.log('\n');
    if (totalFailed === 0 && totalWarnings === 0) {
        console.log(colors.bgGreen + colors.bright + '  ✨ ALL TESTS PASSED - SITE IS STABLE! ✨  ' + colors.reset);
    } else if (totalFailed === 0) {
        console.log(colors.bgYellow + colors.bright + '  ⚠️  TESTS PASSED WITH WARNINGS - REVIEW RECOMMENDED  ' + colors.reset);
    } else {
        console.log(colors.bgRed + colors.bright + '  ❌ TESTS FAILED - FIXES REQUIRED BEFORE DEPLOYMENT  ' + colors.reset);
    }
    console.log('\n');
    
    return { totalPassed, totalFailed, totalWarnings, totalSkipped, totalTests };
}

async function runAllTests(options = {}) {
    const { verbose = true, suites = 'all' } = options;
    
    printHeader();
    
    const testSuites = [
        { name: 'Structure', runner: runStructureTests },
        { name: 'Navigation', runner: runNavigationTests },
        { name: 'Forms', runner: runFormTests },
        { name: 'Responsive', runner: runResponsiveTests },
        { name: 'Accessibility', runner: runAccessibilityTests },
        { name: 'Animations', runner: runAnimationTests },
        { name: 'Compatibility', runner: runCompatibilityTests }
    ];
    
    const suitesToRun = suites === 'all' 
        ? testSuites 
        : testSuites.filter(s => suites.includes(s.name.toLowerCase()));
    
    const allResults = [];
    
    for (const suite of suitesToRun) {
        printSuiteHeader(suite.name);
        
        try {
            console.log(`  ${colors.dim}Running tests...${colors.reset}`);
            const result = await suite.runner();
            allResults.push(result);
            
            if (verbose) {
                console.log('');
                result.tests.forEach(test => printTestResult(test));
            }
            
            printSuiteSummary(result);
        } catch (error) {
            console.log(`  ${colors.red}✗ Suite failed to run: ${error.message}${colors.reset}`);
            allResults.push({
                suite: suite.name,
                total: 1,
                passed: 0,
                failed: 1,
                warnings: 0,
                skipped: 0,
                duration: 0,
                tests: [{ name: 'Suite execution', status: 'FAIL', error: error.message }]
            });
        }
    }
    
    const summary = printFinalReport(allResults);
    
    return {
        results: allResults,
        summary
    };
}

// CLI execution
if (require.main === module) {
    const args = process.argv.slice(2);
    const verbose = !args.includes('--quiet');
    const suites = args.includes('--suite') 
        ? args[args.indexOf('--suite') + 1]?.split(',') 
        : 'all';
    
    runAllTests({ verbose, suites })
        .then(({ summary }) => {
            process.exit(summary.totalFailed > 0 ? 1 : 0);
        })
        .catch(error => {
            console.error(colors.red + 'Test runner failed:', error + colors.reset);
            process.exit(1);
        });
}

module.exports = { runAllTests };
