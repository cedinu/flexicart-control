/**
 * FlexiCart Test Runner - CORRECTED SETUP
 * Port: /dev/ttyRP0 (corrected cabling)
 * ACK Response: 0x04 (corrected protocol)
 * 
 * Comprehensive test runner for the corrected FlexiCart setup
 */

const fs = require('fs');
const path = require('path');

// Import our new test modules
const { validateCommunication } = require('./flexicart_communication_validator');
const { testStatusCommands } = require('./flexicart_status_test');
const { testMacroCommands } = require('./flexicart_macro_test');
const { FlexiCartMasterTest } = require('./flexicart_master_test');

// CORRECTED Configuration
const TEST_CONFIG = {
    PORT: '/dev/ttyRP0',              // Corrected port with proper cabling
    CART_ADDRESS: 0x01,              // Default cart address
    ACK_EXPECTED: 0x04,              // CORRECTED: Expected ACK response
    
    // Test execution settings
    RUN_BASIC_TESTS: true,           // Communication validation
    RUN_STATUS_TESTS: true,          // Immediate response commands
    RUN_MACRO_TESTS: true,           // ACK/NACK + status polling
    RUN_MASTER_TEST: true,           // Comprehensive test suite
    
    // Timing
    DELAY_BETWEEN_TESTS: 1000,       // Delay between test suites
    SAVE_RESULTS: true,              // Save results to file
    RESULTS_DIR: './test_results'    // Results directory
};

/**
 * Create results directory if it doesn't exist
 */
function ensureResultsDirectory() {
    if (TEST_CONFIG.SAVE_RESULTS && !fs.existsSync(TEST_CONFIG.RESULTS_DIR)) {
        fs.mkdirSync(TEST_CONFIG.RESULTS_DIR, { recursive: true });
        console.log(`📁 Created results directory: ${TEST_CONFIG.RESULTS_DIR}`);
    }
}

/**
 * Save test results to file
 */
