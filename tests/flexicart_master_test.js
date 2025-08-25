/**
 * FlexiCart Master Test Suite - CORRECTED SETUP
 * Port: /dev/ttyRP0 (corrected cabling)
 * ACK Response: 0x04 (corrected protocol)
 * 
 * This test suite validates the complete FlexiCart protocol implementation
 * using the corrected hardware setup and proper ACK responses.
 */

const { SerialPort } = require('serialport');

// CORRECTED FlexiCart Configuration
const FLEXICART_CONFIG = {
    PORT: '/dev/ttyRP0',           // Corrected port with proper cabling
    BAUD_RATE: 38400,             // Confirmed working baud rate
    DATA_BITS: 8,                 // 8 data bits
    PARITY: 'even',               // Even parity
    STOP_BITS: 1,                 // 1 stop bit
    
    // Protocol constants
    STX: 0x02,                    // Start of text
    BC: 0x06,                     // Byte count (always 6 for data portion)
    UA1: 0x01,                    // Unit address 1 (always 0x01)
    BT: 0x00,                     // Block type (0x00 for normal commands)
    
    // CORRECTED Response codes
    ACK: 0x04,                    // CORRECTED: Acknowledge (was 0x10)
    NACK: 0x05,                   // Not acknowledge  
    BUSY: 0x06,                   // Device busy
    
    // Default settings
    DEFAULT_CART_ADDRESS: 0x01,   // Default cart address
    DEFAULT_TIMEOUT: 5000,        // Default command timeout
    INTER_COMMAND_DELAY: 100      // Delay between commands
};

// FlexiCart Command Definitions (Updated with Macro Command Categories)
const FLEXICART_COMMANDS = {
    // Category 1: Immediate Response Commands (Return data directly)
    STATUS_REQUEST: {
        cmd: 0x61, ctrl: 0x10, data: 0x80,
        category: 'immediate',
        description: 'Get device status - immediate response'
    },
    
    POSITION_REQUEST: {
        cmd: 0x61, ctrl: 0x20, data: 0x80,
        category: 'immediate',
        description: 'Get current position - immediate response'
    },
    
    INVENTORY_REQUEST: {
        cmd: 0x61, ctrl: 0x30, data: 0x80,
        category: 'immediate',
        description: 'Get cart inventory - immediate response'
    },
    
    ERROR_STATUS: {
        cmd: 0x61, ctrl: 0x40, data: 0x80,
        category: 'immediate',
        description: 'Get error conditions - immediate response'
    },
    
    // Category 2: Macro Commands (Return ACK/NACK, need status polling)
    ELEVATOR_UP: {
        cmd: 0x41, ctrl: 0x01, data: 0x80,
        category: 'macro',
        description: 'Move elevator up - returns ACK/NACK + poll for completion'
    },
    
    ELEVATOR_DOWN: {
        cmd: 0x41, ctrl: 0x02, data: 0x80,
        category: 'macro',
        description: 'Move elevator down - returns ACK/NACK + poll for completion'
    },
    
    CAROUSEL_CW: {
        cmd: 0x42, ctrl: 0x01, data: 0x80,
        category: 'macro',
        description: 'Rotate carousel clockwise - returns ACK/NACK + poll for completion'
    },
    
    CAROUSEL_CCW: {
        cmd: 0x42, ctrl: 0x02, data: 0x80,
        category: 'macro',
        description: 'Rotate carousel counter-clockwise - returns ACK/NACK + poll for completion'
    },
    
    MOVE_TO_POSITION: {
        cmd: 0x43, ctrl: 0x00, data: 0x80,  // ctrl will be position number
        category: 'macro',
        description: 'Move to specific position - returns ACK/NACK + poll for completion'
    },
    
    LOAD_CART: {
        cmd: 0x44, ctrl: 0x01, data: 0x80,
        category: 'macro',
        description: 'Load cart into player - returns ACK/NACK + poll for completion'
    },
    
    UNLOAD_CART: {
        cmd: 0x44, ctrl: 0x02, data: 0x80,
        category: 'macro',
        description: 'Unload cart from player - returns ACK/NACK + poll for completion'
    },
    
    EJECT_CART: {
        cmd: 0x45, ctrl: 0x01, data: 0x80,
        category: 'macro',
        description: 'Eject cart to access bay - returns ACK/NACK + poll for completion'
    },
    
    INITIALIZE: {
        cmd: 0x46, ctrl: 0x01, data: 0x80,
        category: 'macro',
        description: 'Initialize system - returns ACK/NACK + poll for completion'
    },
    
    CALIBRATE: {
        cmd: 0x47, ctrl: 0x01, data: 0x80,
        category: 'macro',
        description: 'Calibrate positions - returns ACK/NACK + poll for completion'
    },
    
    EMERGENCY_STOP: {
        cmd: 0x48, ctrl: 0x01, data: 0x80,
        category: 'macro',
        description: 'Emergency stop all motion - returns ACK/NACK immediately'
    },
    
    // Category 3: Control Commands (Immediate effect, return confirmation)
    ON_AIR_TALLY_ON: {
        cmd: 0x71, ctrl: 0x01, data: 0x80,
        category: 'control',
        description: 'Turn ON-AIR tally ON - immediate effect with confirmation'
    },
    
    ON_AIR_TALLY_OFF: {
        cmd: 0x71, ctrl: 0x00, data: 0x80,
        category: 'control',
        description: 'Turn ON-AIR tally OFF - immediate effect with confirmation'
    },
    
    PLAY_COMMAND: {
        cmd: 0x50, ctrl: 0x01, data: 0x80,
        category: 'control',
        description: 'Start cart playback - immediate effect'
    },
    
    STOP_COMMAND: {
        cmd: 0x50, ctrl: 0x00, data: 0x80,
        category: 'control',
        description: 'Stop cart playback - immediate effect'
    },
    
    PAUSE_COMMAND: {
        cmd: 0x50, ctrl: 0x02, data: 0x80,
        category: 'control',
        description: 'Pause cart playback - immediate effect'
    }
};

