/**
 * Enhanced FlexiCart Communication Validator - CORRECTED SETUP
 * Port: /dev/ttyRP0 (corrected cabling)
 * ACK: 0x04 (corrected protocol)
 * 
 * This version implements proper port management to prevent locking
 * and includes enhanced NACK analysis for debugging
 */

const { SerialPort } = require('serialport');

// CORRECTED Configuration (confirmed working)
const CONFIG = {
    PORT: '/dev/ttyRP0',        // CORRECTED: Was /dev/ttyRP8
    BAUD_RATE: 38400,           // Confirmed
    DATA_BITS: 8,               // Confirmed  
    PARITY: 'even',             // Confirmed
    STOP_BITS: 1,               // Confirmed
    ACK_BYTE: 0x04,             // CORRECTED: Was 0x10
    NACK_BYTE: 0x05,            // CORRECTED: Was 0x11
    BUSY_BYTE: 0x06,            // FlexiCart busy response
    TIMEOUT: 1500               // Response timeout
};

/**
 * Create FlexiCart command with proper checksum (2's complement - CORRECTED)
 */
function createFlexiCartCommand(cmd, ctrl = 0x00, data = 0x80, cartAddress = 0x01) {
    const command = Buffer.alloc(9);
    command[0] = 0x02;          // STX
    command[1] = 0x06;          // BC  
    command[2] = 0x01;          // UA1
    command[3] = cartAddress;   // UA2
    command[4] = 0x00;          // BT
    command[5] = cmd;           // CMD
    command[6] = ctrl;          // CTRL
    command[7] = data;          // DATA
    
    // CORRECTED: Use 2's complement checksum (sum + 2's complement)
    let sum = 0;
    for (let i = 1; i < 8; i++) {
        sum += command[i];
    }
    command[8] = (0x100 - (sum & 0xFF)) & 0xFF;  // CS
    
    return command;
}

/**
 * Send single command with proper timeout and error handling
 */
function sendCommandToPort(serialPort, command, commandName) {
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
        
        serialPort.write(command, (error) => {
            if (error) {
                cleanup();
                resolve({
                    success: false,
                    error: `Write failed: ${error.message}`,
                    commandName: commandName
                });
                return;
            }
            
            serialPort.drain(() => {
                timeoutHandle = setTimeout(() => {
                    cleanup();
                    
                    const response = Buffer.concat(chunks);
                    
                    if (response.length === 0) {
                        resolve({
                            success: false,
                            error: 'No response from device',
                            commandName: commandName,
                            hex: 'none'
                        });
                        return;
                    }
                    
                    const analysis = analyzeResponse(response, commandName);
                    resolve({
                        success: true,
                        commandName: commandName,
                        response: response,
                        hex: response.toString('hex').match(/.{2}/g)?.join(' ') || '',
                        ...analysis
                    });
                    
                }, CONFIG.TIMEOUT);
            });
        });
    });
}

/**
 * Analyze FlexiCart response
 */
function analyzeResponse(response, commandName) {
    const firstByte = response[0];
    const analysis = {
        length: response.length,
        firstByte: firstByte,
        firstByteHex: '0x' + firstByte.toString(16).toUpperCase().padStart(2, '0')
    };
    
    // Determine response type based on first byte
    switch (firstByte) {
        case CONFIG.ACK_BYTE:
            analysis.type = 'ACK';
            analysis.accepted = true;
            analysis.message = 'Command accepted by FlexiCart';
            break;
            
        case CONFIG.NACK_BYTE:
            analysis.type = 'NACK';
            analysis.accepted = false;
            analysis.message = 'Command rejected by FlexiCart';
            analysis.reason = analyzeNackReason(response, commandName);
            break;
            
        case CONFIG.BUSY_BYTE:
            analysis.type = 'BUSY';
            analysis.accepted = true;
            analysis.message = 'FlexiCart busy - try again later';
            break;
            
        default:
            if (response.length > 1) {
                analysis.type = 'DATA';
                analysis.accepted = true;
                analysis.message = 'Data response received';
                
                // Check if it looks like status data
                if (response.length >= 8) {
                    analysis.possibleStatus = true;
                    analysis.statusBytes = Array.from(response).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0'));
                }
            } else {
                analysis.type = 'UNKNOWN';
                analysis.accepted = false;
                analysis.message = `Unknown response byte: ${analysis.firstByteHex}`;
            }
            break;
    }
    
    return analysis;
}

