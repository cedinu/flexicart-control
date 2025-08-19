/**
 * FlexiCart Protocol Re-Analysis - Based on Pages 12-18
 * Correcting command formats and register access
 */

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

// Corrected FlexiCart Commands (based on documentation pages 12-18)
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
    
    // Page 61: Status Request (Cassette Console Status Return)
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
 * Parse Cassette Console Status (Page 61)
 */
function parseCassetteStatus(response) {
    if (!response || response.length < 9) {
        return { error: 'Invalid response length' };
    }
    
    // Extract status bytes based on page 61 format
    const status = {
        stx: response[0],
        bc: response[1], 
        ua1: response[2],
        ua2: response[3],
        bt: response[4],
        cmd: response[5],
        statusByte1: response[6],
        statusByte2: response[7],
        checksum: response[8]
    };
    
    // Decode status bits (from page 61)
    const elevatorStatus = {
        elevatorPosition: (status.statusByte1 & 0x0F),    // Lower 4 bits = position
        elevatorMoving: !!(status.statusByte1 & 0x10),    // Bit 4 = moving
        elevatorError: !!(status.statusByte1 & 0x20),     // Bit 5 = error
        onAirTally: !!(status.statusByte2 & 0x01),        // Bit 0 = ON-AIR tally
        cassetteLoaded: !!(status.statusByte2 & 0x02),    // Bit 1 = cassette present
        systemReady: !!(status.statusByte2 & 0x80)        // Bit 7 = system ready
    };
    
    return {
        raw: status,
        elevator: elevatorStatus,
        interpretation: interpretElevatorStatus(elevatorStatus)
    };
}

function interpretElevatorStatus(status) {
    let description = [];
    
    description.push(`Elevator at position ${status.elevatorPosition}`);
    
    if (status.elevatorMoving) {
        description.push('MOVING');
    } else {
        description.push('STOPPED');
    }
    
    if (status.onAirTally) {
        description.push('ON-AIR ACTIVE');
    }
    
    if (status.cassetteLoaded) {
        description.push('CASSETTE LOADED');
    }
    
    if (status.elevatorError) {
        description.push('ERROR');
    }
    
    if (status.systemReady) {
        description.push('SYSTEM READY');
    }
    
    return description.join(' | ');
}

/**
 * FlexiCart Protocol Test - Following Documentation Pages 12-18, 58, 61
 */

const { SerialPort } = require('serialport');

class FlexiCartProtocolTest {
    
    static config = {
        baudRate: 38400,
        dataBits: 8,
        parity: 'even',
        stopBits: 1
    };
    
