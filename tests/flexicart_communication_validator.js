/**
 * FlexiCart Communication Validator - CORRECTED SETUP
 * Port: /dev/ttyRP0 (corrected cabling)
 * ACK Response: 0x04 (corrected protocol)
 * 
 * Quick validation test for the corrected FlexiCart setup
 */

const { SerialPort } = require('serialport');

// CORRECTED Configuration
const CONFIG = {
    PORT: '/dev/ttyRP0',       // Corrected port
    BAUD_RATE: 38400,
    DATA_BITS: 8,
    PARITY: 'even',
    STOP_BITS: 1,
    
    // CORRECTED protocol constants
    STX: 0x02,
    ACK: 0x04,                 // CORRECTED: Was 0x10, now 0x04
    NACK: 0x05,
    BUSY: 0x06,
    
    TIMEOUT: 2000
};

/**
 * Create basic FlexiCart command
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
    
    // Calculate checksum (XOR of bytes 1-7)
    let checksum = 0;
    for (let i = 1; i < 8; i++) {
        checksum ^= command[i];
    }
    command[8] = checksum;      // CS
    
    return command;
}

/**
 * Send command and analyze response
 */
async function testCommand(port, command, commandName) {
    return new Promise((resolve) => {
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
        
        serialPort.on('data', (chunk) => {
            chunks.push(chunk);
        });
        
        serialPort.open((error) => {
            if (error) {
                cleanup();
                resolve({
                    success: false,
                    error: `Port open failed: ${error.message}`,
                    command: commandName
                });
                return;
            }
            
            serialPort.write(command, (writeError) => {
                if (writeError) {
                    cleanup();
                    resolve({
                        success: false,
                        error: `Write failed: ${writeError.message}`,
                        command: commandName
                    });
                    return;
                }
                
                serialPort.drain(() => {
                    timeoutHandle = setTimeout(() => {
                        cleanup();
                        
                        const response = Buffer.concat(chunks);
                        const hex = response.toString('hex').match(/.{2}/g)?.join(' ') || 'no response';
                        
                        let responseType = 'unknown';
                        let analysis = '';
                        
                        if (response.length === 0) {
                            responseType = 'no_response';
                            analysis = 'No response received';
                        } else {
                            const firstByte = response[0];
                            
                            if (firstByte === CONFIG.ACK) {
                                responseType = 'ack';
                                analysis = '✅ ACK (0x04) - Command accepted';
                            } else if (firstByte === CONFIG.NACK) {
                                responseType = 'nack';  
                                analysis = '❌ NACK (0x05) - Command rejected';
                            } else if (firstByte === CONFIG.BUSY) {
                                responseType = 'busy';
                                analysis = '⏳ BUSY (0x06) - Device busy';
                            } else {
                                responseType = 'data';
                                analysis = `📊 Data response (${response.length} bytes)`;
                            }
                        }
                        
                        resolve({
                            success: response.length > 0,
                            command: commandName,
                            response: response,
                            hex: hex,
                            length: response.length,
                            responseType: responseType,
                            analysis: analysis,
                            isACK: responseType === 'ack',
                            isNACK: responseType === 'nack',
                            hasData: responseType === 'data'
                        });
                        
                    }, CONFIG.TIMEOUT);
                });
            });
        });
    });
}

/**
 * Quick communication validation
 */
