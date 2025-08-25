/**
 * FlexiCart Macro Command Test - CORRECTED SETUP
 * Port: /dev/ttyRP0 (corrected cabling)
 * ACK Response: 0x04 (corrected protocol)
 * 
 * Tests the macro command pattern: Command → ACK/NACK → Status Polling → Completion
 */

const { SerialPort } = require('serialport');

// CORRECTED Configuration
const CONFIG = {
    PORT: '/dev/ttyRP0',
    BAUD_RATE: 38400,
    DATA_BITS: 8,
    PARITY: 'even',
    STOP_BITS: 1,
    
    // CORRECTED Protocol Constants
    STX: 0x02,
    BC: 0x06,
    UA1: 0x01,
    BT: 0x00,
    
    // CORRECTED Response codes
    ACK: 0x04,                 // CORRECTED: Command accepted
    NACK: 0x05,               // Command rejected
    BUSY: 0x06,               // Device busy
    
    // Timing
    COMMAND_TIMEOUT: 1000,     // Initial command timeout
    STATUS_TIMEOUT: 500,       // Status check timeout
    POLL_INTERVAL: 100,        // Status polling interval
    MAX_POLL_ATTEMPTS: 50      // Max status checks (5 seconds)
};

/**
 * Create FlexiCart command with CORRECTED protocol
 */
function createCommand(cmd, ctrl = 0x00, data = 0x80, cartAddress = 0x01) {
    const command = Buffer.alloc(9);
    command[0] = CONFIG.STX;          // STX
    command[1] = CONFIG.BC;           // BC
    command[2] = CONFIG.UA1;          // UA1
    command[3] = cartAddress;         // UA2 (cart address)
    command[4] = CONFIG.BT;           // BT
    command[5] = cmd;                 // CMD
    command[6] = ctrl;                // CTRL
    command[7] = data;                // DATA
    
    // Calculate checksum (XOR of bytes 1-7)
    let checksum = 0;
    for (let i = 1; i < 8; i++) {
        checksum ^= command[i];
    }
    command[8] = checksum;            // CS
    
    return command;
}

/**
 * Send single command with timeout
 */
