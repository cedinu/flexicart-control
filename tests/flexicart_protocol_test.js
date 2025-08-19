/**
 * FlexiCart Protocol Test - IMPROVED PORT MANAGEMENT
 * Fixed port locking and better response analysis
 */

const { SerialPort } = require('serialport');

// Standard FlexiCart Command Format (from documentation)
const FLEXICART_COMMAND_FORMAT = {
    STX: 0x02,      // Start of text
    BC: 0x06,       // Byte count (always 6 for data portion)
    UA1: 0x01,      // Unit address 1 (always 01)
    UA2: 0x01,      // Unit address 2 (cart address: 01, 02, 04, 08, etc.)
    BT: 0x00,       // Block type (00 for normal commands)
    CMD: 0x00,      // Command byte
    CTRL: 0x00,     // Control byte
    DATA: 0x80,     // Data byte (often 0x80)
    CS: 0x00        // Checksum
};

// Corrected FlexiCart Commands
const FLEXICART_COMMANDS = {
    // Page 58: Elevator Move Command
    ELEVATOR_MOVE_UP: {
        cmd: 0x41,      // Elevator move command
        ctrl: 0x01,     // Up direction
        data: 0x80,     // Standard data
        description: 'Move elevator up one position'
    },
    
    ELEVATOR_MOVE_DOWN: {
        cmd: 0x41,      // Elevator move command  
        ctrl: 0x02,     // Down direction
        data: 0x80,     // Standard data
        description: 'Move elevator down one position'
    },
    
    // ON-AIR Tally Commands
    ON_AIR_TALLY_ON: {
        cmd: 0x71,      // Tally command
        ctrl: 0x01,     // Turn ON
        data: 0x80,     // Standard data
        description: 'Turn ON-AIR tally ON'
    },
    
    ON_AIR_TALLY_OFF: {
        cmd: 0x71,      // Tally command
        ctrl: 0x00,     // Turn OFF
        data: 0x80,     // Standard data  
        description: 'Turn ON-AIR tally OFF'
    },
    
    // Page 61: Status Request
    CASSETTE_STATUS: {
        cmd: 0x61,      // Status request command
        ctrl: 0x00,     // Standard control
        data: 0x80,     // Standard data
        description: 'Request cassette console status'
    }
};

/**
 * Create proper FlexiCart command packet
 */
function createFlexiCartCommand(cartAddress, commandInfo) {
    const packet = Buffer.alloc(9);
    
    packet[0] = 0x02;                    // STX
    packet[1] = 0x06;                    // BC (byte count)
    packet[2] = 0x01;                    // UA1 (always 01)
    packet[3] = cartAddress;             // UA2 (cart address)
    packet[4] = 0x00;                    // BT (block type)
    packet[5] = commandInfo.cmd;         // CMD
    packet[6] = commandInfo.ctrl;        // CTRL  
    packet[7] = commandInfo.data;        // DATA
    
    // Calculate checksum (2's complement)
    let sum = 0;
    for (let i = 1; i < 8; i++) {
        sum += packet[i];
    }
    packet[8] = (0x100 - (sum & 0xFF)) & 0xFF;
    
    return packet;
}

/**
 * Analyze FlexiCart Response Data - ENHANCED VERSION
 */