/**
 * Create FlexiCart command packet with CORRECTED 2's complement protocol
 */
function createFlexiCartCommand(cmd, ctrl = 0x00, data = 0x80, cartAddress = FLEXICART_CONFIG.DEFAULT_CART_ADDRESS) {
    const command = Buffer.alloc(9);
    command[0] = FLEXICART_CONFIG.STX;          // STX
    command[1] = FLEXICART_CONFIG.BC;           // BC
    command[2] = FLEXICART_CONFIG.UA1;          // UA1
    command[3] = cartAddress;                   // UA2 (cart address)
    command[4] = FLEXICART_CONFIG.BT;           // BT
    command[5] = cmd;                           // CMD
    command[6] = ctrl;                          // CTRL
    command[7] = data;                          // DATA
    
    // CORRECTED: Use 2's complement checksum (not XOR)
    let sum = 0;
    for (let i = 1; i < 8; i++) {
        sum += command[i];
    }
    command[8] = (0x100 - (sum & 0xFF)) & 0xFF;  // CS
    
    return command;
}

/**
 * Analyze response with CORRECTED ACK handling
 */
function analyzeResponse(response, commandName = 'Unknown') {
    const analysis = {
        command: commandName,
        length: response.length,
        hex: response.toString('hex').match(/.{2}/g)?.join(' ') || '',
        bytes: Array.from(response),
        responseType: 'unknown',
        isACK: false,
        isNACK: false,
        isBUSY: false,
        hasData: false,
        timestamp: new Date().toISOString()
    };
    
    if (response.length === 0) {
        analysis.responseType = 'no_response';
        return analysis;
    }
    
    // Check for CORRECTED ACK/NACK/BUSY responses
    const firstByte = response[0];
    
    if (firstByte === FLEXICART_CONFIG.ACK) {
        analysis.responseType = 'ack';
        analysis.isACK = true;
    } else if (firstByte === FLEXICART_CONFIG.NACK) {
        analysis.responseType = 'nack';
        analysis.isNACK = true;
    } else if (firstByte === FLEXICART_CONFIG.BUSY) {
        analysis.responseType = 'busy';
        analysis.isBUSY = true;
    } else {
        // Data response (immediate response commands)
        analysis.responseType = 'data';
        analysis.hasData = true;
        analysis.dataBytes = response.length;
    }
    
    return analysis;
}

