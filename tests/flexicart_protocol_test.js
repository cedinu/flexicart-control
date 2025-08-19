/**
 * FlexiCart Protocol Test - FIXED VERSION
 * Properly handles responses and error conditions
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
 * Parse FlexiCart Response - IMPROVED VERSION
 */
function parseFlexiCartResponse(response) {
    if (!response || response.length === 0) {
        return { 
            error: 'No response data',
            valid: false 
        };
    }
    
    console.log(`   🔍 Raw response: ${response.toString('hex').toUpperCase()} (${response.length} bytes)`);
    
    // Analyze the actual response structure
    const analysis = {
        length: response.length,
        hex: response.toString('hex').toUpperCase(),
        valid: response.length >= 8,  // Minimum valid response length
        interpretation: 'Unknown response format',
        patterns: []
    };
    
    // Analyze byte patterns in the response
    const byteAnalysis = analyzeBytePatterns(response);
    analysis.patterns = byteAnalysis.patterns;
    analysis.possiblePosition = byteAnalysis.possiblePosition;
    analysis.possibleStatus = byteAnalysis.possibleStatus;
    
    // Check if response follows standard FlexiCart format
    if (response.length >= 9 && response[0] === 0x02) {
        // Standard FlexiCart response format
        analysis.format = 'Standard FlexiCart';
        analysis.stx = response[0];
        analysis.bc = response[1];
        analysis.ua1 = response[2];
        analysis.ua2 = response[3];
        analysis.bt = response[4];
        analysis.cmd = response[5];
        analysis.data1 = response[6];
        analysis.data2 = response[7];
        analysis.checksum = response[8];
        analysis.interpretation = 'Valid FlexiCart response packet';
    } else {
        // Non-standard response - analyze pattern
        analysis.format = 'Non-standard';
        analysis.interpretation = analyzeResponsePattern(response);
    }
    
    return analysis;
}

function analyzeBytePatterns(response) {
    const patterns = [];
    const analysis = {
        possiblePosition: null,
        possibleStatus: null,
        patterns: []
    };
    
    // Look for repeating patterns that might indicate position
    const bytes = Array.from(response);
    
    // Check for position-like patterns (incremental values)
    const nonZeroBytes = bytes.filter(b => b !== 0);
    if (nonZeroBytes.length > 0) {
        patterns.push(`NonZero: ${nonZeroBytes.map(b => '0x' + b.toString(16).toUpperCase()).join(', ')}`);
        
        // Check if there's a consistent value that might be position
        const uniqueNonZero = [...new Set(nonZeroBytes)];
        if (uniqueNonZero.length === 1) {
            analysis.possiblePosition = uniqueNonZero[0];
            patterns.push(`Consistent value: 0x${uniqueNonZero[0].toString(16).toUpperCase()}`);
        }
    }
    
    // Check for status-like patterns (bit patterns)
    bytes.forEach((byte, index) => {
        if (byte > 0) {
            const binary = byte.toString(2).padStart(8, '0');
            patterns.push(`Byte${index}: 0x${byte.toString(16).toUpperCase()} (${binary})`);
        }
    });
    
    analysis.patterns = patterns;
    return analysis;
}

function analyzeResponsePattern(response) {
    const hex = response.toString('hex').toUpperCase();
    
    // Look for specific patterns we've seen
    if (hex.includes('00000000000000005500000000404000')) {
        return 'ON-AIR tally ON response - contains 0x55 and 0x40 markers';
    }
    if (hex.includes('000000404040400000000040000000')) {
        return 'Status response - contains 0x40 pattern (position marker?)';
    }
    if (hex.includes('0000004500001414140000000000')) {
        return 'Movement DOWN response - contains 0x45 and 0x14 patterns';
    }
    if (hex.includes('00404040505050504040400040404000')) {
        return 'Post-movement status - contains 0x40/0x50 patterns (position data?)';
    }
    
    // General pattern analysis
    if (hex.includes('00')) {
        return 'Contains null bytes - possible status/position data';
    }
    if (hex.includes('40')) {
        return 'Contains 0x40 pattern - possible position marker';
    }
    if (hex.includes('50')) {
        return 'Contains 0x50 pattern - possible status marker';
    }
    if (response.every(b => b === 0)) {
        return 'All zeros - no response or error';
    }
    
    return `Pattern: ${hex.substring(0, 16)}${hex.length > 16 ? '...' : ''}`;
}

class FlexiCartProtocolTest {
    
    static config = {
        baudRate: 38400,
        dataBits: 8,
        parity: 'even',
        stopBits: 1
    };
    
