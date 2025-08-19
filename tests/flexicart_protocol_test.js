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
        interpretation: 'Unknown response format'
    };
    
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

function analyzeResponsePattern(response) {
    const hex = response.toString('hex').toUpperCase();
    
    // Look for common patterns
    if (hex.includes('00')) {
        return 'Contains null bytes - possible status data';
    }
    if (hex.includes('54')) {
        return 'Contains 0x54 pattern - possible acknowledgment';
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
     * Step 1: Test ON-AIR Tally with proper error handling
     */
    static async testOnAirTally(portPath, cartAddress = 0x01) {
        console.log('🚨 Step 1: ON-AIR Tally Test');
        console.log('============================');
        console.log(`Testing ON-AIR tally to verify command/response format\n`);
        
        try {
            // Turn ON-AIR tally ON
            console.log('📤 Turning ON-AIR tally ON...');
            const tallyOnCmd = createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.ON_AIR_TALLY_ON);
            console.log(`   Command: ${tallyOnCmd.toString('hex').toUpperCase()}`);
            
            const onResponse = await this.sendCommand(portPath, tallyOnCmd, 3000);
            console.log(`   Response: ${onResponse.success ? '✅ SUCCESS' : '❌ FAILED'}`);
            
            let onAnalysis = null;
            if (onResponse.success) {
                onAnalysis = parseFlexiCartResponse(onResponse.response);
                console.log(`   Analysis: ${onAnalysis.interpretation}`);
            } else {
                console.log(`   Error: ${onResponse.error || 'Unknown error'}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check status after tally ON
            console.log('\n📊 Checking status after tally ON...');
            const statusCmd = createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.CASSETTE_STATUS);
            const statusResponse1 = await this.sendCommand(portPath, statusCmd, 3000);
            
            let status1Analysis = null;
            if (statusResponse1.success) {
                status1Analysis = parseFlexiCartResponse(statusResponse1.response);
                console.log(`   Status analysis: ${status1Analysis.interpretation}`);
            } else {
                console.log(`   Status check failed: ${statusResponse1.error || 'Unknown error'}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Turn ON-AIR tally OFF
            console.log('\n📤 Turning ON-AIR tally OFF...');
            const tallyOffCmd = createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.ON_AIR_TALLY_OFF);
            console.log(`   Command: ${tallyOffCmd.toString('hex').toUpperCase()}`);
            
            const offResponse = await this.sendCommand(portPath, tallyOffCmd, 3000);
            console.log(`   Response: ${offResponse.success ? '✅ SUCCESS' : '❌ FAILED'}`);
            
            let offAnalysis = null;
            if (offResponse.success) {
                offAnalysis = parseFlexiCartResponse(offResponse.response);
                console.log(`   Analysis: ${offAnalysis.interpretation}`);
            } else {
                console.log(`   Error: ${offResponse.error || 'Unknown error'}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check status after tally OFF
            console.log('\n📊 Checking status after tally OFF...');
            const statusResponse2 = await this.sendCommand(portPath, statusCmd, 3000);
            
            let status2Analysis = null;
            if (statusResponse2.success) {
                status2Analysis = parseFlexiCartResponse(statusResponse2.response);
                console.log(`   Status analysis: ${status2Analysis.interpretation}`);
            } else {
                console.log(`   Status check failed: ${statusResponse2.error || 'Unknown error'}`);
            }
            
            // Return results with proper error handling
            return {
                tallyOnWorking: onResponse.success && onAnalysis && onAnalysis.valid,
                tallyOffWorking: offResponse.success && offAnalysis && offAnalysis.valid,
                commandsWorking: onResponse.success || offResponse.success,
                statusWorking: statusResponse1.success || statusResponse2.success,
                onResponseData: onAnalysis ? onAnalysis.hex : null,
                offResponseData: offAnalysis ? offAnalysis.hex : null,
                error: null
            };
            
        } catch (error) {
            console.log(`❌ ON-AIR Tally test failed: ${error.message}`);
            return { 
                error: error.message,
                commandsWorking: false,
                statusWorking: false
            };
        }
    }
    
    /**
     * Step 2: Test Basic Status Reading
     */
    static async testBasicStatus(portPath, cartAddress = 0x01) {
        console.log('\n📊 Step 2: Basic Status Test');
        console.log('============================');
        console.log('Testing basic status reading to understand response format\n');
        
        try {
            for (let i = 0; i < 3; i++) {
                console.log(`📊 Status request ${i + 1}/3:`);
                
                const statusCmd = createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.CASSETTE_STATUS);
                console.log(`   Command: ${statusCmd.toString('hex').toUpperCase()}`);
                
                const statusResponse = await this.sendCommand(portPath, statusCmd, 3000);
                
                if (statusResponse.success) {
                    const analysis = parseFlexiCartResponse(statusResponse.response);
                    console.log(`   ✅ Response received: ${analysis.interpretation}`);
                    
                    // Try to extract meaningful data
                    if (analysis.valid && analysis.format === 'Standard FlexiCart') {
                        console.log(`   📋 Command: 0x${analysis.cmd.toString(16).toUpperCase()}`);
                        console.log(`   📋 Data1: 0x${analysis.data1.toString(16).toUpperCase()}`);
                        console.log(`   📋 Data2: 0x${analysis.data2.toString(16).toUpperCase()}`);
                    }
                } else {
                    console.log(`   ❌ No response: ${statusResponse.error || 'Unknown error'}`);
                }
                
                if (i < 2) {
                    console.log('   ⏳ Waiting 2 seconds...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
        } catch (error) {
            console.log(`❌ Status test failed: ${error.message}`);
            return { error: error.message };
        }
    }
    
    /**
     * Step 3: Test Elevator Movement with detailed analysis
     */
    static async testElevatorMovement(portPath, cartAddress = 0x01) {
        console.log('\n🏗️ Step 3: Elevator Movement Test');
        console.log('==================================');
        console.log('Testing elevator move commands with detailed response analysis\n');
        
        try {
            const movements = [
                { name: 'MOVE_UP', command: FLEXICART_COMMANDS.ELEVATOR_MOVE_UP },
                { name: 'MOVE_DOWN', command: FLEXICART_COMMANDS.ELEVATOR_MOVE_DOWN }
            ];
            
            const results = [];
            
            for (const movement of movements) {
                console.log(`🔄 Testing: ${movement.name}`);
                console.log(`   Description: ${movement.command.description}`);
                
                // Send movement command
                const moveCmd = createFlexiCartCommand(cartAddress, movement.command);
                console.log(`   📤 Command: ${moveCmd.toString('hex').toUpperCase()}`);
                
                const moveResponse = await this.sendCommand(portPath, moveCmd, 5000);
                console.log(`   📥 Response: ${moveResponse.success ? '✅ RECEIVED' : '❌ NO RESPONSE'}`);
                
                let moveAnalysis = null;
                if (moveResponse.success) {
                    moveAnalysis = parseFlexiCartResponse(moveResponse.response);
                    console.log(`   📊 Analysis: ${moveAnalysis.interpretation}`);
                    
                    // Wait and check if anything changed
                    console.log('   ⏳ Waiting for movement (3 seconds)...');
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    
                    // Check status after movement
                    console.log('   📊 Checking post-movement status...');
                    const statusCmd = createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.CASSETTE_STATUS);
                    const postStatusResponse = await this.sendCommand(portPath, statusCmd, 3000);
                    
                    if (postStatusResponse.success) {
                        const postAnalysis = parseFlexiCartResponse(postStatusResponse.response);
                        console.log(`   📋 Post-movement status: ${postAnalysis.interpretation}`);
                        
                        results.push({
                            command: movement.name,
                            commandSent: true,
                            responseReceived: true,
                            responseData: moveAnalysis.hex,
                            statusCheck: true,
                            statusData: postAnalysis.hex
                        });
                    } else {
                        results.push({
                            command: movement.name,
                            commandSent: true,
                            responseReceived: true,
                            responseData: moveAnalysis.hex,
                            statusCheck: false,
                            error: 'Status check failed'
                        });
                    }
                } else {
                    console.log(`   ❌ No response: ${moveResponse.error || 'Unknown error'}`);
                    results.push({
                        command: movement.name,
                        commandSent: true,
                        responseReceived: false,
                        error: moveResponse.error || 'No response'
                    });
                }
                
                console.log('   ⏳ Waiting between tests...');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // Summary
            console.log('\n📋 Movement Test Summary:');
            console.log('=========================');
            
            results.forEach((result, index) => {
                console.log(`${index + 1}. ${result.command}:`);
                console.log(`   Command sent: ${result.commandSent ? '✅' : '❌'}`);
                console.log(`   Response received: ${result.responseReceived ? '✅' : '❌'}`);
                if (result.responseData) {
                    console.log(`   Response data: ${result.responseData}`);
                }
                if (result.statusCheck) {
                    console.log(`   Status check: ✅`);
                    if (result.statusData) {
                        console.log(`   Status data: ${result.statusData}`);
                    }
                } else if (result.error) {
                    console.log(`   Error: ${result.error}`);
                }
            });
            
            return results;
            
        } catch (error) {
            console.log(`❌ Elevator movement test failed: ${error.message}`);
            return { error: error.message };
        }
    }
    
    /**
     * Send command with improved error handling
     */
    static async sendCommand(portPath, command, timeout = 3000) {
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
                    port.close(() => resolve(result));
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
     * Run comprehensive protocol test with better error handling
     */
    static async runComprehensiveTest(portPath, cartAddress = 0x01) {
        console.log('🎬 FlexiCart Protocol Analysis - FIXED VERSION');
        console.log('==============================================');
        console.log('Proper error handling and response analysis\n');
        console.log(`Port: ${portPath}`);
        console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
        console.log(`Protocol: 38400 baud, 8E1\n`);
        
        try {
            // Step 1: Test ON-AIR tally
            const tallyResults = await this.testOnAirTally(portPath, cartAddress);
            
            // Step 2: Test basic status reading
            await this.testBasicStatus(portPath, cartAddress);
            
            // Step 3: Test elevator movement
            const movementResults = await this.testElevatorMovement(portPath, cartAddress);
            
            // Final summary
            console.log('\n🏁 COMPREHENSIVE TEST RESULTS');
            console.log('==============================');
            console.log(`Commands working: ${tallyResults.commandsWorking ? '✅' : '❌'}`);
            console.log(`Status reading: ${tallyResults.statusWorking ? '✅' : '❌'}`);
            
            if (Array.isArray(movementResults)) {
                const responsiveCommands = movementResults.filter(r => r.responseReceived);
                console.log(`Movement responses: ${responsiveCommands.length}/${movementResults.length}`);
            }
            
            console.log('\n💡 Next steps:');
            console.log('1. Analyze response patterns to understand protocol');
            console.log('2. Check if movement commands need different parameters');
            console.log('3. Verify physical connections and cart readiness');
            
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
        }
    }
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
const cartAddr = process.argv[3] ? parseInt(process.argv[3], 16) : 0x01;

FlexiCartProtocolTest.runComprehensiveTest(portPath, cartAddr);