function analyzeFlexiCartStatus(response) {
    if (!response || response.length === 0) {
        return { error: 'No response data', valid: false };
    }
    
    const hex = response.toString('hex').toUpperCase();
    console.log(`   🔍 Raw response: ${hex} (${response.length} bytes)`);
    
    const analysis = {
        length: response.length,
        hex: hex,
        bytes: Array.from(response),
        interpretation: [],
        possibleStatus: {},
        changes: []
    };
    
    // Analyze specific byte positions that might indicate status
    const nonZeroBytes = [];
    const bytePositions = {};
    
    response.forEach((byte, index) => {
        if (byte !== 0) {
            nonZeroBytes.push({ position: index, value: byte, hex: byte.toString(16).toUpperCase() });
            bytePositions[index] = byte;
        }
    });
    
    analysis.nonZeroBytes = nonZeroBytes;
    analysis.bytePositions = bytePositions;
    
    // Look for status patterns
    if (nonZeroBytes.length > 0) {
        analysis.interpretation.push(`Active bytes: ${nonZeroBytes.length}`);
        
        // Check for specific patterns we've seen
        if (hex.includes('54')) {
            analysis.interpretation.push('Contains 0x54 - possible status marker');
            analysis.possibleStatus.marker54 = true;
        }
        
        if (hex.includes('4040')) {
            analysis.interpretation.push('Contains 0x40 pattern - possible position data');
            analysis.possibleStatus.position40 = true;
        }
        
        if (hex.includes('8080') || hex.includes('81')) {
            analysis.interpretation.push('Contains 0x80/0x81 - possible control flags');
            analysis.possibleStatus.controlFlags = true;
        }
        
        if (hex.includes('5050') || hex.includes('50')) {
            analysis.interpretation.push('Contains 0x50 - possible movement indicator');
            analysis.possibleStatus.movementFlag = true;
        }
        
        if (hex.includes('0505') || hex.includes('05')) {
            analysis.interpretation.push('Contains 0x05 - possible counter/position');
            analysis.possibleStatus.counter = true;
        }
    } else {
        analysis.interpretation.push('All zeros - no status or disabled');
    }
    
    return analysis;
}

class FlexiCartProtocolTest {
    
    static config = {
        baudRate: 38400,
        dataBits: 8,
        parity: 'even',
        stopBits: 1
    };
    