async function validateCommunication(port = CONFIG.PORT, cartAddress = 0x01) {
    console.log(`\n🔍 FlexiCart Communication Validation`);
    console.log(`=====================================`);
    console.log(`CORRECTED SETUP:`);
    console.log(`Port: ${port} (corrected cabling)`);
    console.log(`ACK Expected: 0x04 (corrected protocol)`);
    console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
    console.log(`Config: ${CONFIG.BAUD_RATE} baud, 8E1\n`);
    
    const testCommands = [
        {
            name: 'Status Request',
            command: createCommand(0x61, 0x10, 0x80, cartAddress),
            expected: 'data',
            description: 'Should return immediate status data'
        },
        {
            name: 'Position Request', 
            command: createCommand(0x61, 0x20, 0x80, cartAddress),
            expected: 'data',
            description: 'Should return immediate position data'
        },
        {
            name: 'ON-AIR Tally ON',
            command: createCommand(0x71, 0x01, 0x80, cartAddress),
            expected: 'ack',
            description: 'Should return ACK (0x04) for control command'
        },
        {
            name: 'Elevator UP',
            command: createCommand(0x41, 0x01, 0x80, cartAddress),
            expected: 'ack',
            description: 'Should return ACK (0x04) for macro command'
        }
    ];
    
    const results = [];
    let communicationWorking = false;
    let ackProtocolWorking = false;
    
    for (const test of testCommands) {
        console.log(`📤 Testing: ${test.name}`);
        console.log(`   Command: ${test.command.toString('hex').match(/.{2}/g).join(' ')}`);
        console.log(`   Expected: ${test.expected.toUpperCase()} response`);
        
        const result = await testCommand(port, test.command, test.name);
        results.push(result);
        
        if (result.success) {
            console.log(`   📥 Response: ${result.hex}`);
            console.log(`   ${result.analysis}`);
            
            communicationWorking = true;
            
            if (result.isACK) {
                ackProtocolWorking = true;
                console.log(`   🎉 CORRECTED ACK (0x04) CONFIRMED!`);
            }
            
            if (result.hasData) {
                console.log(`   📊 Data response indicates immediate command working`);
            }
            
            console.log(`   ✅ SUCCESS\\n`);
        } else {
            console.log(`   ❌ FAILED: ${result.error}\\n`);
        }
        
        // Small delay between commands
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Summary
    const successful = results.filter(r => r.success);
    const ackResponses = results.filter(r => r.isACK);
    const dataResponses = results.filter(r => r.hasData);
    
    console.log(`\n📊 VALIDATION SUMMARY`);
    console.log(`=====================`);
    console.log(`Total Commands: ${results.length}`);
    console.log(`Successful: ${successful.length}`);
    console.log(`ACK Responses: ${ackResponses.length}`);
    console.log(`Data Responses: ${dataResponses.length}`);
    console.log(`Success Rate: ${Math.round((successful.length/results.length) * 100)}%`);
    
    console.log(`\n🎯 KEY FINDINGS:`);
    console.log(`Communication: ${communicationWorking ? '✅ WORKING' : '❌ FAILED'}`);
    console.log(`ACK Protocol: ${ackProtocolWorking ? '✅ CONFIRMED (0x04)' : '❌ NOT CONFIRMED'}`);
    console.log(`Immediate Commands: ${dataResponses.length > 0 ? '✅ WORKING' : '❌ NO DATA'}`);
    console.log(`Macro Commands: ${ackResponses.length > 0 ? '✅ ACK RECEIVED' : '❌ NO ACK'}`);
    
    if (communicationWorking && ackProtocolWorking) {
        console.log(`\n🎉 CORRECTED SETUP VALIDATED!`);
        console.log(`✅ Port /dev/ttyRP0 working with corrected cabling`);
        console.log(`✅ ACK response 0x04 confirmed`);
        console.log(`✅ Ready for full protocol testing`);
    } else {
        console.log(`\n⚠️  Setup needs attention:`);
        if (!communicationWorking) {
            console.log(`   - Check port connection and cabling`);
        }
        if (!ackProtocolWorking) {
            console.log(`   - ACK protocol not confirmed`);
        }
    }
    
    return {
        communicationWorking,
        ackProtocolWorking,
        successful: successful.length,
        total: results.length,
        results
    };
}

// Export for use in other modules
module.exports = {
    CONFIG,
    createCommand,
    testCommand,
    validateCommunication
};

// Run validation if called directly
if (require.main === module) {
    const port = process.argv[2] || CONFIG.PORT;
    const cartAddress = process.argv[3] ? parseInt(process.argv[3], 16) : 0x01;
    
    validateCommunication(port, cartAddress)
        .then(results => {
            if (results.communicationWorking && results.ackProtocolWorking) {
                console.log(`\n✅ Validation successful - setup is working!`);
                process.exit(0);
            } else {
                console.log(`\n❌ Validation failed - setup needs attention`);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error(`\n💥 Validation error: ${error.message}`);
            process.exit(1);
        });
}