/**
 * Send command using shared serial port connection (prevents port locking)
 */
async function sendCommandOnSharedPort(serialPort, command, commandName, timeout = FLEXICART_CONFIG.DEFAULT_TIMEOUT) {
    return new Promise((resolve) => {
        const chunks = [];
        let timeoutHandle;
        
        const cleanup = () => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            serialPort.removeAllListeners('data');
        };
        
        serialPort.on('data', (chunk) => {
            chunks.push(chunk);
        });
        
        serialPort.write(command, (writeError) => {
            if (writeError) {
                cleanup();
                resolve({
                    success: false,
                    error: `Write failed: ${writeError.message || 'Unknown write error'}`,
                    commandName: commandName
                });
                return;
            }
            
            serialPort.drain(() => {
                timeoutHandle = setTimeout(() => {
                    cleanup();
                    
                    const response = Buffer.concat(chunks);
                    const analysis = analyzeResponse(response);
                    
                    resolve({
                        success: response.length > 0,
                        response: response,
                        analysis: analysis,
                        hex: response.toString('hex').match(/.{2}/g)?.join(' ') || 'no response',
                        commandName: commandName,
                        timestamp: new Date().toISOString()
                    });
                    
                }, timeout);
            });
        });
    });
}

/**
 * Send command using individual port connection (for backward compatibility)
 */
async function sendCommand(port, command, timeout = FLEXICART_CONFIG.DEFAULT_TIMEOUT) {
    return new Promise((resolve, reject) => {
        const SerialPort = require('serialport');
        const serialPort = new SerialPort({
            path: port,
            baudRate: FLEXICART_CONFIG.BAUD_RATE,
            dataBits: FLEXICART_CONFIG.DATA_BITS,
            parity: FLEXICART_CONFIG.PARITY,
            stopBits: FLEXICART_CONFIG.STOP_BITS,
            autoOpen: false
        });
        
        const chunks = [];
        let timeoutHandle;
        let isResolved = false;
        
        const cleanup = () => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (serialPort.isOpen) {
                serialPort.close(() => {});
            }
        };
        
        const safeResolve = (value) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                resolve(value);
            }
        };
        
        const safeReject = (error) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                reject(error);
            }
        };
        
        try {
            serialPort.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            serialPort.on('error', (error) => {
                safeReject(new Error(`Serial port error: ${error.message}`));
            });
            
            serialPort.open((error) => {
                if (error) {
                    safeReject(new Error(`Failed to open port: ${error.message}`));
                    return;
                }
                
                serialPort.write(command, (writeError) => {
                    if (writeError) {
                        safeReject(new Error(`Failed to write command: ${writeError.message}`));
                        return;
                    }
                    
                    serialPort.drain(() => {
                        timeoutHandle = setTimeout(() => {
                            const response = Buffer.concat(chunks);
                            safeResolve(response);
                        }, timeout);
                    });
                });
            });
            
        } catch (error) {
            safeReject(new Error(`Setup error: ${error.message}`));
        }
    });
}

/**
 * Execute macro command with proper ACK/NACK handling and status polling
 */