    /**
     * IMPROVED: Single port connection with multiple commands
     */
    static async sendMultipleCommands(portPath, commands, timeout = 30000) {
        return new Promise((resolve) => {
            let port;
            let results = [];
            let commandIndex = 0;
            let resolved = false;
            let timeoutHandle;
            
            const cleanup = (finalResults) => {
                if (resolved) return;
                resolved = true;
                
                if (timeoutHandle) clearTimeout(timeoutHandle);
                
                if (port && port.isOpen) {
                    port.close(() => resolve(finalResults));
                } else {
                    resolve(finalResults);
                }
            };
            
            const sendNextCommand = () => {
                if (commandIndex >= commands.length) {
                    cleanup(results);
                    return;
                }
                
                const currentCommand = commands[commandIndex];
                console.log(`\n📤 Command ${commandIndex + 1}/${commands.length}: ${currentCommand.name}`);
                console.log(`   Sending: ${currentCommand.buffer.toString('hex').toUpperCase()}`);
                
                let responseBuffer = Buffer.alloc(0);
                let responseTimeout;
                
                const processResponse = () => {
                    const analysis = analyzeFlexiCartStatus(responseBuffer);
                    
                    results.push({
                        name: currentCommand.name,
                        command: currentCommand.buffer.toString('hex').toUpperCase(),
                        success: responseBuffer.length > 0,
                        response: responseBuffer,
                        analysis: analysis
                    });
                    
                    console.log(`   📥 Response: ${responseBuffer.length > 0 ? '✅ RECEIVED' : '❌ NONE'}`);
                    if (analysis.interpretation.length > 0) {
                        console.log(`   📊 Analysis: ${analysis.interpretation.join(' | ')}`);
                    }
                    
                    commandIndex++;
                    
                    // Wait before next command
                    setTimeout(() => {
                        sendNextCommand();
                    }, 2000);
                };
                
                // Set up response collection
                const dataHandler = (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);
                };
                
                port.removeAllListeners('data');
                port.on('data', dataHandler);
                
                // Send command
                port.write(currentCommand.buffer, (writeErr) => {
                    if (writeErr) {
                        console.log(`   ❌ Write error: ${writeErr.message}`);
                        results.push({
                            name: currentCommand.name,
                            success: false,
                            error: writeErr.message
                        });
                        commandIndex++;
                        setTimeout(() => sendNextCommand(), 1000);
                        return;
                    }
                    
                    // Wait for response
                    responseTimeout = setTimeout(processResponse, 3000);
                });
            };
            
            try {
                port = new SerialPort({
                    path: portPath,
                    baudRate: this.config.baudRate,
                    dataBits: this.config.dataBits,
                    parity: this.config.parity,
                    stopBits: this.config.stopBits,
                    autoOpen: false
                });
                
                port.on('error', (err) => {
                    console.log(`❌ Port error: ${err.message}`);
                    cleanup([]);
                });
                
                port.open((openErr) => {
                    if (openErr) {
                        console.log(`❌ Cannot open port: ${openErr.message}`);
                        cleanup([]);
                        return;
                    }
                    
                    console.log(`✅ Port opened successfully`);
                    timeoutHandle = setTimeout(() => cleanup(results), timeout);
                    sendNextCommand();
                });
                
            } catch (error) {
                console.log(`❌ Port setup error: ${error.message}`);
                cleanup([]);
            }
        });
    }
    
    /**
     * Test with single port connection
     */
    static async testWithSingleConnection(portPath, cartAddress = 0x01) {
        console.log('🎬 FlexiCart Single Connection Test');
        console.log('===================================');
        console.log('Using single port connection to avoid locking issues\n');
        
        // Prepare all commands
        const testSequence = [
            { name: 'Initial Status', buffer: createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.CASSETTE_STATUS) },
            { name: 'ON-AIR Tally ON', buffer: createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.ON_AIR_TALLY_ON) },
            { name: 'Status After Tally ON', buffer: createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.CASSETTE_STATUS) },
            { name: 'ON-AIR Tally OFF', buffer: createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.ON_AIR_TALLY_OFF) },
            { name: 'Status After Tally OFF', buffer: createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.CASSETTE_STATUS) },
            { name: 'Elevator Move UP', buffer: createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.ELEVATOR_MOVE_UP) },
            { name: 'Status After Move UP', buffer: createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.CASSETTE_STATUS) },
            { name: 'Elevator Move DOWN', buffer: createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.ELEVATOR_MOVE_DOWN) },
            { name: 'Status After Move DOWN', buffer: createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.CASSETTE_STATUS) },
            { name: 'Final Status', buffer: createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.CASSETTE_STATUS) }
        ];
        
        const results = await this.sendMultipleCommands(portPath, testSequence);
        
        // Analyze results
        console.log('\n📊 COMPREHENSIVE ANALYSIS');
        console.log('=========================');
        
        const successful = results.filter(r => r.success);
        console.log(`Successful commands: ${successful.length}/${results.length}`);
        
        // Status analysis
        const statusResults = results.filter(r => r.name.includes('Status') && r.success);
        console.log(`\n🔍 STATUS SEQUENCE ANALYSIS:`);
        
        statusResults.forEach((result, index) => {
            console.log(`\n${index + 1}. ${result.name}:`);
            console.log(`   Response: ${result.analysis.hex}`);
            console.log(`   Non-zero bytes: ${result.analysis.nonZeroBytes.length}`);
            
            if (result.analysis.nonZeroBytes.length > 0) {
                const positions = result.analysis.nonZeroBytes.map(b => `pos${b.position}:0x${b.hex}`).join(', ');
                console.log(`   Active data: ${positions}`);
            }
            
            // Compare with previous
            if (index > 0) {
                const prev = statusResults[index - 1];
                if (result.analysis.hex !== prev.analysis.hex) {
                    console.log(`   🏃 CHANGE DETECTED!`);
                    
                    // Find specific byte changes
                    const changes = [];
                    result.analysis.bytes.forEach((byte, pos) => {
                        const prevByte = prev.analysis.bytes[pos] || 0;
                        if (byte !== prevByte) {
                            changes.push(`pos${pos}: 0x${prevByte.toString(16).toUpperCase()} → 0x${byte.toString(16).toUpperCase()}`);
                        }
                    });
                    
                    if (changes.length > 0) {
                        console.log(`   📍 Changed bytes: ${changes.join(', ')}`);
                    }
                } else {
                    console.log(`   📍 Same as previous`);
                }
            }
        });
        
        // Check for ON-AIR tally functionality
        console.log(`\n🚨 ON-AIR TALLY ANALYSIS:`);
        const tallyOnStatus = statusResults.find(r => r.name.includes('After Tally ON'));
        const tallyOffStatus = statusResults.find(r => r.name.includes('After Tally OFF'));
        
        if (tallyOnStatus && tallyOffStatus) {
            if (tallyOnStatus.analysis.hex !== tallyOffStatus.analysis.hex) {
                console.log('✅ ON-AIR TALLY IS WORKING!');
                console.log(`   ON state:  ${tallyOnStatus.analysis.hex}`);
                console.log(`   OFF state: ${tallyOffStatus.analysis.hex}`);
            } else {
                console.log('❌ ON-AIR tally shows no status change');
            }
        }
        
        // Check for elevator movement
        console.log(`\n🏗️ ELEVATOR MOVEMENT ANALYSIS:`);
        const beforeMove = statusResults.find(r => r.name.includes('After Tally OFF'));
        const afterUp = statusResults.find(r => r.name.includes('After Move UP'));
        const afterDown = statusResults.find(r => r.name.includes('After Move DOWN'));
        
        let elevatorWorking = false;
        
        if (beforeMove && afterUp && afterUp.analysis.hex !== beforeMove.analysis.hex) {
            console.log('✅ ELEVATOR UP MOVEMENT DETECTED!');
            console.log(`   Before: ${beforeMove.analysis.hex}`);
            console.log(`   After UP: ${afterUp.analysis.hex}`);
            elevatorWorking = true;
        }
        
        if (afterUp && afterDown && afterDown.analysis.hex !== afterUp.analysis.hex) {
            console.log('✅ ELEVATOR DOWN MOVEMENT DETECTED!');
            console.log(`   After UP: ${afterUp.analysis.hex}`);
            console.log(`   After DOWN: ${afterDown.analysis.hex}`);
            elevatorWorking = true;
        }
        
        if (!elevatorWorking) {
            console.log('❌ No elevator movement detected in status');
            console.log('   Checking if movement commands were accepted...');
            
            const moveUp = results.find(r => r.name.includes('Move UP'));
            const moveDown = results.find(r => r.name.includes('Move DOWN'));
            
            if (moveUp && moveUp.success) {
                console.log('   ✅ Move UP command was accepted');
            }
            if (moveDown && moveDown.success) {
                console.log('   ✅ Move DOWN command was accepted');
            }
        }
        
        // Final assessment
        console.log(`\n🏁 FINAL ASSESSMENT:`);
        console.log(`====================`);
        console.log(`Protocol communication: ${successful.length > 5 ? '✅ Working' : '❌ Issues'}`);
        console.log(`ON-AIR tally: ${tallyOnStatus && tallyOffStatus && tallyOnStatus.analysis.hex !== tallyOffStatus.analysis.hex ? '✅ Working' : '❌ Not working'}`);
        console.log(`Elevator movement: ${elevatorWorking ? '✅ Working' : '❌ Not detected'}`);
        
        return results;
    }
    
    /**
     * Run the comprehensive test
     */
    static async runComprehensiveTest(portPath, cartAddress = 0x01) {
        console.log('🎬 FlexiCart Protocol Analysis - SINGLE CONNECTION');
        console.log('==================================================');
        console.log(`Port: ${portPath}`);
        console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
        console.log(`Protocol: 38400 baud, 8E1\n`);
        
        try {
            await this.testWithSingleConnection(portPath, cartAddress);
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
        }
    }
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
const cartAddr = process.argv[3] ? parseInt(process.argv[3], 16) : 0x01;

FlexiCartProtocolTest.runComprehensiveTest(portPath, cartAddr);