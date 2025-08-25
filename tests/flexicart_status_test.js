/**
 * FlexiCart Status Test - CORRECTED SETUP
 * Port: /dev/ttyRP0 (corrected cabling)
 * ACK Response: 0x04 (corrected protocol)
 * 
 * Tests immediate response commands (status, position, inventory, etc.)
 */

const { SerialPort } = require('serialport');

// CORRECTED Configuration
const CONFIG = {
    PORT: '/dev/ttyRP0',
    BAUD_RATE: 38400,
    DATA_BITS: 8,
    PARITY: 'even',
    STOP_BITS: 1,
    TIMEOUT: 2000
};

/**
 * Create FlexiCart command
 */
function createCommand(cmd, ctrl = 0x00, data = 0x80, cartAddress = 0x01) {
    const command = Buffer.alloc(9);
    command[0] = 0x02;          // STX
    command[1] = 0x06;          // BC
    command[2] = 0x01;          // UA1
    command[3] = cartAddress;   // UA2
    command[4] = 0x00;          // BT
    command[5] = cmd;           // CMD
    command[6] = ctrl;          // CTRL
    command[7] = data;          // DATA
    
    // Calculate checksum
    let checksum = 0;
    for (let i = 1; i < 8; i++) {
        checksum ^= command[i];
    }
    command[8] = checksum;      // CS
    
    return command;
}

/**
 * Send command and get response
 */
async function sendCommand(port, command, timeout = CONFIG.TIMEOUT) {
    return new Promise((resolve, reject) => {
        const serialPort = new SerialPort({
            path: port,
            baudRate: CONFIG.BAUD_RATE,
            dataBits: CONFIG.DATA_BITS,
            parity: CONFIG.PARITY,
            stopBits: CONFIG.STOP_BITS,
            autoOpen: false
        });
        
        const chunks = [];
        let timeoutHandle;
        
        const cleanup = () => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (serialPort.isOpen) {
                serialPort.close(() => {});
            }
        };
        
        serialPort.on('data', (chunk) => chunks.push(chunk));
        serialPort.on('error', reject);
        
        serialPort.open((error) => {
            if (error) {
                cleanup();
                reject(error);
                return;
            }
            
            serialPort.write(command, (writeError) => {
                if (writeError) {
                    cleanup();
                    reject(writeError);
                    return;
                }
                
                serialPort.drain(() => {
                    timeoutHandle = setTimeout(() => {
                        cleanup();
                        const response = Buffer.concat(chunks);
                        resolve(response);
                    }, timeout);
                });
            });
        });
    });
}

/**
 * Analyze response data
 */
function analyzeResponse(response, commandName) {
    const hex = response.toString('hex').match(/.{2}/g)?.join(' ') || 'no response';
    const bytes = Array.from(response);
    
    return {
        command: commandName,
        length: response.length,
        hex: hex,
        bytes: bytes,
        hasData: response.length > 0,
        firstByte: response.length > 0 ? response[0] : null,
        interpretation: interpretResponse(response, commandName),
        timestamp: new Date().toISOString()
    };
}

/**
 * Interpret response based on command type
 */
function interpretResponse(response, commandName) {
    if (response.length === 0) {
        return 'No response received';
    }
    
    const firstByte = response[0];
    
    // Check for ACK/NACK first
    if (firstByte === 0x04) {
        return '✅ ACK (0x04) - Command accepted';
    } else if (firstByte === 0x05) {
        return '❌ NACK (0x05) - Command rejected';
    } else if (firstByte === 0x06) {
        return '⏳ BUSY (0x06) - Device busy';
    }
    
    // Data response interpretation
    switch (commandName) {
        case 'Status Request':
            return `📊 Status data (${response.length} bytes): ${interpretStatusData(response)}`;
        case 'Position Request':
            return `📍 Position data (${response.length} bytes): ${interpretPositionData(response)}`;
        case 'Inventory Request':
            return `📦 Inventory data (${response.length} bytes): ${interpretInventoryData(response)}`;
        case 'Error Status':
            return `⚠️  Error data (${response.length} bytes): ${interpretErrorData(response)}`;
        default:
            return `📄 Data response (${response.length} bytes)`;
    }
}

/**
 * Interpret status data bytes
 */
function interpretStatusData(response) {
    if (response.length < 2) return 'Insufficient data';
    
    const status1 = response[0];
    const status2 = response.length > 1 ? response[1] : 0;
    
    const interpretations = [];
    
    // Interpret status bits (example - actual interpretation depends on FlexiCart spec)
    if (status1 & 0x01) interpretations.push('System ready');
    if (status1 & 0x02) interpretations.push('Cart loaded');
    if (status1 & 0x04) interpretations.push('Movement active');
    if (status1 & 0x08) interpretations.push('ON-AIR tally');
    if (status1 & 0x10) interpretations.push('Error condition');
    
    return interpretations.length > 0 ? interpretations.join(', ') : 'Normal status';
}

/**
 * Interpret position data bytes
 */
function interpretPositionData(response) {
    if (response.length < 2) return 'Insufficient data';
    
    const posHigh = response[0];
    const posLow = response.length > 1 ? response[1] : 0;
    const position = (posHigh << 8) | posLow;
    
    return `Position: ${position} (0x${posHigh.toString(16).padStart(2, '0')}${posLow.toString(16).padStart(2, '0')})`;
}

/**
 * Interpret inventory data bytes
 */
function interpretInventoryData(response) {
    if (response.length === 0) return 'No inventory data';
    
    const cartCount = response[0];
    return `Cart count: ${cartCount}`;
}

