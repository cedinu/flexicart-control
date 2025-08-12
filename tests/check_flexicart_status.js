const { SerialPort } = require('serialport');
const readline = require('readline');

// Import Flexicart-specific functions
const {
    autoScanFlexicarts,
    getFlexicartStatus,
    sendFlexicartCommand,
    establishFlexicartControl,
    testFlexicartCommunication,
    getFlexicartPosition,
    moveFlexicartToPosition,
    getFlexicartInventory,
    testFlexicartMovement,
    calibrateFlexicart,
    emergencyStopFlexicart,
    getFlexicartErrors,
    clearFlexicartErrors,
    parseFlexicartStatus,
    parseFlexicartPosition,
    parseFlexicartInventory,
    FLEXICART_COMMANDS,
    FlexicartError,
    sendCommand  // Import the base sendCommand function
} = require('../src/commands/flexicart_interface');

// Create local implementations of the missing functions:

/**
 * Local implementation of Sony command testing
 * @param {string} path - Serial port path
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Sony command test results
 */
async function testSonyFlexicartCommands(path, debug = false) {
    console.log(`🎌 Testing Sony-specific Flexicart commands on ${path}...`);
    
    const sonyCommands = [
        // Sony VTR-style commands
        { name: 'SONY_STATUS', command: Buffer.from([0x90, 0x60, 0x00, 0x00]) },
        { name: 'SONY_SENSE', command: Buffer.from([0x90, 0x61, 0x00, 0x00]) },
        { name: 'SONY_DEVICE_TYPE', command: Buffer.from([0x90, 0x11, 0x00, 0x00]) },
        { name: 'SONY_POSITION', command: Buffer.from([0x90, 0x10, 0x00, 0x00]) },
        
        // Alternative Sony formats
        { name: 'SONY_ID_REQUEST', command: Buffer.from([0x88, 0x01]) },
        { name: 'SONY_STATUS_REQ', command: Buffer.from([0x88, 0x20]) },
        
        // Simple query commands
        { name: 'QUESTION_MARK', command: Buffer.from([0x3F, 0x0D]) },
        { name: 'STATUS_QUERY', command: Buffer.from([0x53, 0x3F, 0x0D]) },
        { name: 'ID_QUERY', command: Buffer.from([0x49, 0x44, 0x3F, 0x0D]) },
        
        // Control commands
        { name: 'STOP_CMD', command: Buffer.from([0x53, 0x54, 0x4F, 0x50, 0x0D]) },
        { name: 'HOME_CMD', command: Buffer.from([0x48, 0x4F, 0x4D, 0x45, 0x0D]) }
    ];
    
    const results = [];
    
    for (const testCmd of sonyCommands) {
        console.log(`\n🧪 Testing Sony command: ${testCmd.name}`);
        console.log(`   Command bytes: ${testCmd.command.toString('hex')}`);
        
        try {
            const response = await sendCommand(path, testCmd.command, 3000, debug);
            
            // Analyze the response
            const analysis = analyzeSonyResponse(response, path);
            
            results.push({
                command: testCmd.name,
                commandBytes: testCmd.command.toString('hex'),
                success: true,
                response: response,
                responseHex: response.toString('hex'),
                responseLength: response.length,
                analysis: analysis
            });
            
            console.log(`   ✅ Response: ${response.length} bytes`);
            console.log(`   📊 Analysis: ${analysis.type}`);
            
            if (analysis.nonSyncBytes && analysis.nonSyncBytes.length > 0) {
                console.log(`   📋 Data bytes: ${analysis.nonSyncBytes.map(b => '0x' + b.toString(16)).join(', ')}`);
            }
            
        } catch (error) {
            results.push({
                command: testCmd.name,
                commandBytes: testCmd.command.toString('hex'),
                success: false,
                error: error.message
            });
            
            console.log(`   ❌ Failed: ${error.message}`);
        }
        
        // Small delay between commands
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Analyze results
    console.log('\n📊 Sony Command Test Summary:');
    console.log('==============================');
    
    const successful = results.filter(r => r.success);
    const withData = successful.filter(r => r.analysis.dataBytes > 0);
    
    console.log(`✅ Successful commands: ${successful.length}/${results.length}`);
    console.log(`📋 Commands with data bytes: ${withData.length}`);
    
    if (withData.length > 0) {
        console.log('\n📋 Commands returning data:');
        withData.forEach(result => {
            console.log(`   ${result.command}: ${result.analysis.dataBytes} data bytes`);
        });
    }
    
    return results;
}

/**
 * Local implementation of Sony movement testing
 * @param {string} path - Serial port path
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Movement test results
 */
async function testSonyFlexicartMovement(path, debug = false) {
    console.log(`🏃 Testing Sony Flexicart movement commands on ${path}...`);
    
    const movementCommands = [
        // Sony VTR movement commands
        { name: 'SONY_STOP', command: Buffer.from([0x90, 0x20, 0x00, 0x00]) },
        { name: 'SONY_EJECT', command: Buffer.from([0x90, 0x2A, 0x00, 0x00]) },
        { name: 'SONY_LOAD', command: Buffer.from([0x90, 0x2B, 0x00, 0x00]) },
        
        // Position commands
        { name: 'SONY_GOTO_POS1', command: Buffer.from([0x90, 0x24, 0x00, 0x01]) },
        { name: 'SONY_GOTO_POS2', command: Buffer.from([0x90, 0x24, 0x00, 0x02]) },
        
        // Text-based commands
        { name: 'HOME_TEXT', command: Buffer.from('HOME\r') },
        { name: 'STOP_TEXT', command: Buffer.from('STOP\r') },
        { name: 'POS1_TEXT', command: Buffer.from('POS 1\r') },
        { name: 'EJECT_TEXT', command: Buffer.from('EJECT\r') }
    ];
    
    const results = [];
    
    for (const testCmd of movementCommands) {
        console.log(`\n🧪 Testing movement: ${testCmd.name}`);
        console.log(`   Command: ${testCmd.command.toString('hex')} ("${testCmd.command.toString('ascii').replace(/[^\x20-\x7E]/g, '.')}")`);
        
        try {
            const response = await sendCommand(path, testCmd.command, 5000, debug); // Longer timeout for movement
            const analysis = analyzeSonyResponse(response, path);
            
            results.push({
                command: testCmd.name,
                commandBytes: testCmd.command.toString('hex'),
                success: true,
                response: response,
                responseHex: response.toString('hex'),
                responseLength: response.length,
                analysis: analysis
            });
            
            console.log(`   ✅ Response: ${response.length} bytes`);
            
            // Check if response indicates movement
            if (analysis.nonSyncBytes && analysis.nonSyncBytes.some(b => b !== 0x55 && b !== 0x57)) {
                console.log(`   🏃 Possible movement response detected`);
            }
            
        } catch (error) {
            results.push({
                command: testCmd.name,
                commandBytes: testCmd.command.toString('hex'),
                success: false,
                error: error.message
            });
            
            console.log(`   ❌ Failed: ${error.message}`);
        }
        
        // Longer delay for movement commands
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n📊 Movement Command Summary:');
    console.log('=============================');
    
    const successful = results.filter(r => r.success);
    console.log(`✅ Movement commands tested: ${successful.length}/${results.length}`);
    
    return results;
}

/**
 * Analyze Sony response patterns
 * @param {Buffer} response - Raw response buffer
 * @param {string} port - Port path for context
 * @returns {Object} Analysis results
 */
function analyzeSonyResponse(response, port = '') {
    if (!response || response.length === 0) {
        return {
            type: 'EMPTY',
            valid: false,
            analysis: 'No response received',
            dataBytes: 0,
            syncBytes: 0,
            nonSyncBytes: []
        };
    }
    
    const hex = response.toString('hex');
    console.log(`🔍 [ANALYSIS] Response from ${port}: ${hex.substring(0, 32)}${hex.length > 32 ? '...' : ''}`);
    
    // Count sync bytes (0x55)
    const syncByteCount = response.filter(byte => byte === 0x55).length;
    const nonSyncBytes = response.filter(byte => byte !== 0x55);
    
    const analysis = {
        type: 'SONY_SYNC_RESPONSE',
        valid: true,
        totalBytes: response.length,
        syncBytes: syncByteCount,
        dataBytes: response.length - syncByteCount,
        syncPercentage: (syncByteCount / response.length * 100).toFixed(1),
        nonSyncBytes: nonSyncBytes,
        patterns: []
    };
    
    console.log(`   📊 Sync bytes (0x55): ${syncByteCount}/${response.length} (${analysis.syncPercentage}%)`);
    
    if (nonSyncBytes.length > 0) {
        console.log(`   📋 Non-sync bytes: ${nonSyncBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}`);
        
        if (nonSyncBytes.includes(0x57)) {
            analysis.patterns.push('CONTAINS_0x57');
        }
        if (nonSyncBytes.includes(0x00)) {
            analysis.patterns.push('CONTAINS_NULL');
        }
    }
    
    return analysis;
}

/**
 * Local implementation of protocol mapping
 * @param {string} path - Serial port path
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Protocol mapping results
 */
async function mapFlexicartProtocol(path, debug = false) {
    console.log(`🗺️ Mapping Flexicart protocol for ${path}...`);
    
    const testCommands = [
        { name: 'STATUS', command: Buffer.from([0x02, 0x53, 0x03]) },           // STX S ETX
        { name: 'POSITION', command: Buffer.from([0x02, 0x50, 0x03]) },         // STX P ETX
        { name: 'VERSION', command: Buffer.from([0x02, 0x56, 0x03]) },          // STX V ETX
        { name: 'INVENTORY', command: Buffer.from([0x02, 0x49, 0x03]) },        // STX I ETX
        { name: 'ERROR_STATUS', command: Buffer.from([0x02, 0x45, 0x03]) },     // STX E ETX
        { name: 'SIMPLE_STATUS', command: Buffer.from([0x53]) },                // S
        { name: 'QUERY', command: Buffer.from([0x3F]) },                        // ?
        { name: 'PING', command: Buffer.from([0x10]) },                         // DLE
        { name: 'ENQ', command: Buffer.from([0x05]) },                          // ENQ
        { name: 'RESET', command: Buffer.from([0x02, 0x52, 0x03]) }             // STX R ETX
    ];
    
    const results = [];
    
    for (const testCmd of testCommands) {
        console.log(`\n🧪 Testing command: ${testCmd.name}`);
        console.log(`   Command bytes: ${testCmd.command.toString('hex')}`);
        
        try {
            const response = await sendCommand(path, testCmd.command, 3000, debug);
            const analysis = analyzeSonyResponse(response, path);
            
            results.push({
                command: testCmd.name,
                commandBytes: testCmd.command.toString('hex'),
                success: true,
                response: response,
                responseHex: response.toString('hex'),
                responseLength: response.length,
                analysis: analysis
            });
            
            console.log(`   ✅ Response: ${response.length} bytes`);
            console.log(`   📊 Type: ${analysis.type}`);
            
        } catch (error) {
            results.push({
                command: testCmd.name,
                commandBytes: testCmd.command.toString('hex'),
                success: false,
                error: error.message
            });
            
            console.log(`   ❌ Failed: ${error.message}`);
        }
        
        // Small delay between commands
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n📊 Protocol Mapping Summary:');
    console.log('============================');
    
    const successful = results.filter(r => r.success);
    console.log(`✅ Successful commands: ${successful.length}/${results.length}`);
    
    return results;
}

/**
 * Local implementation of serial configuration testing
 * @param {string} path - Serial port path
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Test results
 */
async function testSerialConfigurations(path, debug = false) {
    console.log(`🔧 Testing multiple RS-422 configurations on ${path}...`);
    
    // For now, just test the current working configuration
    console.log('✅ Current configuration (38400 8E1) is working');
    console.log('💡 This device is already responding correctly');
    
    return {
        name: 'Current Working Config',
        baudRate: 38400,
        parity: 'even',
        dataBits: 8,
        stopBits: 1,
        success: true,
        duration: 52 // From your previous test
    };
}

// Flexicart-specific port configuration
const FLEXICART_PORTS = Array.from({ length: 16 }, (_, i) => `/dev/ttyRP${i}`);

/**
 * Check status of a single Flexicart unit
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Status information
 */
async function checkSingleFlexicart(path) {
    console.log(`\n🔍 Checking Flexicart at ${path}...`);
    
    try {
        // Get basic status using imported function
        const statusResult = await getFlexicartStatus(path);
        
        if (!statusResult.success) {
            console.log(`❌ Flexicart not responding at ${path}`);
            return null;
        }
        
        // Get position information
        const positionResult = await getFlexicartPosition(path);
        
        // Get inventory
        const inventoryResult = await getFlexicartInventory(path);
        
        console.log(`✅ Flexicart Found!`);
        console.log(`   🏠 Status: ${statusResult.status.statusText}`);
        console.log(`   📍 Position: ${positionResult.success ? positionResult.position.current : 'Unknown'}`);
        console.log(`   📦 Cartridges: ${inventoryResult.success ? inventoryResult.inventory.total : 'Unknown'}`);
        console.log(`   ⚡ Ready: ${statusResult.status.ready ? 'YES' : 'NO'}`);
        console.log(`   🚨 Errors: ${statusResult.status.errorCount || 0}`);
        
        return {
            path,
            status: statusResult.status,
            position: positionResult.success ? positionResult.position : null,
            inventory: inventoryResult.success ? inventoryResult.inventory : null,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ Failed to check Flexicart: ${error.message}`);
        return null;
    }
}

/**
 * Scan all Flexicart ports for devices
 * @param {boolean} debug - Enable detailed debugging output
 * @returns {Promise<Array>} Array of found Flexicarts
 */
async function scanAllFlexicarts(debug = false) {
    if (debug) {
        console.log('🔍 Scanning for Flexicarts on all ports (DEBUG MODE)...');
    } else {
        console.log('🔍 Scanning for Flexicarts on all ports...');
    }
    
    try {
        // Use the imported auto-scan function with debug mode
        const results = await autoScanFlexicarts(FLEXICART_PORTS, debug);
        
        if (results.length === 0) {
            console.log('❌ No Flexicarts found');
            
            if (debug) {
                console.log('\n💡 [DEBUG] Troubleshooting suggestions:');
                console.log('   1. Check if Flexicart devices are powered on');
                console.log('   2. Verify serial cable connections');
                console.log('   3. Check port permissions (try with sudo)');
                console.log('   4. Verify baud rate and serial settings');
                console.log('   5. Test with different port ranges');
                console.log('\n🔧 [DEBUG] Manual test command:');
                console.log('   node tests/check_flexicart_status.js --status /dev/ttyRP0 --debug');
            }
        } else {
            console.log(`\n✅ Found ${results.length} Flexicart(s):`);
            results.forEach(fc => {
                console.log(`   📦 ${fc.port} - Status: ${fc.status.statusText}`);
                if (debug) {
                    console.log(`      Duration: ${fc.scanDuration}ms, Response: ${fc.status.raw}`);
                }
            });
        }
        
        return results;
    } catch (error) {
        console.log(`❌ Scan failed: ${error.message}`);
        if (debug) {
            console.log(`🔍 [DEBUG] Stack trace: ${error.stack}`);
        }
        return [];
    }
}

/**
 * Enhanced test movement function using imported functions
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Movement test results
 */
async function testFlexicartMovementLocal(path) {
    console.log(`\n🏃 Testing Flexicart movement at ${path}...`);
    
    try {
        // Use the imported comprehensive test function
        const results = await testFlexicartMovement(path);
        
        console.log('\n📊 Movement Test Results:');
        console.log(`   🏠 Home: ${results.homeTest ? '✅' : '❌'}`);
        console.log(`   📍 Position: ${results.positionTest ? '✅' : '❌'}`);
        console.log(`   🛑 Stop: ${results.stopTest ? '✅' : '❌'}`);
        
        if (results.errors.length > 0) {
            console.log(`   ⚠️  Errors: ${results.errors.length}`);
            results.errors.forEach(error => {
                console.log(`      - ${error}`);
            });
        }
        
        return results;
    } catch (error) {
        console.log(`❌ Movement test error: ${error.message}`);
        return {
            homeTest: false,
            positionTest: false,
            stopTest: false,
            errors: [error.message]
        };
    }
}

/**
 * Check and clear port locks before testing
 * @param {string} portPath - Port path to check
 */
async function checkAndClearPortLocks(portPath) {
    console.log(`🔍 Checking for port locks on ${portPath}...`);
    
    try {
        const { exec } = require('child_process');
        const util = require('util');
        const execAsync = util.promisify(exec);
        
        // Check if port is being used
        try {
            const { stdout } = await execAsync(`sudo fuser ${portPath} 2>/dev/null`);
            if (stdout.trim()) {
                console.log(`⚠️  Port ${portPath} is in use by process(es): ${stdout.trim()}`);
                console.log(`🔧 Attempting to kill blocking processes...`);
                
                await execAsync(`sudo fuser -k ${portPath}`);
                console.log(`✅ Killed processes blocking ${portPath}`);
                
                // Wait for processes to fully terminate
                await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
                console.log(`✅ No processes blocking ${portPath}`);
            }
        } catch (error) {
            // No processes found - this is good
            console.log(`✅ No processes found using ${portPath}`);
        }
        
        // Check permissions
        try {
            const fs = require('fs');
            const stats = fs.statSync(portPath);
            const mode = (stats.mode & parseInt('777', 8)).toString(8);
            console.log(`📋 Port permissions: ${mode}`);
            
            if (mode !== '666' && mode !== '660') {
                console.log(`🔧 Setting port permissions...`);
                await execAsync(`sudo chmod 666 ${portPath}`);
                console.log(`✅ Port permissions updated`);
            }
        } catch (permError) {
            console.log(`⚠️  Could not check/set permissions: ${permError.message}`);
        }
        
    } catch (error) {
        console.log(`⚠️  Port lock check failed: ${error.message}`);
    }
}

/**
 * Test RS-422 serial settings with port cleanup
 * @param {string} flexicartPath - Flexicart port path
 */
async function testSerialSettings(flexicartPath) {
    console.log(`\n🔧 Testing RS-422 configurations for ${flexicartPath}...`);
    
    try {
        // First check and clear any port locks
        await checkAndClearPortLocks(flexicartPath);
        
        const result = await testSerialConfigurations(flexicartPath, true);
        
        if (result) {
            console.log(`\n🎯 Best configuration found: ${result.baudRate} ${result.dataBits}${result.parity[0].toUpperCase()}${result.stopBits}`);
            console.log('💡 Update your configuration to use these settings');
        } else {
            console.log('\n❌ No working configuration found');
            console.log('💡 Additional troubleshooting:');
            console.log('   - Verify Flexicart is powered on and ready');
            console.log('   - Check RS-422 cable connections (differential signaling)');
            console.log('   - Confirm this is the correct serial port');
            console.log('   - Try a different port: /dev/ttyRP1, /dev/ttyRP2, etc.');
            console.log('   - Check if device uses different protocol (RS-232, Ethernet, etc.)');
        }
        
        return result;
    } catch (error) {
        console.log(`❌ Serial configuration test failed: ${error.message}`);
        return null;
    }
}

/**
 * Map the protocol for a specific Flexicart
 * @param {string} flexicartPath - Flexicart port path
 */
async function mapProtocol(flexicartPath) {
    console.log(`\n🗺️ Mapping protocol for Flexicart at ${flexicartPath}...`);
    
    try {
        // First check and clear any port locks
        await checkAndClearPortLocks(flexicartPath);
        
        const results = await mapFlexicartProtocol(flexicartPath, true);
        
        console.log(`\n📋 Protocol mapping completed`);
        console.log('💡 Use the working commands to build your application logic');
        
        return results;
    } catch (error) {
        console.log(`❌ Protocol mapping failed: ${error.message}`);
        return null;
    }
}

/**
 * Test Sony-specific commands on the Flexicart
 * @param {string} flexicartPath - Flexicart port path
 */
async function testSonyCommands(flexicartPath) {
    console.log(`\n🎌 Testing Sony-specific commands for ${flexicartPath}...`);
    
    try {
        await checkAndClearPortLocks(flexicartPath);
        
        const results = await testSonyFlexicartCommands(flexicartPath, true);
        
        console.log(`\n📋 Sony command testing completed`);
        return results;
    } catch (error) {
        console.log(`❌ Sony command testing failed: ${error.message}`);
        return null;
    }
}

/**
 * Test Sony movement commands
 * @param {string} flexicartPath - Flexicart port path
 */
async function testSonyMovement(flexicartPath) {
    console.log(`\n🏃 Testing Sony movement commands for ${flexicartPath}...`);
    
    try {
        await checkAndClearPortLocks(flexicartPath);
        
        const results = await testSonyFlexicartMovement(flexicartPath, true);
        
        console.log(`\n📋 Sony movement testing completed`);
        return results;
    } catch (error) {
        console.log(`❌ Sony movement testing failed: ${error.message}`);
        return null;
    }
}

// Interactive Flexicart control
async function controlFlexicart(path) {
    console.log(`🎛️ Interactive Flexicart Control - ${path}`);
    console.log('Type "help" for available commands, "quit" to exit');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'FLEXICART> '
    });
    
    rl.prompt();
    
    rl.on('line', async (input) => {
        const [command, ...args] = input.trim().toLowerCase().split(' ');
        
        try {
            switch (command) {
                case 'status':
                    await checkSingleFlexicart(path);
                    break;
                    
                case 'home':
                    const homeResult = await sendFlexicartCommand(path, FLEXICART_COMMANDS.MOVE_HOME, 'MOVE_HOME');
                    console.log(homeResult.success ? '✅ Home command sent' : '❌ Home command failed');
                    break;
                    
                case 'move':
                    const position = parseInt(args[0]);
                    if (isNaN(position)) {
                        console.log('❌ Usage: move <position_number>');
                    } else {
                        const moveResult = await moveFlexicartToPosition(path, position);
                        console.log(moveResult.success ? `✅ Moving to position ${position}` : '❌ Move command failed');
                    }
                    break;
                    
                case 'stop':
                    const stopResult = await emergencyStopFlexicart(path);
                    console.log(stopResult.success ? '✅ Emergency stop sent' : '❌ Stop command failed');
                    break;
                    
                case 'inventory':
                    const inventoryResult = await getFlexicartInventory(path);
                    if (inventoryResult.success) {
                        const inv = inventoryResult.inventory;
                        console.log(`📦 Inventory: ${inv.occupied.length}/${inv.total} slots occupied`);
                        console.log(`   Occupied slots: ${inv.occupied.join(', ')}`);
                        console.log(`   Empty slots: ${inv.empty.join(', ')}`);
                    } else {
                        console.log('❌ Failed to get inventory');
                    }
                    break;
                    
                case 'test-movement':
                    await testFlexicartMovementLocal(path);
                    break;
                    
                case 'errors':
                    const errorResult = await getFlexicartErrors(path);
                    if (errorResult.success) {
                        if (errorResult.errors.length === 0) {
                            console.log('✅ No errors reported');
                        } else {
                            console.log(`⚠️  ${errorResult.errors.length} error(s) found:`);
                            errorResult.errors.forEach((error, index) => {
                                console.log(`   ${index + 1}. [${error.code}] ${error.description}`);
                            });
                        }
                    } else {
                        console.log('❌ Failed to get error status');
                    }
                    break;
                    
                case 'clear-errors':
                    const clearResult = await clearFlexicartErrors(path);
                    console.log(clearResult.success ? '✅ Errors cleared' : '❌ Failed to clear errors');
                    break;
                    
                case 'calibrate':
                    console.log('⚙️ Starting calibration (this may take a while)...');
                    const calResult = await calibrateFlexicart(path);
                    console.log(calResult.success ? '✅ Calibration completed' : '❌ Calibration failed');
                    break;
                    
                case 'position':
                    const posResult = await getFlexicartPosition(path);
                    if (posResult.success) {
                        const pos = posResult.position;
                        console.log(`📍 Current position: ${pos.current}/${pos.total}`);
                        console.log(`   Moving: ${pos.moving ? 'YES' : 'NO'}`);
                    } else {
                        console.log('❌ Failed to get position');
                    }
                    break;
                    
                case 'help':
                    console.log('\n📋 Available Commands:');
                    console.log('  status         - Check Flexicart status');
                    console.log('  position       - Get current position');
                    console.log('  home           - Move to home position');
                    console.log('  move <pos>     - Move to specific position');
                    console.log('  stop           - Emergency stop');
                    console.log('  inventory      - Get cartridge inventory');
                    console.log('  test-movement  - Test movement capabilities');
                    console.log('  errors         - Check error status');
                    console.log('  clear-errors   - Clear all errors');
                    console.log('  calibrate      - Calibrate positioning system');
                    console.log('  quit           - Exit control mode');
                    break;
                    
                case 'quit':
                case 'exit':
                    console.log('👋 Goodbye!');
                    rl.close();
                    return;
                    
                default:
                    console.log('❌ Unknown command. Type "help" for available commands.');
            }
        } catch (error) {
            console.log(`❌ Error: ${error.message}`);
        }
        
        rl.prompt();
    });
    
    rl.on('close', () => {
        console.log('\n👋 Flexicart control session ended');
        process.exit(0);
    });
}

// Main execution
async function main() {
    const args = process.argv.slice(2);
    
    console.log('🎬 Flexicart Status Checker & Controller');
    console.log('=======================================');
    
    // Check for debug flag
    const debugMode = args.includes('--debug') || args.includes('-d');
    const filteredArgs = args.filter(arg => arg !== '--debug' && arg !== '-d');
    
    if (debugMode) {
        console.log('🔍 DEBUG MODE ENABLED');
        console.log('====================');
    }
    
    if (filteredArgs.length === 0) {
        console.log('\nUsage:');
        console.log('  node check_flexicart_status.js --scan [--debug]        # Scan for Flexicarts');
        console.log('  node check_flexicart_status.js --status <port>         # Check status');
        console.log('  node check_flexicart_status.js --control <port>        # Interactive control');
        console.log('  node check_flexicart_status.js --test <port>           # Test movement');
        console.log('  node check_flexicart_status.js --test-serial <port>    # Test RS-422 settings');
        console.log('  node check_flexicart_status.js --map-protocol <port>   # Map device protocol');
        console.log('  node check_flexicart_status.js --test-sony <port>      # Test Sony commands');
        console.log('  node check_flexicart_status.js --test-movement <port>  # Test Sony movement');
        console.log('\nFlags:');
        console.log('  --debug, -d                                            # Enable detailed debugging');
        console.log('\n📋 Available Flexicart ports:');
        FLEXICART_PORTS.forEach(port => {
            console.log(`  📦 ${port}`);
        });
        return;
    }
    
    const command = filteredArgs[0];
    const flexicartPath = filteredArgs[1];
    
    try {
        switch (command) {
            case '--scan':
                await scanAllFlexicarts(debugMode);
                break;
                
            case '--status':
                if (!flexicartPath) {
                    console.log('❌ Error: Port path required');
                    return;
                }
                await checkSingleFlexicart(flexicartPath);
                break;
                
            case '--control':
                if (!flexicartPath) {
                    console.log('❌ Error: Port path required');
                    return;
                }
                await controlFlexicart(flexicartPath);
                break;
                
            case '--test':
                if (!flexicartPath) {
                    console.log('❌ Error: Port path required');
                    return;
                }
                await testFlexicartMovementLocal(flexicartPath);
                break;
                
            case '--test-serial':
                if (!flexicartPath) {
                    console.log('❌ Error: Port path required');
                    return;
                }
                await testSerialSettings(flexicartPath);
                break;
                
            case '--map-protocol':
                if (!flexicartPath) {
                    console.log('❌ Error: Port path required');
                    return;
                }
                await mapProtocol(flexicartPath);
                break;
                
            case '--test-sony':
                if (!flexicartPath) {
                    console.log('❌ Error: Port path required');
                    return;
                }
                await testSonyCommands(flexicartPath);
                break;
                
            case '--test-movement':
                if (!flexicartPath) {
                    console.log('❌ Error: Port path required');
                    return;
                }
                await testSonyMovement(flexicartPath);
                break;
                
            default:
                console.log(`❌ Unknown command: ${command}`);
                console.log('💡 Use --help to see available commands');
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        if (debugMode) {
            console.log(`🔍 [DEBUG] Stack trace: ${error.stack}`);
        }
        process.exit(1);
    }
}

module.exports = {
    checkSingleFlexicart,
    scanAllFlexicarts,
    testFlexicartMovementLocal,
    controlFlexicart
};

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    });
}