/**
 * Analyze NACK reasons
 */
function analyzeNackReason(response, commandName) {
    const reasons = [];
    
    // Common NACK reasons for FlexiCart
    reasons.push('Possible causes:');
    
    if (commandName.includes('Status')) {
        reasons.push('- Status command parameters incorrect');
        reasons.push('- Cart address mismatch');
        reasons.push('- Checksum calculation error');
    }
    
    if (commandName.includes('Movement') || commandName.includes('Elevator') || commandName.includes('Carousel')) {
        reasons.push('- Device busy or in motion');
        reasons.push('- Safety interlock active');
        reasons.push('- Invalid position requested');
    }
    
    reasons.push('- Device not initialized');
    reasons.push('- Command not supported in current state');
    reasons.push('- Protocol version mismatch');
    
    return reasons;
}

/**
 * Test multiple commands on single connection (prevents port locking)
 */
async function testMultipleCommands(port, commands, cartAddress = 0x01) {
    return new Promise((resolve) => {
        const serialPort = new SerialPort({
            path: port,
            baudRate: CONFIG.BAUD_RATE,
            dataBits: CONFIG.DATA_BITS,
            parity: CONFIG.PARITY,
            stopBits: CONFIG.STOP_BITS,
            autoOpen: false
        });
        
        const results = [];
        let commandIndex = 0;
        
        const cleanup = () => {
            if (serialPort.isOpen) {
                serialPort.close(() => {
                    resolve(results);
                });
            } else {
                resolve(results);
            }
        };
        
        const processNextCommand = async () => {
            if (commandIndex >= commands.length) {
                cleanup();
                return;
            }
            
            const cmdTest = commands[commandIndex];
            const command = createFlexiCartCommand(cmdTest.cmd, cmdTest.ctrl, cmdTest.data || 0x80, cartAddress);
            
            console.log(`📤 Testing: ${cmdTest.name}`);
            console.log(`   Command: ${command.toString('hex').match(/.{2}/g)?.join(' ')}`);
            
            try {
                const result = await sendCommandToPort(serialPort, command, cmdTest.name);
                results.push(result);
                
                if (result.success) {
                    console.log(`   📥 Response: ${result.hex}`);
                    console.log(`   📊 Analysis: ${result.type} - ${result.message}`);
                    
                    if (result.type === 'NACK' && result.reason) {
                        console.log(`   ❓ NACK Reasons:`);
                        result.reason.forEach(reason => console.log(`     ${reason}`));
                    }
                } else {
                    console.log(`   💥 ERROR: ${result.error}`);
                }
                
                console.log('');
                
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message,
                    commandName: cmdTest.name
                });
                console.log(`   💥 Exception: ${error.message}\n`);
            }
            
            commandIndex++;
            
            // Small delay between commands
            setTimeout(processNextCommand, 200);
        };
        
        serialPort.on('error', (error) => {
            console.error(`Serial port error: ${error.message}`);
            cleanup();
        });
        
        serialPort.open((error) => {
            if (error) {
                console.error(`Failed to open port: ${error.message}`);
                resolve([{
                    success: false,
                    error: `Port open failed: ${error.message}`,
                    commandName: 'PORT_OPEN'
                }]);
                return;
            }
            
            console.log(`✅ Port ${port} opened successfully`);
            processNextCommand();
        });
    });
}

/**
 * Enhanced FlexiCart communication validation
 */
