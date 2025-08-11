const { SerialPort } = require('serialport');
const readline = require('readline');

// filepath: tests/check_flexicart_status.js


// Import Flexicart-specific functions (these would need to be implemented)
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
    clearFlexicartErrors
} = require('../src/commands/flexicart_interface');

// Flexicart-specific constants
const FLEXICART_PORTS = Array.from({ length: 8 }, (_, i) => `/dev/ttyRP${i + 16}`);
const FLEXICART_COMMANDS = {
    STATUS: Buffer.from([0x02, 0x53, 0x03]), // STX S ETX
    POSITION: Buffer.from([0x02, 0x50, 0x03]), // STX P ETX
    INVENTORY: Buffer.from([0x02, 0x49, 0x03]), // STX I ETX
    MOVE_HOME: Buffer.from([0x02, 0x48, 0x03]), // STX H ETX
    STOP: Buffer.from([0x02, 0x53, 0x54, 0x03]), // STX ST ETX
    ERROR_STATUS: Buffer.from([0x02, 0x45, 0x03]) // STX E ETX
};

class FlexicartError extends Error {
    constructor(message, code, path) {
        super(message);
        this.name = 'FlexicartError';
        this.code = code;
        this.path = path;
    }
}

/**
 * Send command to Flexicart with error handling
 * @param {string} path - Flexicart port path
 * @param {Buffer} command - Command buffer
 * @param {string} commandName - Command name for logging
 * @param {number} timeout - Response timeout in ms
 * @returns {Promise<Object>} Command result
 */
