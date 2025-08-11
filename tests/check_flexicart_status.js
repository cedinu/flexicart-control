const { SerialPort } = require('serialport');
const readline = require('readline');

// Import Flexicart-specific functions
const {
    autoScanFlexicarts,
    getFlexicartStatus,
    sendFlexicartCommand,  // ✅ Import this from the module
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
    // Import parsing functions and constants too
    parseFlexicartStatus,
    parseFlexicartPosition,
    parseFlexicartInventory,
    FLEXICART_COMMANDS,
    FlexicartError
} = require('../src/commands/flexicart_interface');

// Flexicart-specific port configuration
const FLEXICART_PORTS = Array.from({ length: 8 }, (_, i) => `/dev/ttyRP${i + 16}`);

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
 * @returns {Promise<Array>} Array of found Flexicarts
 */
async function scanAllFlexicarts() {
    console.log('🔍 Scanning for Flexicarts on all ports...');
    
    try {
        // Use the imported auto-scan function
        const results = await autoScanFlexicarts(FLEXICART_PORTS);
        
        if (results.length === 0) {
            console.log('❌ No Flexicarts found');
        } else {
            console.log(`\n✅ Found ${results.length} Flexicart(s):`);
            results.forEach(fc => {
                console.log(`   📦 ${fc.port} - Status: ${fc.status.statusText}`);
            });
        }
        
        return results;
    } catch (error) {
        console.log(`❌ Scan failed: ${error.message}`);
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
 * Interactive Flexicart control
 * @param {string} path - Flexicart port path
 */
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
    
    if (args.length === 0) {
        console.log('\nUsage:');
        console.log('  node check_flexicart_status.js --scan              # Scan for Flexicarts');
        console.log('  node check_flexicart_status.js --status <port>     # Check status');
        console.log('  node check_flexicart_status.js --control <port>    # Interactive control');
        console.log('  node check_flexicart_status.js --test <port>       # Test movement');
        console.log('\n📋 Available Flexicart ports:');
        FLEXICART_PORTS.forEach(port => {
            console.log(`  📦 ${port}`);
        });
        return;
    }
    
    const command = args[0];
    const flexicartPath = args[1];
    
    try {
        switch (command) {
            case '--scan':
                await scanAllFlexicarts();
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
                
            default:
                console.log(`❌ Unknown command: ${command}`);
                console.log('💡 Use --help to see available commands');
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
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