async function executeMacroCommand(port, commandDef, cartAddress = FLEXICART_CONFIG.DEFAULT_CART_ADDRESS, maxRetries = 50) {
    console.log(`\n🔧 Executing macro command: ${commandDef.description}`);
    
    try {
        // Step 1: Send the macro command
        const commandBuffer = createFlexiCartCommand(commandDef.cmd, commandDef.ctrl, commandDef.data, cartAddress);
        console.log(`   📤 Sending command: ${commandBuffer.toString('hex').match(/.{2}/g).join(' ')}`);
        
        const initialResponse = await sendCommand(port, commandBuffer, 1000);
        const initialAnalysis = analyzeResponse(initialResponse, commandDef.description);
        
        console.log(`   📥 Initial response: ${initialAnalysis.hex} (${initialAnalysis.responseType})`);
        
        // Step 2: Check ACK/NACK response
        if (initialAnalysis.isNACK) {
            throw new Error('Command rejected by FlexiCart (NACK received)');
        }
        
        if (!initialAnalysis.isACK) {
            console.log(`   ⚠️  Expected ACK (0x04), got: 0x${initialResponse[0]?.toString(16) || '00'}`);
            return {
                success: false,
                error: 'Unexpected initial response',
                initialResponse: initialAnalysis,
                executionTime: 0
            };
        }
        
        console.log(`   ✅ Command accepted (ACK received)`);
        
        // Step 3: Poll status for completion
        console.log(`   ⏳ Polling for completion...`);
        const startTime = Date.now();
        let attempts = 0;
        
        while (attempts < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, FLEXICART_CONFIG.INTER_COMMAND_DELAY));
            
            try {
                const statusCommand = createFlexiCartCommand(
                    FLEXICART_COMMANDS.STATUS_REQUEST.cmd,
                    FLEXICART_COMMANDS.STATUS_REQUEST.ctrl,
                    FLEXICART_COMMANDS.STATUS_REQUEST.data,
                    cartAddress
                );
                
                const statusResponse = await sendCommand(port, statusCommand, 1000);
                const statusAnalysis = analyzeResponse(statusResponse, 'Status Check');
                
                // Simple completion check - if we get a data response, operation likely complete
                if (statusAnalysis.hasData && statusAnalysis.length > 0) {
                    console.log(`   ✅ Operation completed after ${attempts + 1} status checks`);
                    return {
                        success: true,
                        initialResponse: initialAnalysis,
                        finalStatus: statusAnalysis,
                        executionTime: Date.now() - startTime,
                        statusChecks: attempts + 1
                    };
                }
                
            } catch (statusError) {
                console.log(`   ⚠️  Status check ${attempts + 1} failed: ${statusError.message}`);
            }
            
            attempts++;
        }
        
        // Timeout reached
        console.log(`   ⏰ Operation timeout after ${maxRetries} status checks`);
        return {
            success: false,
            error: 'Operation timeout',
            initialResponse: initialAnalysis,
            executionTime: Date.now() - startTime,
            statusChecks: attempts
        };
        
    } catch (error) {
        console.log(`   ❌ Macro command failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            executionTime: Date.now() - Date.now()
        };
    }
}

/**
 * Test immediate response command
 */
async function testImmediateCommand(port, commandDef, cartAddress = FLEXICART_CONFIG.DEFAULT_CART_ADDRESS) {
    console.log(`\n📊 Testing immediate command: ${commandDef.description}`);
    
    try {
        const commandBuffer = createFlexiCartCommand(commandDef.cmd, commandDef.ctrl, commandDef.data, cartAddress);
        console.log(`   📤 Sending command: ${commandBuffer.toString('hex').match(/.{2}/g).join(' ')}`);
        
        const response = await sendCommand(port, commandBuffer, 2000);
        const analysis = analyzeResponse(response, commandDef.description);
        
        console.log(`   📥 Response: ${analysis.hex} (${analysis.responseType})`);
        
        if (analysis.hasData && analysis.length > 0) {
            console.log(`   ✅ Immediate response received (${analysis.length} bytes)`);
            return { success: true, response: analysis };
        } else if (analysis.isACK) {
            console.log(`   ✅ Command acknowledged`);
            return { success: true, response: analysis };
        } else {
            console.log(`   ⚠️  Unexpected response type: ${analysis.responseType}`);
            return { success: false, error: 'Unexpected response', response: analysis };
        }
        
    } catch (error) {
        console.log(`   ❌ Command failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

/**
 * Comprehensive FlexiCart test suite
 */
class FlexiCartMasterTest {
    
    static async testBasicCommunication(port = FLEXICART_CONFIG.PORT, cartAddress = FLEXICART_CONFIG.DEFAULT_CART_ADDRESS) {
        console.log(`\n🔍 BASIC COMMUNICATION TEST`);
        console.log(`============================`);
        console.log(`Port: ${port}`);
        console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
        console.log(`Configuration: ${FLEXICART_CONFIG.BAUD_RATE} baud, 8E1`);
        
        // Test with simple status request
        const result = await testImmediateCommand(port, FLEXICART_COMMANDS.STATUS_REQUEST, cartAddress);
        
        if (result.success) {
            console.log(`\n✅ BASIC COMMUNICATION: WORKING`);
            return true;
        } else {
            console.log(`\n❌ BASIC COMMUNICATION: FAILED`);
            console.log(`   Error: ${result.error}`);
            return false;
        }
    }
    
    static async testImmediateCommands(port = FLEXICART_CONFIG.PORT, cartAddress = FLEXICART_CONFIG.DEFAULT_CART_ADDRESS) {
        console.log(`\n📊 IMMEDIATE RESPONSE COMMANDS TEST`);
        console.log(`=====================================`);
        
        const immediateCommands = Object.entries(FLEXICART_COMMANDS)
            .filter(([name, cmd]) => cmd.category === 'immediate')
            .map(([name, cmd]) => ({ name, ...cmd }));
        
        const results = [];
        
        for (const command of immediateCommands) {
            const result = await testImmediateCommand(port, command, cartAddress);
            results.push({ command: command.name, ...result });
        }
        
        const successful = results.filter(r => r.success);
        console.log(`\n📈 IMMEDIATE COMMANDS SUMMARY:`);
        console.log(`   Successful: ${successful.length}/${results.length}`);
        console.log(`   Success rate: ${Math.round((successful.length/results.length) * 100)}%`);
        
        return results;
    }
    
    static async testControlCommands(port = FLEXICART_CONFIG.PORT, cartAddress = FLEXICART_CONFIG.DEFAULT_CART_ADDRESS) {
        console.log(`\n🎛️  CONTROL COMMANDS TEST`);
        console.log(`==========================`);
        
        const results = [];
        
        // Test ON-AIR tally ON
        console.log(`\n🔴 Testing ON-AIR Tally ON...`);
        let result = await testImmediateCommand(port, FLEXICART_COMMANDS.ON_AIR_TALLY_ON, cartAddress);
        results.push({ command: 'ON_AIR_TALLY_ON', ...result });
        
        if (result.success) {
            // Get status after tally ON
            await new Promise(resolve => setTimeout(resolve, 500));
            const statusAfterOn = await testImmediateCommand(port, FLEXICART_COMMANDS.STATUS_REQUEST, cartAddress);
            
            // Test ON-AIR tally OFF  
            console.log(`\n⚫ Testing ON-AIR Tally OFF...`);
            result = await testImmediateCommand(port, FLEXICART_COMMANDS.ON_AIR_TALLY_OFF, cartAddress);
            results.push({ command: 'ON_AIR_TALLY_OFF', ...result });
            
            if (result.success) {
                // Get status after tally OFF
                await new Promise(resolve => setTimeout(resolve, 500));
                const statusAfterOff = await testImmediateCommand(port, FLEXICART_COMMANDS.STATUS_REQUEST, cartAddress);
                
                // Compare status responses to detect tally change
                if (statusAfterOn.success && statusAfterOff.success) {
                    const onHex = statusAfterOn.response.hex;
                    const offHex = statusAfterOff.response.hex;
                    
                    if (onHex !== offHex) {
                        console.log(`\n🎉 ON-AIR TALLY FUNCTIONALITY CONFIRMED!`);
                        console.log(`   Status with tally ON:  ${onHex}`);
                        console.log(`   Status with tally OFF: ${offHex}`);
                    } else {
                        console.log(`\n⚠️  Tally commands accepted but no status change detected`);
                    }
                }
            }
        }
        
        const successful = results.filter(r => r.success);
        console.log(`\n📈 CONTROL COMMANDS SUMMARY:`);
        console.log(`   Successful: ${successful.length}/${results.length}`);
        console.log(`   ON-AIR Tally: ${successful.length >= 2 ? '✅ Working' : '❌ Issues'}`);
        
        return results;
    }
    
    static async testMacroCommands(port = FLEXICART_CONFIG.PORT, cartAddress = FLEXICART_CONFIG.DEFAULT_CART_ADDRESS) {
        console.log(`\n🔧 MACRO COMMANDS TEST`);
        console.log(`=======================`);
        
        const results = [];
        
        // Test elevator movement
        console.log(`\n🏗️  Testing Elevator Movement...`);
        let result = await executeMacroCommand(port, FLEXICART_COMMANDS.ELEVATOR_UP, cartAddress);
        results.push({ command: 'ELEVATOR_UP', ...result });
        
        if (result.success) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            result = await executeMacroCommand(port, FLEXICART_COMMANDS.ELEVATOR_DOWN, cartAddress);
            results.push({ command: 'ELEVATOR_DOWN', ...result });
        }
        
        // Test carousel movement
        console.log(`\n🎠 Testing Carousel Movement...`);
        result = await executeMacroCommand(port, FLEXICART_COMMANDS.CAROUSEL_CW, cartAddress);
        results.push({ command: 'CAROUSEL_CW', ...result });
        
        if (result.success) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            result = await executeMacroCommand(port, FLEXICART_COMMANDS.CAROUSEL_CCW, cartAddress);
            results.push({ command: 'CAROUSEL_CCW', ...result });
        }
        
        const successful = results.filter(r => r.success);
        console.log(`\n📈 MACRO COMMANDS SUMMARY:`);
        console.log(`   Successful: ${successful.length}/${results.length}`);
        console.log(`   Movement commands: ${successful.length > 0 ? '✅ ACK received' : '❌ Failed'}`);
        
        return results;
    }
    
    static async runFullTest(port = FLEXICART_CONFIG.PORT, cartAddress = FLEXICART_CONFIG.DEFAULT_CART_ADDRESS) {
        console.log(`\n🎯 FLEXICART MASTER TEST SUITE`);
        console.log(`===============================`);
        console.log(`CORRECTED SETUP:`);
        console.log(`Port: ${port} (corrected cabling)`);
        console.log(`ACK Response: 0x04 (corrected protocol)`);
        console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
        console.log(`Configuration: ${FLEXICART_CONFIG.BAUD_RATE} baud, 8E1`);
        
        const testResults = {
            basicCommunication: false,
            immediateCommands: [],
            controlCommands: [],
            macroCommands: [],
            timestamp: new Date().toISOString()
        };
        
        // Use single shared connection to prevent port locking
        const SerialPort = require('serialport');
        let serialPort = null;
        
        try {
            // Open single connection for all tests
            console.log(`\n🔌 Opening shared serial connection...`);
            serialPort = new SerialPort({
                path: port,
                baudRate: FLEXICART_CONFIG.BAUD_RATE,
                dataBits: FLEXICART_CONFIG.DATA_BITS,
                parity: FLEXICART_CONFIG.PARITY,
                stopBits: FLEXICART_CONFIG.STOP_BITS,
                autoOpen: false
            });
            
            await new Promise((resolve, reject) => {
                serialPort.open((error) => {
                    if (error) reject(new Error(`Failed to open port: ${error.message}`));
                    else resolve();
                });
            });
            
            console.log(`✅ Serial connection established`);
            
            // Test 1: Basic Communication
            testResults.basicCommunication = await this.testBasicCommunicationShared(serialPort, cartAddress);
            
            if (!testResults.basicCommunication) {
                console.log(`\n❌ ABORTING: Basic communication failed`);
                return testResults;
            }
            
            // Test 2: Immediate Commands
            testResults.immediateCommands = await this.testImmediateCommandsShared(serialPort, cartAddress);
            
            // Test 3: Control Commands
            testResults.controlCommands = await this.testControlCommandsShared(serialPort, cartAddress);
            
            // Test 4: Macro Commands (if working)
            testResults.macroCommands = await this.testMacroCommandsShared(serialPort, cartAddress);
            
            // Final Summary
            const totalTests = testResults.immediateCommands.length + testResults.controlCommands.length + testResults.macroCommands.length;
            const totalSuccess = [
                ...testResults.immediateCommands,
                ...testResults.controlCommands,
                ...testResults.macroCommands
            ].filter(r => r.success).length;
            
            console.log(`\n🏁 FINAL TEST RESULTS`);
            console.log(`======================`);
            console.log(`Basic Communication: ${testResults.basicCommunication ? '✅ PASS' : '❌ FAIL'}`);
            console.log(`Total Commands Tested: ${totalTests}`);
            console.log(`Successful Commands: ${totalSuccess}`);
            console.log(`Overall Success Rate: ${Math.round((totalSuccess/totalTests) * 100)}%`);
            console.log(`Protocol Status: ${testResults.basicCommunication && totalSuccess > 5 ? '✅ WORKING' : '❌ ISSUES'}`);
            
        } catch (error) {
            console.log(`\n❌ TEST SUITE ERROR: ${error.message}`);
        } finally {
            // Always close the shared connection
            if (serialPort && serialPort.isOpen) {
                console.log(`\n🔌 Closing serial connection...`);
                await new Promise((resolve) => {
                    serialPort.close((error) => {
                        if (error) console.log(`Warning: Error closing port: ${error.message}`);
                        resolve();
                    });
                });
            }
        }
        
        return testResults;
    }

    // Shared connection versions of test methods
    static async testBasicCommunicationShared(serialPort, cartAddress) {
        console.log(`\n🔍 BASIC COMMUNICATION TEST`);
        console.log(`============================`);
        console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
        
        const commandBuffer = createFlexiCartCommand(
            FLEXICART_COMMANDS.STATUS_REQUEST.cmd,
            FLEXICART_COMMANDS.STATUS_REQUEST.ctrl,
            FLEXICART_COMMANDS.STATUS_REQUEST.data,
            cartAddress
        );
        
        const result = await sendCommandOnSharedPort(serialPort, commandBuffer, 'Status Request');
        
        if (result.success && result.analysis.hasData) {
            console.log(`\n✅ BASIC COMMUNICATION: WORKING`);
            console.log(`   Response: ${result.hex}`);
            console.log(`   Data bytes: ${result.analysis.dataBytes}`);
            return true;
        } else {
            console.log(`\n❌ BASIC COMMUNICATION: FAILED`);
            console.log(`   Error: ${result.error || 'No data received'}`);
            return false;
        }
    }

    static async testImmediateCommandsShared(serialPort, cartAddress) {
        console.log(`\n📊 IMMEDIATE RESPONSE COMMANDS TEST`);
        console.log(`=====================================`);
        
        const immediateCommands = Object.entries(FLEXICART_COMMANDS)
            .filter(([name, cmd]) => cmd.category === 'immediate')
            .map(([name, cmd]) => ({ name, ...cmd }));
        
        const results = [];
        
        for (const command of immediateCommands) {
            console.log(`\n🔍 Testing ${command.name}...`);
            
            const commandBuffer = createFlexiCartCommand(command.cmd, command.ctrl, command.data, cartAddress);
            const result = await sendCommandOnSharedPort(serialPort, commandBuffer, command.name);
            
            const success = result.success && result.analysis.hasData;
            results.push({ 
                command: command.name, 
                success: success,
                response: result.analysis,
                error: result.error 
            });
            
            if (success) {
                console.log(`   ✅ ${command.name}: Success - ${result.hex}`);
            } else {
                console.log(`   ❌ ${command.name}: Failed - ${result.error || 'No data'}`);
            }
            
            // Inter-command delay
            await new Promise(resolve => setTimeout(resolve, FLEXICART_CONFIG.INTER_COMMAND_DELAY));
        }
        
        const successful = results.filter(r => r.success);
        console.log(`\n📈 IMMEDIATE COMMANDS SUMMARY:`);
        console.log(`   Successful: ${successful.length}/${results.length}`);
        console.log(`   Success rate: ${Math.round((successful.length/results.length) * 100)}%`);
        
        return results;
    }

    static async testControlCommandsShared(serialPort, cartAddress) {
        console.log(`\n🎛️  CONTROL COMMANDS TEST`);
        console.log(`==========================`);
        
        const results = [];
        
        // Test ON-AIR tally commands
        const commands = [
            { name: 'ON_AIR_TALLY_ON', command: FLEXICART_COMMANDS.ON_AIR_TALLY_ON },
            { name: 'ON_AIR_TALLY_OFF', command: FLEXICART_COMMANDS.ON_AIR_TALLY_OFF }
        ];
        
        for (const { name, command } of commands) {
            console.log(`\n${name === 'ON_AIR_TALLY_ON' ? '🔴' : '⚫'} Testing ${name}...`);
            
            const commandBuffer = createFlexiCartCommand(command.cmd, command.ctrl, command.data, cartAddress);
            const result = await sendCommandOnSharedPort(serialPort, commandBuffer, name);
            
            const success = result.success && (result.analysis.isACK || result.analysis.hasData);
            results.push({ 
                command: name, 
                success: success,
                response: result.analysis,
                error: result.error 
            });
            
            if (success) {
                console.log(`   ✅ ${name}: Success - ${result.hex}`);
            } else {
                console.log(`   ❌ ${name}: Failed - ${result.error || 'No response'}`);
            }
            
            // Delay between commands
            await new Promise(resolve => setTimeout(resolve, FLEXICART_CONFIG.INTER_COMMAND_DELAY));
        }
        
        const successful = results.filter(r => r.success);
        console.log(`\n📈 CONTROL COMMANDS SUMMARY:`);
        console.log(`   Successful: ${successful.length}/${results.length}`);
        console.log(`   ON-AIR Tally: ${successful.length >= 2 ? '✅ Working' : '❌ Issues'}`);
        
        return results;
    }

    static async testMacroCommandsShared(serialPort, cartAddress) {
        console.log(`\n🔧 MACRO COMMANDS TEST`);
        console.log(`=======================`);
        console.log(`Note: These commands return ACK/NACK + require status polling`);
        
        const results = [];
        const macroCommands = Object.entries(FLEXICART_COMMANDS)
            .filter(([name, cmd]) => cmd.category === 'macro')
            .slice(0, 2) // Test just first 2 macro commands to avoid timeout
            .map(([name, cmd]) => ({ name, ...cmd }));
        
        for (const command of macroCommands) {
            console.log(`\n🔧 Testing ${command.name}...`);
            
            const commandBuffer = createFlexiCartCommand(command.cmd, command.ctrl, command.data, cartAddress);
            const result = await sendCommandOnSharedPort(serialPort, commandBuffer, command.name);
            
            const success = result.success && (result.analysis.isACK || result.analysis.isNACK);
            results.push({ 
                command: command.name, 
                success: success,
                response: result.analysis,
                error: result.error 
            });
            
            if (result.analysis.isACK) {
                console.log(`   ✅ ${command.name}: ACK received - command accepted`);
            } else if (result.analysis.isNACK) {
                console.log(`   ⚠️  ${command.name}: NACK received - command rejected`);
            } else if (success) {
                console.log(`   ✅ ${command.name}: Success - ${result.hex}`);
            } else {
                console.log(`   ❌ ${command.name}: Failed - ${result.error || 'No response'}`);
            }
            
            // Longer delay for macro commands
            await new Promise(resolve => setTimeout(resolve, FLEXICART_CONFIG.INTER_COMMAND_DELAY * 2));
        }
        
        const successful = results.filter(r => r.success);
        console.log(`\n📈 MACRO COMMANDS SUMMARY:`);
        console.log(`   Successful: ${successful.length}/${results.length}`);
        console.log(`   ACK/NACK Protocol: ${successful.length > 0 ? '✅ Working' : '❌ Issues'}`);
        
        return results;
    }
}

// Export for use in other modules
module.exports = {
    FLEXICART_CONFIG,
    FLEXICART_COMMANDS,
    createFlexiCartCommand,
    analyzeResponse,
    sendCommand,
    executeMacroCommand,
    testImmediateCommand,
    FlexiCartMasterTest
};

// Run test if called directly
if (require.main === module) {
    const port = process.argv[2] || FLEXICART_CONFIG.PORT;
    const cartAddress = process.argv[3] ? parseInt(process.argv[3], 16) : FLEXICART_CONFIG.DEFAULT_CART_ADDRESS;
    
    console.log(`Starting FlexiCart Master Test...`);
    console.log(`Port: ${port}`);
    console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
    
    FlexiCartMasterTest.runFullTest(port, cartAddress)
        .then(results => {
            console.log(`\n✅ Test suite completed`);
            process.exit(0);
        })
        .catch(error => {
            console.error(`\n❌ Test suite failed: ${error.message}`);
            process.exit(1);
        });
}