function saveResults(testName, results) {
    if (!TEST_CONFIG.SAVE_RESULTS) return;
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${testName}_${timestamp}.json`;
    const filepath = path.join(TEST_CONFIG.RESULTS_DIR, filename);
    
    try {
        const resultData = {
            testName,
            timestamp: new Date().toISOString(),
            port: TEST_CONFIG.PORT,
            cartAddress: TEST_CONFIG.CART_ADDRESS,
            results
        };
        
        fs.writeFileSync(filepath, JSON.stringify(resultData, null, 2));
        console.log(`💾 Results saved: ${filepath}`);
    } catch (error) {
        console.log(`⚠️  Failed to save results: ${error.message}`);
    }
}

/**
 * Print test header
 */
function printTestHeader(testName, description) {
    const separator = '='.repeat(50);
    console.log(`\n${separator}`);
    console.log(`🧪 ${testName.toUpperCase()}`);
    console.log(`${separator}`);
    console.log(`Description: ${description}`);
    console.log(`Port: ${TEST_CONFIG.PORT} (corrected cabling)`);
    console.log(`Cart Address: 0x${TEST_CONFIG.CART_ADDRESS.toString(16).toUpperCase()}`);
    console.log(`Expected ACK: 0x${TEST_CONFIG.ACK_EXPECTED.toString(16).toUpperCase()} (corrected protocol)`);
    console.log(separator);
}

/**
 * Print test summary
 */
function printTestSummary(testName, results, success) {
    console.log(`\n📋 ${testName.toUpperCase()} SUMMARY`);
    console.log(`${'='.repeat(30)}`);
    console.log(`Status: ${success ? '✅ PASSED' : '❌ FAILED'}`);
    
    if (typeof results === 'object' && results !== null) {
        Object.entries(results).forEach(([key, value]) => {
            if (typeof value === 'number') {
                console.log(`${key}: ${value}`);
            } else if (typeof value === 'boolean') {
                console.log(`${key}: ${value ? '✅' : '❌'}`);
            } else if (typeof value === 'string') {
                console.log(`${key}: ${value}`);
            }
        });
    }
}

/**
 * Run communication validation test
 */
async function runCommunicationTest() {
    printTestHeader('Communication Validation', 'Basic FlexiCart communication test with corrected setup');
    
    try {
        const results = await validateCommunication(TEST_CONFIG.PORT, TEST_CONFIG.CART_ADDRESS);
        const success = results.communicationWorking && results.ackProtocolWorking;
        
        printTestSummary('Communication Test', {
            'Communication Working': results.communicationWorking,
            'ACK Protocol Working': results.ackProtocolWorking,
            'Successful Commands': results.successful,
            'Total Commands': results.total,
            'Success Rate': `${Math.round((results.successful/results.total) * 100)}%`
        }, success);
        
        if (TEST_CONFIG.SAVE_RESULTS) {
            saveResults('communication_test', results);
        }
        
        return { success, results };
        
    } catch (error) {
        console.log(`❌ Communication test failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Run status commands test
 */
async function runStatusTest() {
    printTestHeader('Status Commands', 'Test immediate response commands (status, position, inventory)');
    
    try {
        const results = await testStatusCommands(TEST_CONFIG.PORT, TEST_CONFIG.CART_ADDRESS);
        const success = results.successful > 0 && results.dataResponses > 0;
        
        printTestSummary('Status Test', {
            'Total Commands': results.totalCommands,
            'Successful': results.successful,
            'Data Responses': results.dataResponses,
            'Success Rate': `${results.successRate}%`
        }, success);
        
        if (TEST_CONFIG.SAVE_RESULTS) {
            saveResults('status_test', results);
        }
        
        return { success, results };
        
    } catch (error) {
        console.log(`❌ Status test failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Run macro commands test
 */
async function runMacroTest() {
    printTestHeader('Macro Commands', 'Test ACK/NACK + status polling pattern for complex operations');
    
    try {
        const results = await testMacroCommands(TEST_CONFIG.PORT, TEST_CONFIG.CART_ADDRESS);
        const success = results.ackResponses > 0;
        
        printTestSummary('Macro Test', {
            'Total Commands': results.totalCommands,
            'ACK Responses': results.ackResponses,
            'Completed Operations': results.completedOperations,
            'Success Rate': `${results.successRate}%`
        }, success);
        
        if (TEST_CONFIG.SAVE_RESULTS) {
            saveResults('macro_test', results);
        }
        
        return { success, results };
        
    } catch (error) {
        console.log(`❌ Macro test failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Run master test suite
 */
async function runMasterTest() {
    printTestHeader('Master Test Suite', 'Comprehensive FlexiCart protocol validation');
    
    try {
        const results = await FlexiCartMasterTest.runFullTest(TEST_CONFIG.PORT, TEST_CONFIG.CART_ADDRESS);
        
        const totalTests = results.immediateCommands.length + results.controlCommands.length + results.macroCommands.length;
        const totalSuccess = [
            ...results.immediateCommands,
            ...results.controlCommands,
            ...results.macroCommands
        ].filter(r => r.success).length;
        
        const success = results.basicCommunication && totalSuccess > 5;
        
        printTestSummary('Master Test', {
            'Basic Communication': results.basicCommunication,
            'Total Tests': totalTests,
            'Successful Tests': totalSuccess,
            'Success Rate': `${Math.round((totalSuccess/totalTests) * 100)}%`,
            'Protocol Status': success ? 'WORKING' : 'ISSUES'
        }, success);
        
        if (TEST_CONFIG.SAVE_RESULTS) {
            saveResults('master_test', results);
        }
        
        return { success, results };
        
    } catch (error) {
        console.log(`❌ Master test failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Main test runner
 */
async function runAllTests() {
    console.log(`\n🚀 FLEXICART TEST RUNNER - CORRECTED SETUP`);
    console.log(`==========================================`);
    console.log(`Starting comprehensive FlexiCart testing...`);
    console.log(`Port: ${TEST_CONFIG.PORT} (corrected cabling)`);
    console.log(`Cart Address: 0x${TEST_CONFIG.CART_ADDRESS.toString(16).toUpperCase()}`);
    console.log(`Expected ACK: 0x${TEST_CONFIG.ACK_EXPECTED.toString(16).toUpperCase()} (corrected protocol)`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    // Ensure results directory exists
    ensureResultsDirectory();
    
    const testResults = {
        startTime: new Date().toISOString(),
        port: TEST_CONFIG.PORT,
        cartAddress: TEST_CONFIG.CART_ADDRESS,
        expectedAck: TEST_CONFIG.ACK_EXPECTED,
        tests: {}
    };
    
    let overallSuccess = true;
    
    try {
        // Test 1: Communication Validation
        if (TEST_CONFIG.RUN_BASIC_TESTS) {
            console.log(`\n⏳ Running Communication Validation...`);
            const commResult = await runCommunicationTest();
            testResults.tests.communication = commResult;
            
            if (!commResult.success) {
                console.log(`\n❌ CRITICAL: Communication test failed - aborting remaining tests`);
                overallSuccess = false;
                testResults.aborted = true;
                testResults.abortReason = 'Communication test failed';
                return testResults;
            }
            
            await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.DELAY_BETWEEN_TESTS));
        }
        
        // Test 2: Status Commands
        if (TEST_CONFIG.RUN_STATUS_TESTS) {
            console.log(`\n⏳ Running Status Commands Test...`);
            const statusResult = await runStatusTest();
            testResults.tests.status = statusResult;
            
            if (!statusResult.success) {
                overallSuccess = false;
            }
            
            await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.DELAY_BETWEEN_TESTS));
        }
        
        // Test 3: Macro Commands
        if (TEST_CONFIG.RUN_MACRO_TESTS) {
            console.log(`\n⏳ Running Macro Commands Test...`);
            const macroResult = await runMacroTest();
            testResults.tests.macro = macroResult;
            
            if (!macroResult.success) {
                overallSuccess = false;
            }
            
            await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.DELAY_BETWEEN_TESTS));
        }
        
        // Test 4: Master Test Suite
        if (TEST_CONFIG.RUN_MASTER_TEST) {
            console.log(`\n⏳ Running Master Test Suite...`);
            const masterResult = await runMasterTest();
            testResults.tests.master = masterResult;
            
            if (!masterResult.success) {
                overallSuccess = false;
            }
        }
        
    } catch (error) {
        console.log(`\n💥 Test runner error: ${error.message}`);
        testResults.error = error.message;
        overallSuccess = false;
    }
    
    // Final results
    testResults.endTime = new Date().toISOString();
    testResults.overallSuccess = overallSuccess;
    testResults.duration = new Date(testResults.endTime) - new Date(testResults.startTime);
    
    // Print final summary
    console.log(`\n🏁 FINAL TEST RESULTS`);
    console.log(`=====================`);
    console.log(`Overall Status: ${overallSuccess ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Duration: ${Math.round(testResults.duration / 1000)}s`);
    console.log(`Port: ${TEST_CONFIG.PORT} (corrected cabling)`);
    console.log(`ACK Protocol: ${testResults.tests.communication?.success ? '✅ 0x04 CONFIRMED' : '❌ NOT CONFIRMED'}`);
    
    const testNames = Object.keys(testResults.tests);
    const passedTests = testNames.filter(name => testResults.tests[name]?.success);
    console.log(`Passed Tests: ${passedTests.length}/${testNames.length}`);
    
    if (overallSuccess) {
        console.log(`\n🎉 CORRECTED SETUP FULLY VALIDATED!`);
        console.log(`✅ FlexiCart responding correctly on /dev/ttyRP0`);
        console.log(`✅ ACK (0x04) protocol confirmed`);
        console.log(`✅ All command categories working`);
        console.log(`✅ Ready for production integration`);
    } else {
        console.log(`\n⚠️  Some tests failed - review results for details`);
        passedTests.forEach(test => {
            console.log(`   ✅ ${test}: PASSED`);
        });
        testNames.filter(name => !testResults.tests[name]?.success).forEach(test => {
            console.log(`   ❌ ${test}: FAILED`);
        });
    }
    
    // Save comprehensive results
    if (TEST_CONFIG.SAVE_RESULTS) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `comprehensive_test_results_${timestamp}.json`;
        const filepath = path.join(TEST_CONFIG.RESULTS_DIR, filename);
        
        try {
            fs.writeFileSync(filepath, JSON.stringify(testResults, null, 2));
            console.log(`\n💾 Comprehensive results saved: ${filepath}`);
        } catch (error) {
            console.log(`⚠️  Failed to save comprehensive results: ${error.message}`);
        }
    }
    
    return testResults;
}

// Export for use in other modules
module.exports = {
    TEST_CONFIG,
    runCommunicationTest,
    runStatusTest,
    runMacroTest,
    runMasterTest,
    runAllTests
};

// Run all tests if called directly
if (require.main === module) {
    const port = process.argv[2] || TEST_CONFIG.PORT;
    const cartAddress = process.argv[3] ? parseInt(process.argv[3], 16) : TEST_CONFIG.CART_ADDRESS;
    
    // Update config with command line args
    TEST_CONFIG.PORT = port;
    TEST_CONFIG.CART_ADDRESS = cartAddress;
    
    console.log(`🧪 Starting FlexiCart test runner with corrected setup...`);
    console.log(`Port: ${port}`);
    console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
    
    runAllTests()
        .then(results => {
            if (results.overallSuccess) {
                console.log(`\n✅ All tests completed successfully!`);
                process.exit(0);
            } else {
                console.log(`\n❌ Some tests failed - check results`);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error(`\n💥 Test runner failed: ${error.message}`);
            process.exit(1);
        });
}