    /**
     * Step 1: Test ON-AIR Tally (verify command/response format)
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
            if (onResponse.success) {
                console.log(`   Data: ${onResponse.response.toString('hex').toUpperCase()}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check status
            console.log('\n📊 Checking status after tally ON...');
            const statusCmd = createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.CASSETTE_STATUS);
            const statusResponse1 = await this.sendCommand(portPath, statusCmd, 3000);
            
            if (statusResponse1.success) {
                const status1 = parseCassetteStatus(statusResponse1.response);
                console.log(`   Status: ${status1.interpretation}`);
                console.log(`   ON-AIR Tally: ${status1.elevator.onAirTally ? '🔴 ON' : '⚫ OFF'}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Turn ON-AIR tally OFF
            console.log('\n📤 Turning ON-AIR tally OFF...');
            const tallyOffCmd = createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.ON_AIR_TALLY_OFF);
            console.log(`   Command: ${tallyOffCmd.toString('hex').toUpperCase()}`);
            
            const offResponse = await this.sendCommand(portPath, tallyOffCmd, 3000);
            console.log(`   Response: ${offResponse.success ? '✅ SUCCESS' : '❌ FAILED'}`);
            if (offResponse.success) {
                console.log(`   Data: ${offResponse.response.toString('hex').toUpperCase()}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check status again
            console.log('\n📊 Checking status after tally OFF...');
            const statusResponse2 = await this.sendCommand(portPath, statusCmd, 3000);
            
            if (statusResponse2.success) {
                const status2 = parseCassetteStatus(statusResponse2.response);
                console.log(`   Status: ${status2.interpretation}`);
                console.log(`   ON-AIR Tally: ${status2.elevator.onAirTally ? '🔴 ON' : '⚫ OFF'}`);
                
                return {
                    tallyWorking: status1.elevator.onAirTally && !status2.elevator.onAirTally,
                    commandsWorking: onResponse.success && offResponse.success,
                    statusWorking: statusResponse1.success && statusResponse2.success
                };
            }
            
        } catch (error) {
            console.log(`❌ ON-AIR Tally test failed: ${error.message}`);
            return { error: error.message };
        }
    }
    
    /**
     * Step 2: Test Elevator Movement (Page 58 commands with Page 61 status)
     */
    static async testElevatorMovement(portPath, cartAddress = 0x01) {
        console.log('\n🏗️ Step 2: Elevator Movement Test');
        console.log('==================================');
        console.log('Testing elevator move commands with proper status checking\n');
        
        try {
            // Get initial position
            console.log('📊 Getting initial elevator position...');
            const statusCmd = createFlexiCartCommand(cartAddress, FLEXICART_COMMANDS.CASSETTE_STATUS);
            const initialStatusResponse = await this.sendCommand(portPath, statusCmd, 3000);
            
            if (!initialStatusResponse.success) {
                console.log('❌ Cannot get initial status');
                return { error: 'Status check failed' };
            }
            
            const initialStatus = parseCassetteStatus(initialStatusResponse.response);
            console.log(`   Initial position: ${initialStatus.elevator.elevatorPosition}`);
            console.log(`   Initial status: ${initialStatus.interpretation}`);
            
            const movements = [
                { name: 'MOVE_UP', command: FLEXICART_COMMANDS.ELEVATOR_MOVE_UP, direction: 'UP' },
                { name: 'MOVE_DOWN', command: FLEXICART_COMMANDS.ELEVATOR_MOVE_DOWN, direction: 'DOWN' }
            ];
            
            const results = [];
            
            for (const movement of movements) {
                console.log(`\n🔄 Testing: ${movement.name} (${movement.direction})`);
                console.log(`   Description: ${movement.command.description}`);
                
                // Send movement command
                const moveCmd = createFlexiCartCommand(cartAddress, movement.command);
                console.log(`   📤 Command: ${moveCmd.toString('hex').toUpperCase()}`);
                
                const moveResponse = await this.sendCommand(portPath, moveCmd, 5000);
                console.log(`   📥 Response: ${moveResponse.success ? '✅ ACCEPTED' : '❌ REJECTED'}`);
                
                if (moveResponse.success) {
                    console.log(`   📊 Response data: ${moveResponse.response.toString('hex').toUpperCase()}`);
                    
                    // Wait for movement to complete
                    console.log('   ⏳ Waiting for movement (5 seconds)...');
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    // Check new position
                    console.log('   📊 Checking new position...');
                    const newStatusResponse = await this.sendCommand(portPath, statusCmd, 3000);
                    
                    if (newStatusResponse.success) {
                        const newStatus = parseCassetteStatus(newStatusResponse.response);
                        console.log(`   📍 New position: ${newStatus.elevator.elevatorPosition}`);
                        console.log(`   📊 New status: ${newStatus.interpretation}`);
                        
                        const actualMovement = newStatus.elevator.elevatorPosition !== initialStatus.elevator.elevatorPosition;
                        console.log(`   🏃 Physical movement: ${actualMovement ? '✅ YES' : '❌ NO'}`);
                        
                        results.push({
                            command: movement.name,
                            direction: movement.direction,
                            commandAccepted: moveResponse.success,
                            positionBefore: initialStatus.elevator.elevatorPosition,
                            positionAfter: newStatus.elevator.elevatorPosition,
                            actualMovement: actualMovement,
                            movingFlag: newStatus.elevator.elevatorMoving
                        });
                        
                        // Update initial status for next test
                        initialStatus.elevator.elevatorPosition = newStatus.elevator.elevatorPosition;
                        
                    } else {
                        console.log('   ❌ Cannot check new position');
                    }
                } else {
                    console.log(`   ❌ Command rejected: ${moveResponse.error}`);
                }
                
                // Delay between movements
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
            
            // Summary
            console.log('\n📋 Movement Test Results:');
            console.log('==========================');
            
            results.forEach((result, index) => {
                console.log(`${index + 1}. ${result.command} (${result.direction}):`);
                console.log(`   Command accepted: ${result.commandAccepted ? '✅' : '❌'}`);
                console.log(`   Position change: ${result.positionBefore} → ${result.positionAfter}`);
                console.log(`   Physical movement: ${result.actualMovement ? '✅ YES' : '❌ NO'}`);
            });
            
            const workingCommands = results.filter(r => r.commandAccepted && r.actualMovement);
            console.log(`\n🎯 Working movement commands: ${workingCommands.length}/${results.length}`);
            
            if (workingCommands.length > 0) {
                console.log('✅ FlexiCart elevator movement is functional!');
            } else {
                console.log('⚠️ No physical movement detected - check mechanical constraints');
            }
            
            return results;
            
        } catch (error) {
            console.log(`❌ Elevator movement test failed: ${error.message}`);
            return { error: error.message };
        }
    }
    
    /**
     * Send command with proper protocol handling
     */
    static async sendCommand(portPath, command, timeout = 3000) {
        return new Promise((resolve) => {
            let port;
            let responseBuffer = Buffer.alloc(0);
            let resolved = false;
            
            const cleanup = (result) => {
                if (resolved) return;
                resolved = true;
                
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
                        
                        setTimeout(() => {
                            cleanup({
                                success: responseBuffer.length > 0,
                                response: responseBuffer,
                                length: responseBuffer.length
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
     * Run comprehensive protocol test
     */
    static async runComprehensiveTest(portPath, cartAddress = 0x01) {
        console.log('🎬 FlexiCart Protocol Comprehensive Test');
        console.log('=======================================');
        console.log('Following documentation pages 12-18, 58, 61\n');
        console.log(`Port: ${portPath}`);
        console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
        console.log(`Protocol: 38400 baud, 8E1\n`);
        
        try {
            // Step 1: Test ON-AIR tally (verify protocol works)
            const tallyResults = await this.testOnAirTally(portPath, cartAddress);
            
            if (tallyResults.error) {
                console.log('❌ Basic protocol test failed - aborting');
                return;
            }
            
            if (tallyResults.commandsWorking) {
                console.log('✅ Protocol verification successful - commands accepted');
                
                // Step 2: Test elevator movement
                const movementResults = await this.testElevatorMovement(portPath, cartAddress);
                
                if (movementResults.error) {
                    console.log('❌ Movement test failed');
                } else {
                    console.log('✅ Movement test completed');
                }
                
                // Final summary
                console.log('\n🏁 FINAL RESULTS');
                console.log('================');
                console.log(`Protocol working: ${tallyResults.commandsWorking ? '✅' : '❌'}`);
                console.log(`Status checking: ${tallyResults.statusWorking ? '✅' : '❌'}`);
                console.log(`ON-AIR tally: ${tallyResults.tallyWorking ? '✅' : '❌'}`);
                
                if (Array.isArray(movementResults)) {
                    const workingMovements = movementResults.filter(r => r.actualMovement);
                    console.log(`Physical movement: ${workingMovements.length > 0 ? '✅' : '❌'}`);
                }
                
            } else {
                console.log('❌ Protocol verification failed - check connections and settings');
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