async function sendFlexicartCommand(path, command, commandName, timeout = 3000) {
    console.log(`📤 Sending ${commandName} to ${path}...`);
    
    try {
        const response = await sendCommand(path, command, timeout);
        
        if (!response || response.length === 0) {
            throw new FlexicartError(`No response received for ${commandName}`, 'NO_RESPONSE', path);
        }
        
        console.log(`✅ ${commandName} successful`);
        console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
        
        return {
            success: true,
            response,
            responseHex: response.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        const flexError = error instanceof FlexicartError ? error : 
            new FlexicartError(`${commandName} failed: ${error.message}`, 'COMMAND_FAILED', path);
        
        console.log(`❌ ${flexError.message}`);
        return {
            success: false,
            error: flexError,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Check status of a single Flexicart unit
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Status information
 */
async function checkSingleFlexicart(path) {
    console.log(`\n🔍 Checking Flexicart at ${path}...`);
    
    try {
        // Get basic status
        const statusResult = await sendFlexicartCommand(path, FLEXICART_COMMANDS.STATUS, 'STATUS');
        
        if (!statusResult.success) {
            console.log(`❌ Flexicart not responding at ${path}`);
            return null;
        }
        
        // Parse status response
        const status = parseFlexicartStatus(statusResult.response);
        
        // Get position information
        const positionResult = await sendFlexicartCommand(path, FLEXICART_COMMANDS.POSITION, 'POSITION');
        const position = positionResult.success ? parseFlexicartPosition(positionResult.response) : null;
        
        // Get inventory
        const inventoryResult = await sendFlexicartCommand(path, FLEXICART_COMMANDS.INVENTORY, 'INVENTORY');
        const inventory = inventoryResult.success ? parseFlexicartInventory(inventoryResult.response) : null;
        
        console.log(`✅ Flexicart Found!`);
        console.log(`   🏠 Status: ${status.status}`);
        console.log(`   📍 Position: ${position ? position.current : 'Unknown'}`);
        console.log(`   📦 Cartridges: ${inventory ? inventory.total : 'Unknown'}`);
        console.log(`   ⚡ Ready: ${status.ready ? 'YES' : 'NO'}`);
        console.log(`   🚨 Errors: ${status.errorCount || 0}`);
        
        return {
            path,
            status,
            position,
            inventory,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ Failed to check Flexicart: ${error.message}`);
        return null;
    }
}

/**
 * Parse Flexicart status response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed status
 */
function parseFlexicartStatus(response) {
    // This would parse the actual Flexicart status protocol
    // Placeholder implementation
    const hex = response.toString('hex');
    
    return {
        status: 'READY',
        ready: true,
        moving: false,
        errorCount: 0,
        raw: hex
    };
}

/**
 * Parse Flexicart position response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed position
 */
function parseFlexicartPosition(response) {
    // This would parse the actual position data
    return {
        current: 1,
        target: 1,
        moving: false
    };
}

/**
 * Parse Flexicart inventory response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed inventory
 */
function parseFlexicartInventory(response) {
    // This would parse the actual inventory data
    return {
        total: 0,
        occupied: [],
        empty: []
    };
}

/**
 * Test Flexicart movement capabilities
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Movement test results
 */
async function testFlexicartMovement(path) {
    console.log(`\n🏃 Testing Flexicart movement at ${path}...`);
    
    const results = {
        homeTest: false,
        positionTest: false,
        stopTest: false,
        errors: []
    };
    
    try {
        // Test home command
        console.log('🏠 Testing HOME command...');
        const homeResult = await sendFlexicartCommand(path, FLEXICART_COMMANDS.MOVE_HOME, 'MOVE_HOME');
        results.homeTest = homeResult.success;
        
        // Wait for movement to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Test position movement (move to position 2 and back)
        console.log('📍 Testing position movement...');
        const moveResult = await moveFlexicartToPosition(path, 2);
        results.positionTest = moveResult && moveResult.success;
        
        // Test stop command
        console.log('🛑 Testing STOP command...');
        const stopResult = await sendFlexicartCommand(path, FLEXICART_COMMANDS.STOP, 'STOP');
        results.stopTest = stopResult.success;
        
        console.log('\n📊 Movement Test Results:');
        console.log(`   🏠 Home: ${results.homeTest ? '✅' : '❌'}`);
        console.log(`   📍 Position: ${results.positionTest ? '✅' : '❌'}`);
        console.log(`   🛑 Stop: ${results.stopTest ? '✅' : '❌'}`);
        
    } catch (error) {
        results.errors.push(error.message);
        console.log(`❌ Movement test error: ${error.message}`);
    }
    
    return results;
}

/**
 * Scan all Flexicart ports for devices
 * @returns {Promise<Array>} Array of found Flexicarts
 */
async function scanAllFlexicarts() {
    console.log('🔍 Scanning for Flexicarts on all ports...');
    
    const results = [];
    
    for (const path of FLEXICART_PORTS) {
        try {
            const flexicart = await checkSingleFlexicart(path);
            if (flexicart) {
                results.push(flexicart);
            }
        } catch (error) {
            // Port not accessible or no device
        }
    }
    
    if (results.length === 0) {
        console.log('❌ No Flexicarts found');
    } else {
        console.log(`\n✅ Found ${results.length} Flexicart(s):`);
        results.forEach(fc => {
            console.log(`   📦 ${fc.path} - Status: ${fc.status.status}`);
        });
    }
    
    return results;
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
                    await sendFlexicartCommand(path, FLEXICART_COMMANDS.MOVE_HOME, 'MOVE_HOME');
                    break;
                    
                case 'move':
                    const position = parseInt(args[0]);
                    if (isNaN(position)) {
                        console.log('❌ Usage: move <position_number>');
                    } else {
                        await moveFlexicartToPosition(path, position);
                    }
                    break;
                    
                case 'stop':
                    await sendFlexicartCommand(path, FLEXICART_COMMANDS.STOP, 'STOP');
                    break;
                    
                case 'inventory':
                    await sendFlexicartCommand(path, FLEXICART_COMMANDS.INVENTORY, 'INVENTORY');
                    break;
                    
                case 'test-movement':
                    await testFlexicartMovement(path);
                    break;
                    
                case 'errors':
                    await sendFlexicartCommand(path, FLEXICART_COMMANDS.ERROR_STATUS, 'ERROR_STATUS');
                    break;
                    
                case 'help':
                    console.log('\n📋 Available Commands:');
                    console.log('  status         - Check Flexicart status');
                    console.log('  home           - Move to home position');
                    console.log('  move <pos>     - Move to specific position');
                    console.log('  stop           - Emergency stop');
                    console.log('  inventory      - Get cartridge inventory');
                    console.log('  test-movement  - Test movement capabilities');
                    console.log('  errors         - Check error status');
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

// Helper function to move to specific position
async function moveFlexicartToPosition(path, position) {
    const moveCommand = Buffer.from([0x02, 0x4D, position, 0x03]); // STX M <pos> ETX
    return await sendFlexicartCommand(path, moveCommand, `MOVE_TO_${position}`);
}

module.exports = {
    checkSingleFlexicart,
    scanAllFlexicarts,
    testFlexicartMovement,
    controlFlexicart,
    sendFlexicartCommand,
    parseFlexicartStatus,
    parseFlexicartPosition,
    parseFlexicartInventory,
    moveFlexicartToPosition,
    FlexicartError,
    FLEXICART_PORTS,
    FLEXICART_COMMANDS
};

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
                await testFlexicartMovement(flexicartPath);
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

if (require.main === module) {
    main().catch(error => {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    });
}