async function validateCommunication(port = CONFIG.PORT, cartAddress = 0x01) {
    console.log(`\n🔧 Enhanced FlexiCart Communication Test - CORRECTED SETUP`);
    console.log(`========================================================`);
    console.log(`Port: ${port}`);
    console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
    console.log(`Expected ACK: 0x${CONFIG.ACK_BYTE.toString(16).toUpperCase()}`);
    console.log(`Expected NACK: 0x${CONFIG.NACK_BYTE.toString(16).toUpperCase()}`);
    console.log(`Config: ${CONFIG.BAUD_RATE} baud, ${CONFIG.DATA_BITS}${CONFIG.PARITY[0].toUpperCase()}${CONFIG.STOP_BITS}\n`);
    
    // Test commands that should work
    const testCommands = [
        // Basic status commands (immediate response)
        { name: 'General Status', cmd: 0x61, ctrl: 0x10, data: 0x80 },
        { name: 'Position Status', cmd: 0x61, ctrl: 0x20, data: 0x80 },
        { name: 'Error Status', cmd: 0x61, ctrl: 0x40, data: 0x80 },
        
        // Alternative status formats
        { name: 'Simple Status', cmd: 0x61, ctrl: 0x00, data: 0x80 },
        { name: 'Device ID', cmd: 0x60, ctrl: 0x00, data: 0x80 },
        
        // Control commands (immediate effect)
        { name: 'Stop Command', cmd: 0x20, ctrl: 0x00, data: 0x80 },
        { name: 'ON-AIR Tally OFF', cmd: 0x71, ctrl: 0x00, data: 0x80 }
    ];
    
    const results = await testMultipleCommands(port, testCommands, cartAddress);
    
    // Analyze results
    const summary = {
        totalTested: results.length,
        successful: results.filter(r => r.success).length,
        ackReceived: results.filter(r => r.success && r.type === 'ACK').length,
        nackReceived: results.filter(r => r.success && r.type === 'NACK').length,
        dataReceived: results.filter(r => r.success && r.type === 'DATA').length,
        errors: results.filter(r => !r.success).length
    };
    
    console.log(`📊 TEST SUMMARY`);
    console.log(`===============`);
    console.log(`Commands Tested: ${summary.totalTested}`);
    console.log(`Successful: ${summary.successful}`);
    console.log(`ACK Responses: ${summary.ackReceived}`);
    console.log(`NACK Responses: ${summary.nackReceived}`);
    console.log(`Data Responses: ${summary.dataReceived}`);
    console.log(`Errors: ${summary.errors}`);
    
    if (summary.successful > 0) {
        console.log(`\n✅ FlexiCart is responding on ${port}!`);
        
        if (summary.ackReceived > 0) {
            console.log(`✅ ACK protocol working (0x${CONFIG.ACK_BYTE.toString(16).toUpperCase()})`);
        }
        
        if (summary.nackReceived > 0) {
            console.log(`⚠️  Some commands rejected - check command parameters`);
        }
        
        if (summary.dataReceived > 0) {
            console.log(`✅ Data responses received - status commands may be working`);
        }
        
    } else {
        console.log(`\n❌ No successful responses from FlexiCart`);
        console.log(`Check: hardware connections, port settings, device power`);
    }
    
    return {
        summary: summary,
        results: results,
        isWorking: summary.successful > 0,
        hasValidProtocol: summary.ackReceived > 0 || summary.dataReceived > 0
    };
}

// Export for use in other modules
module.exports = {
    CONFIG,
    createFlexiCartCommand,
    testMultipleCommands,
    validateCommunication,
    analyzeResponse
};

// Run validation if called directly  
if (require.main === module) {
    const port = process.argv[2] || CONFIG.PORT;
    const cartAddress = process.argv[3] ? parseInt(process.argv[3], 16) : 0x01;
    
    console.log(`🔧 Starting enhanced FlexiCart communication validation...`);
    
    validateCommunication(port, cartAddress)
        .then(validation => {
            if (validation.isWorking) {
                console.log(`\n🎯 Validation successful! FlexiCart responding on ${port}`);
                process.exit(0);
            } else {
                console.log(`\n💥 Validation failed - FlexiCart not responding properly`);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error(`\n💥 Validation error: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        });
}