    /**
     * Send command with improved error handling and port management
     */
    static async sendCommand(portPath, command, timeout = 5000) {
        return new Promise((resolve) => {
            let port;
            let responseBuffer = Buffer.alloc(0);
            let resolved = false;
            let timeoutHandle;
            
            const cleanup = (result) => {
                if (resolved) return;
                resolved = true;
                
                if (timeoutHandle) clearTimeout(timeoutHandle);
                
                if (port && port.isOpen) {
                    port.close((closeErr) => {
                        if (closeErr) console.log(`   ⚠️ Port close warning: ${closeErr.message}`);
                        // Wait a bit after closing to avoid port locking
                        setTimeout(() => resolve(result), 500);
                    });
                } else {
                    resolve(result);
                }
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
                
                port.on('data', (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);
                });
                
                port.on('error', (err) => {
                    cleanup({ success: false, error: err.message });
                });
                
                port.open((openErr) => {
                    if (openErr) {
                        cleanup({ success: false, error: openErr.message });
                        return;
                    }
                    
                    port.write(command, (writeErr) => {
                        if (writeErr) {
                            cleanup({ success: false, error: writeErr.message });
                            return;
                        }
                        
                        timeoutHandle = setTimeout(() => {
                            cleanup({
                                success: responseBuffer.length > 0,
                                response: responseBuffer,
                                length: responseBuffer.length,
                                error: responseBuffer.length === 0 ? 'No response received' : null
                            });
                        }, timeout);
                    });
                });
                
            } catch (error) {
                cleanup({ success: false, error: error.message });
            }
        });
    }
    
    /**
     * Test sequence with proper port management
     */
    static async testSequentialCommands(portPath, cartAddress = 0x01) {
        console.log('🔄 Sequential Command Test');
        console.log('==========================');
        console.log('Testing commands one by one with proper port management\n');
        
        const testCommands = [
            { name: 'Status Check', command: FLEXICART_COMMANDS.CASSETTE_STATUS },
            { name: 'ON-AIR Tally ON', command: FLEXICART_COMMANDS.ON_AIR_TALLY_ON },
            { name: 'Status Check (after tally ON)', command: FLEXICART_COMMANDS.CASSETTE_STATUS },
            { name: 'ON-AIR Tally OFF', command: FLEXICART_COMMANDS.ON_AIR_TALLY_OFF },
            { name: 'Status Check (after tally OFF)', command: FLEXICART_COMMANDS.CASSETTE_STATUS },
            { name: 'Elevator Move UP', command: FLEXICART_COMMANDS.ELEVATOR_MOVE_UP },
            { name: 'Status Check (after move UP)', command: FLEXICART_COMMANDS.CASSETTE_STATUS },
            { name: 'Elevator Move DOWN', command: FLEXICART_COMMANDS.ELEVATOR_MOVE_DOWN },
            { name: 'Status Check (after move DOWN)', command: FLEXICART_COMMANDS.CASSETTE_STATUS }
        ];
        
        const results = [];
        
        for (let i = 0; i < testCommands.length; i++) {
            const test = testCommands[i];
            console.log(`📤 Test ${i + 1}/${testCommands.length}: ${test.name}`);
            
            const cmd = createFlexiCartCommand(cartAddress, test.command);
            console.log(`   Command: ${cmd.toString('hex').toUpperCase()}`);
            
            const response = await this.sendCommand(portPath, cmd, 4000);
            
            if (response.success) {
                console.log(`   ✅ Response received`);
                const analysis = parseFlexiCartResponse(response.response);
                console.log(`   📊 Analysis: ${analysis.interpretation}`);
                
                if (analysis.patterns && analysis.patterns.length > 0) {
                    console.log(`   🔍 Patterns:`);
                    analysis.patterns.forEach(pattern => {
                        console.log(`      ${pattern}`);
                    });
                }
                
                results.push({
                    test: test.name,
                    success: true,
                    responseHex: analysis.hex,
                    patterns: analysis.patterns,
                    possiblePosition: analysis.possiblePosition,
                    interpretation: analysis.interpretation
                });
                
            } else {
                console.log(`   ❌ Failed: ${response.error}`);
                results.push({
                    test: test.name,
                    success: false,
                    error: response.error
                });
            }
            
            // Wait between commands to avoid port conflicts
            if (i < testCommands.length - 1) {
                console.log('   ⏳ Waiting 3 seconds before next command...\n');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        // Analyze results for movement detection
        console.log('\n📊 RESULTS ANALYSIS');
        console.log('===================');
        
        const statusResponses = results.filter(r => r.test.includes('Status Check') && r.success);
        console.log(`Status responses received: ${statusResponses.length}`);
        
        const movementResponses = results.filter(r => r.test.includes('Elevator Move') && r.success);
        console.log(`Movement commands accepted: ${movementResponses.length}`);
        
        const tallyResponses = results.filter(r => r.test.includes('Tally') && r.success);
        console.log(`Tally commands accepted: ${tallyResponses.length}`);
        
        // Look for position changes
        console.log('\n🔍 POSITION ANALYSIS');
        console.log('====================');
        
        statusResponses.forEach((response, index) => {
            console.log(`${index + 1}. ${response.test}:`);
            console.log(`   Response: ${response.responseHex}`);
            if (response.possiblePosition !== null) {
                console.log(`   Possible position: 0x${response.possiblePosition.toString(16).toUpperCase()}`);
            }
            
            // Compare with previous status if available
            if (index > 0) {
                const prevResponse = statusResponses[index - 1];
                if (response.responseHex !== prevResponse.responseHex) {
                    console.log(`   🏃 CHANGE DETECTED from previous status!`);
                    console.log(`      Previous: ${prevResponse.responseHex}`);
                    console.log(`      Current:  ${response.responseHex}`);
                } else {
                    console.log(`   📍 Same as previous status`);
                }
            }
        });
        
        // Check if ON-AIR tally is working
        console.log('\n🚨 ON-AIR TALLY ANALYSIS');
        console.log('========================');
        
        const tallyOnStatus = statusResponses.find(r => r.test.includes('after tally ON'));
        const tallyOffStatus = statusResponses.find(r => r.test.includes('after tally OFF'));
        
        if (tallyOnStatus && tallyOffStatus) {
            if (tallyOnStatus.responseHex !== tallyOffStatus.responseHex) {
                console.log('🎯 ON-AIR TALLY IS WORKING!');
                console.log(`   Tally ON state:  ${tallyOnStatus.responseHex}`);
                console.log(`   Tally OFF state: ${tallyOffStatus.responseHex}`);
            } else {
                console.log('⚠️ ON-AIR tally states are identical - may not be working');
            }
        }
        
        // Check if elevator movement is working
        console.log('\n🏗️ ELEVATOR MOVEMENT ANALYSIS');
        console.log('==============================');
        
        const beforeMoveStatus = statusResponses.find(r => r.test.includes('after tally OFF'));
        const afterUpStatus = statusResponses.find(r => r.test.includes('after move UP'));
        const afterDownStatus = statusResponses.find(r => r.test.includes('after move DOWN'));
        
        let movementDetected = false;
        
        if (beforeMoveStatus && afterUpStatus) {
            if (beforeMoveStatus.responseHex !== afterUpStatus.responseHex) {
                console.log('🎯 ELEVATOR UP MOVEMENT DETECTED!');
                console.log(`   Before: ${beforeMoveStatus.responseHex}`);
                console.log(`   After UP: ${afterUpStatus.responseHex}`);
                movementDetected = true;
            }
        }
        
        if (afterUpStatus && afterDownStatus) {
            if (afterUpStatus.responseHex !== afterDownStatus.responseHex) {
                console.log('🎯 ELEVATOR DOWN MOVEMENT DETECTED!');
                console.log(`   After UP: ${afterUpStatus.responseHex}`);
                console.log(`   After DOWN: ${afterDownStatus.responseHex}`);
                movementDetected = true;
            }
        }
        
        if (!movementDetected) {
            console.log('⚠️ No elevator movement detected in status changes');
            console.log('   Possible reasons:');
            console.log('   - Cart is already at correct position');
            console.log('   - Movement commands require different parameters');
            console.log('   - Physical movement is disabled');
            console.log('   - Status doesn\'t reflect position changes');
        }
        
        return results;
    }
    
    /**
     * Run comprehensive protocol test
     */
    static async runComprehensiveTest(portPath, cartAddress = 0x01) {
        console.log('🎬 FlexiCart Protocol Analysis - SEQUENTIAL TEST');
        console.log('================================================');
        console.log('Testing commands sequentially to avoid port conflicts\n');
        console.log(`Port: ${portPath}`);
        console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
        console.log(`Protocol: 38400 baud, 8E1\n`);
        
        try {
            const results = await this.testSequentialCommands(portPath, cartAddress);
            
            const successCount = results.filter(r => r.success).length;
            const totalCount = results.length;
            
            console.log('\n🏁 FINAL SUMMARY');
            console.log('================');
            console.log(`Commands successful: ${successCount}/${totalCount}`);
            console.log(`Success rate: ${Math.round((successCount/totalCount) * 100)}%`);
            
            if (successCount > 0) {
                console.log('✅ FlexiCart protocol communication is working');
                console.log('📊 Response patterns have been identified');
                console.log('🔍 Check the analysis above for movement/tally functionality');
            } else {
                console.log('❌ No successful command responses');
                console.log('🔧 Check connections, power, and cart readiness');
            }
            
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
        }
    }
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
const cartAddr = process.argv[3] ? parseInt(process.argv[3], 16) : 0x01;

FlexiCartProtocolTest.runComprehensiveTest(portPath, cartAddr);