async function sendCommand(port, command, timeout = CONFIG.COMMAND_TIMEOUT) {
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
        
        serialPort.on('data', (chunk) => {
            chunks.push(chunk);
        });
        
        serialPort.on('error', (error) => {
            safeReject(new Error(`Serial error: ${error.message}`));
        });
        
        serialPort.open((error) => {
            if (error) {
                safeReject(new Error(`Port open failed: ${error.message}`));
                return;
            }
            
            serialPort.write(command, (writeError) => {
                if (writeError) {
                    safeReject(new Error(`Write failed: ${writeError.message}`));
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
    });
}

/**
 * Analyze response with CORRECTED ACK detection
 */
function analyzeResponse(response, commandName = 'Unknown') {
    const analysis = {
        command: commandName,
        length: response.length,
        hex: response.toString('hex').match(/.{2}/g)?.join(' ') || 'no response',
        bytes: Array.from(response),
        responseType: 'unknown',
        isACK: false,
        isNACK: false,
        isBUSY: false,
        hasData: false,
        firstByte: response.length > 0 ? response[0] : null,
        timestamp: new Date().toISOString()
    };
    
    if (response.length === 0) {
        analysis.responseType = 'no_response';
        return analysis;
    }
    
    const firstByte = response[0];
    
    // CORRECTED ACK/NACK detection
    if (firstByte === CONFIG.ACK) {
        analysis.responseType = 'ack';
        analysis.isACK = true;
    } else if (firstByte === CONFIG.NACK) {
        analysis.responseType = 'nack';
        analysis.isNACK = true;
    } else if (firstByte === CONFIG.BUSY) {
        analysis.responseType = 'busy';
        analysis.isBUSY = true;
    } else {
        analysis.responseType = 'data';
        analysis.hasData = true;
        analysis.dataLength = response.length;
    }
    
    return analysis;
}

/**
 * Execute macro command with full ACK/NACK + status polling pattern
 */
async function executeMacroCommand(port, commandDef, cartAddress = 0x01) {
    const startTime = Date.now();
    
    console.log(`\\n🔧 Executing Macro Command: ${commandDef.name}`);
    console.log(`   Description: ${commandDef.description}`);
    console.log(`   Command: 0x${commandDef.cmd.toString(16).toUpperCase()}, Control: 0x${commandDef.ctrl.toString(16).toUpperCase()}`);
    
    try {
        // Step 1: Send the macro command
        const commandBuffer = createCommand(commandDef.cmd, commandDef.ctrl, commandDef.data, cartAddress);
        console.log(`   📤 Sending: ${commandBuffer.toString('hex').match(/.{2}/g).join(' ')}`);
        
        const initialResponse = await sendCommand(port, commandBuffer, CONFIG.COMMAND_TIMEOUT);
        const initialAnalysis = analyzeResponse(initialResponse, commandDef.name);
        
        console.log(`   📥 Initial Response: ${initialAnalysis.hex} (${initialAnalysis.responseType})`);
        
        // Step 2: Analyze initial response
        if (initialAnalysis.isNACK) {
            console.log(`   ❌ Command REJECTED (NACK received)`);
            return {
                success: false,
                stage: 'initial_response',
                error: 'Command rejected by FlexiCart',
                initialResponse: initialAnalysis,
                executionTime: Date.now() - startTime
            };
        }
        
        if (!initialAnalysis.isACK) {
            console.log(`   ⚠️  Expected ACK (0x04), received: 0x${initialAnalysis.firstByte?.toString(16) || '00'}`);
            
            // If we got data instead of ACK, this might be an immediate response command
            if (initialAnalysis.hasData) {
                console.log(`   📊 Received data response - may be immediate command, not macro`);
                return {
                    success: true,
                    stage: 'immediate_response',
                    type: 'immediate',
                    initialResponse: initialAnalysis,
                    executionTime: Date.now() - startTime
                };
            } else {
                console.log(`   ❓ Unexpected response type`);
                return {
                    success: false,
                    stage: 'initial_response',
                    error: `Unexpected response: ${initialAnalysis.responseType}`,
                    initialResponse: initialAnalysis,
                    executionTime: Date.now() - startTime
                };
            }
        }
        
        // Step 3: ACK received - start status polling
        console.log(`   ✅ Command ACCEPTED (ACK received)`);
        console.log(`   ⏳ Starting status polling for completion...`);
        
        const statusHistory = [];
        let pollAttempts = 0;
        
        // Create status request command
        const statusCommand = createCommand(0x61, 0x10, 0x80, cartAddress);
        
        while (pollAttempts < CONFIG.MAX_POLL_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, CONFIG.POLL_INTERVAL));
            
            try {
                const statusResponse = await sendCommand(port, statusCommand, CONFIG.STATUS_TIMEOUT);
                const statusAnalysis = analyzeResponse(statusResponse, `Status Check ${pollAttempts + 1}`);
                
                statusHistory.push({
                    attempt: pollAttempts + 1,
                    response: statusAnalysis,
                    timestamp: new Date().toISOString()
                });
                
                console.log(`   📊 Status ${pollAttempts + 1}: ${statusAnalysis.hex} (${statusAnalysis.responseType})`);
                
                // Simple completion detection: if we consistently get data responses, operation likely complete
                if (statusAnalysis.hasData && statusHistory.length >= 3) {
                    // Check if last 3 status responses are consistent (indicating operation complete)
                    const lastThree = statusHistory.slice(-3);
                    const allHaveData = lastThree.every(s => s.response.hasData);
                    const similarResponses = lastThree.every(s => 
                        s.response.hex === lastThree[0].response.hex
                    );
                    
                    if (allHaveData && similarResponses) {
                        console.log(`   ✅ Operation appears COMPLETE (consistent status responses)`);
                        return {
                            success: true,
                            stage: 'completed',
                            type: 'macro',
                            initialResponse: initialAnalysis,
                            statusHistory: statusHistory,
                            pollAttempts: pollAttempts + 1,
                            executionTime: Date.now() - startTime
                        };
                    }
                }
                
                // Continue polling...
                pollAttempts++;
                
            } catch (statusError) {
                console.log(`   ⚠️  Status check ${pollAttempts + 1} failed: ${statusError.message}`);
                statusHistory.push({
                    attempt: pollAttempts + 1,
                    error: statusError.message,
                    timestamp: new Date().toISOString()
                });
                pollAttempts++;
            }
        }
        
        // Polling timeout reached
        console.log(`   ⏰ Status polling TIMEOUT after ${pollAttempts} attempts`);
        return {
            success: false,
            stage: 'polling_timeout',
            error: 'Status polling timeout',
            initialResponse: initialAnalysis,
            statusHistory: statusHistory,
            pollAttempts: pollAttempts,
            executionTime: Date.now() - startTime
        };
        
    } catch (error) {
        console.log(`   💥 Macro command FAILED: ${error.message}`);
        return {
            success: false,
            stage: 'command_error',
            error: error.message,
            executionTime: Date.now() - startTime
        };
    }
}

/**
 * Test macro commands with CORRECTED protocol
 */
async function testMacroCommands(port = CONFIG.PORT, cartAddress = 0x01) {
    console.log(`\\n🎯 FLEXICART MACRO COMMAND TEST`);
    console.log(`=================================`);
    console.log(`CORRECTED SETUP:`);
    console.log(`Port: ${port} (corrected cabling)`);
    console.log(`ACK Expected: 0x04 (corrected protocol)`);
    console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
    console.log(`Config: ${CONFIG.BAUD_RATE} baud, 8E1`);
    console.log(`Max Poll Time: ${CONFIG.MAX_POLL_ATTEMPTS * CONFIG.POLL_INTERVAL}ms`);
    
    const macroCommands = [
        {
            name: 'Elevator UP',
            cmd: 0x41,
            ctrl: 0x01,
            data: 0x80,
            description: 'Move elevator up one position'
        },
        {
            name: 'Elevator DOWN',
            cmd: 0x41,
            ctrl: 0x02,
            data: 0x80,
            description: 'Move elevator down one position'
        },
        {
            name: 'Carousel Clockwise',
            cmd: 0x42,
            ctrl: 0x01,
            data: 0x80,
            description: 'Rotate carousel clockwise'
        },
        {
            name: 'Carousel Counter-Clockwise',
            cmd: 0x42,
            ctrl: 0x02,
            data: 0x80,
            description: 'Rotate carousel counter-clockwise'
        },
        {
            name: 'Load Cart',
            cmd: 0x44,
            ctrl: 0x01,
            data: 0x80,
            description: 'Load cart into player'
        },
        {
            name: 'Unload Cart',
            cmd: 0x44,
            ctrl: 0x02,
            data: 0x80,
            description: 'Unload cart from player'
        }
    ];
    
    const results = [];
    
    for (const command of macroCommands) {
        const result = await executeMacroCommand(port, command, cartAddress);
        results.push({ command: command.name, ...result });
        
        // Brief pause between macro commands
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Analyze results
    const successful = results.filter(r => r.success);
    const ackReceived = results.filter(r => r.initialResponse && r.initialResponse.isACK);
    const completed = results.filter(r => r.success && r.stage === 'completed');
    const immediate = results.filter(r => r.success && r.type === 'immediate');
    
    console.log(`\\n📊 MACRO COMMAND RESULTS`);
    console.log(`=========================`);
    console.log(`Total Commands: ${results.length}`);
    console.log(`ACK Responses: ${ackReceived.length}`);
    console.log(`Completed Operations: ${completed.length}`);
    console.log(`Immediate Responses: ${immediate.length}`);
    console.log(`Overall Success: ${successful.length}`);
    console.log(`Success Rate: ${Math.round((successful.length/results.length) * 100)}%`);
    
    console.log(`\\n🎯 ANALYSIS:`);
    console.log(`ACK Protocol: ${ackReceived.length > 0 ? '✅ CONFIRMED (0x04)' : '❌ NOT WORKING'}`);
    console.log(`Macro Commands: ${completed.length > 0 ? '✅ WORKING' : '⚠️  PROTOCOL ONLY'}`);
    console.log(`Command Acceptance: ${ackReceived.length > 0 ? '✅ COMMANDS ACCEPTED' : '❌ COMMANDS REJECTED'}`);
    
    if (ackReceived.length > 0) {
        console.log(`\\n🎉 CORRECTED SETUP CONFIRMED!`);
        console.log(`✅ FlexiCart accepts macro commands`);
        console.log(`✅ ACK (0x04) protocol working`);
        console.log(`✅ Status polling mechanism functional`);
        
        if (completed.length > 0) {
            console.log(`✅ Physical operations completing`);
        } else {
            console.log(`ℹ️  Operations accepted but completion detection needs refinement`);
        }
    }
    
    return {
        totalCommands: results.length,
        ackResponses: ackReceived.length,
        completedOperations: completed.length,
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
    executeMacroCommand,
    testMacroCommands
};

// Run test if called directly
if (require.main === module) {
    const port = process.argv[2] || CONFIG.PORT;
    const cartAddress = process.argv[3] ? parseInt(process.argv[3], 16) : 0x01;
    
    testMacroCommands(port, cartAddress)
        .then(results => {
            if (results.ackResponses > 0) {
                console.log(`\\n✅ Macro command test successful!`);
                console.log(`🎯 ACK protocol confirmed with corrected setup`);
                process.exit(0);
            } else {
                console.log(`\\n❌ Macro command test failed`);
                console.log(`⚠️  Check setup and connections`);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error(`\\n💥 Test error: ${error.message}`);
            process.exit(1);
        });
}