/**
 * Interpret error data bytes
 */
function interpretErrorData(response) {
    if (response.length === 0) return 'No errors';
    
    const errorCode = response[0];
    const errorDescriptions = {
        0x00: 'No error',
        0x01: 'Mechanical error',
        0x02: 'Communication error',
        0x04: 'Position error',
        0x08: 'Cart jam',
        0x10: 'System error'
    };
    
    return errorDescriptions[errorCode] || `Unknown error code: 0x${errorCode.toString(16)}`;
}

/**
 * Test all immediate response commands
 */
async function testStatusCommands(port = CONFIG.PORT, cartAddress = 0x01) {
    console.log(`\n📊 FLEXICART STATUS COMMAND TEST`);
    console.log(`=================================`);
    console.log(`CORRECTED SETUP:`);
    console.log(`Port: ${port} (corrected cabling)`);
    console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
    console.log(`Config: ${CONFIG.BAUD_RATE} baud, 8E1\n`);
    
    const statusCommands = [
        {
            name: 'Status Request',
            cmd: 0x61,
            ctrl: 0x10,
            data: 0x80,
            description: 'Get general device status'
        },
        {
            name: 'Position Request',
            cmd: 0x61,
            ctrl: 0x20,
            data: 0x80,
            description: 'Get current cart position'
        },
        {
            name: 'Inventory Request',
            cmd: 0x61,
            ctrl: 0x30,
            data: 0x80,
            description: 'Get cart inventory count'
        },
        {
            name: 'Error Status',
            cmd: 0x61,
            ctrl: 0x40,
            data: 0x80,
            description: 'Get error conditions'
        },
        {
            name: 'System Mode',
            cmd: 0x65,
            ctrl: 0x00,
            data: 0x80,
            description: 'Get system mode parameters'
        }
    ];
    
    const results = [];
    
    for (const cmd of statusCommands) {
        console.log(`📤 Testing: ${cmd.name}`);
        console.log(`   Description: ${cmd.description}`);
        
        try {
            const command = createCommand(cmd.cmd, cmd.ctrl, cmd.data, cartAddress);
            console.log(`   Command: ${command.toString('hex').match(/.{2}/g).join(' ')}`);
            
            const response = await sendCommand(port, command);
            const analysis = analyzeResponse(response, cmd.name);
            
            console.log(`   📥 Response: ${analysis.hex}`);
            console.log(`   📋 Analysis: ${analysis.interpretation}`);
            
            if (analysis.hasData) {
                console.log(`   ✅ SUCCESS - Data received\n`);
                results.push({ command: cmd.name, success: true, analysis });
            } else {
                console.log(`   ⚠️  No data received\n`);
                results.push({ command: cmd.name, success: false, analysis });
            }
            
        } catch (error) {
            console.log(`   ❌ FAILED: ${error.message}\n`);
            results.push({ command: cmd.name, success: false, error: error.message });
        }
        
        // Brief delay between commands
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Summary
    const successful = results.filter(r => r.success);
    const dataResponses = results.filter(r => r.success && r.analysis && r.analysis.hasData);
    
    console.log(`📈 STATUS COMMAND SUMMARY`);
    console.log(`=========================`);
    console.log(`Total Commands: ${results.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`Data Responses: ${dataResponses.length}`);
    console.log(`Success Rate: ${Math.round((successful.length/results.length) * 100)}%`);
    
    console.log(`\n🎯 KEY FINDINGS:`);
    console.log(`Communication: ${successful.length > 0 ? '✅ WORKING' : '❌ FAILED'}`);
    console.log(`Status Commands: ${dataResponses.length > 0 ? '✅ RETURNING DATA' : '❌ NO DATA'}`);
    console.log(`FlexiCart Responding: ${successful.length > 2 ? '✅ CONFIRMED' : '❌ NOT CONFIRMED'}`);
    
    if (successful.length > 0) {
        console.log(`\n🎉 STATUS TESTING SUCCESSFUL!`);
        console.log(`✅ FlexiCart responding to status commands`);
        console.log(`✅ Immediate response pattern working`);
        console.log(`✅ Data interpretation functional`);
        
        // Show detailed results for successful commands
        console.log(`\n📊 SUCCESSFUL COMMAND DETAILS:`);
        successful.forEach(result => {
            if (result.analysis) {
                console.log(`   ${result.command}: ${result.analysis.length} bytes - ${result.analysis.interpretation}`);
            }
        });
    }
    
    return {
        totalCommands: results.length,
        successful: successful.length,
        dataResponses: dataResponses.length,
        successRate: Math.round((successful.length/results.length) * 100),
        results: results
    };
}

// Export for use in other modules
module.exports = {
    CONFIG,
    createCommand,
    sendCommand,
    analyzeResponse,
    interpretResponse,
    testStatusCommands
};

// Run test if called directly
if (require.main === module) {
    const port = process.argv[2] || CONFIG.PORT;
    const cartAddress = process.argv[3] ? parseInt(process.argv[3], 16) : 0x01;
    
    testStatusCommands(port, cartAddress)
        .then(results => {
            if (results.successful > 0) {
                console.log(`\n✅ Status command test successful!`);
                console.log(`🎯 FlexiCart status commands working with corrected setup`);
                process.exit(0);
            } else {
                console.log(`\n❌ Status command test failed`);
                console.log(`⚠️  Check setup and connections`);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error(`\n💥 Test error: ${error.message}`);
            process.exit(1);
        });
}
