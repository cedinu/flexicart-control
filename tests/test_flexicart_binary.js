/**
 * FlexiCart Binary Protocol Test - Using Correct Binary Packet Format
 */

const { sendCommand } = require('../src/commands/flexicart_serial_utils');

/**
 * FlexiCart Binary Protocol Implementation
 * Format: [STX][BC][UA1][UA2][BT][CMD][Control][DATA][CS]
 */
class FlexiCartProtocol {
    static STX = 0x02;  // Start of text
    static BC = 0x06;   // Block control
    static UA1 = 0x01;  // Unit address 1
    static UA2 = 0x00;  // Unit address 2 
    
    /**
     * Calculate checksum for FlexiCart packet
     */
    static calculateChecksum(data) {
        let sum = 0;
        for (let i = 1; i < data.length - 1; i++) { // Skip STX and CS position
            sum += data[i];
        }
        return (0x100 - (sum & 0xFF)) & 0xFF;
    }
    
    /**
     * Create FlexiCart command packet
     */
    static createCommand(bt, cmd, control = 0x00, data = 0x80) {
        const packet = Buffer.alloc(9);
        packet[0] = this.STX;   // STX
        packet[1] = this.BC;    // BC
        packet[2] = this.UA1;   // UA1
        packet[3] = this.UA2;   // UA2
        packet[4] = bt;         // BT (Block Type)
        packet[5] = cmd;        // CMD
        packet[6] = control;    // Control
        packet[7] = data;       // DATA
        packet[8] = this.calculateChecksum(packet); // CS
        
        return packet;
    }
    
    /**
     * On Air Tally Commands (from documentation)
     */
    static getOnAirTallySet() {
        // Set the Tally Lamp: control = 00H
        return this.createCommand(0x00, 0x0A, 0x00, 0x80);
    }
    
    static getOnAirTallyReset() {
        // Reset the Tally Lamp: control = 01H
        return this.createCommand(0x00, 0x0A, 0x01, 0x80);
    }
    
    /**
     * Status Query Commands
     */
    static getSenseCartStatus() {
        return this.createCommand(0x00, 0x61, 0x00, 0x80);
    }
    
    static getSenseCCStatus() {
        return this.createCommand(0x01, 0x61, 0x00, 0x80);
    }
    
    static getSenseBinStatus() {
        return this.createCommand(0x01, 0x62, 0x00, 0x80);
    }
    
    /**
     * Movement Commands
     */
    static getCassetteMove(slotNumber) {
        return this.createCommand(0x01, 0x10, slotNumber, 0x80);
    }
    
    static getElevatorMove(slotNumber) {
        return this.createCommand(0x01, 0x14, slotNumber, 0x80);
    }
    
    static getElevatorInitialize() {
        return this.createCommand(0x01, 0x1D, 0x00, 0x80);
    }
    
    /**
     * Lamp and Buzzer Commands
     */
    static getSetBinLamp(control = 0x00) {
        return this.createCommand(0x01, 0x09, control, 0x80);
    }
    
    static getSetBuzzer(control = 0x00) {
        return this.createCommand(0x01, 0x0B, control, 0x80);
    }
    
    /**
     * System Commands
     */
    static getSystemReset() {
        return this.createCommand(0x00, 0x00, 0x00, 0x80);
    }
    
    static getDummy() {
        return this.createCommand(0x00, 0x50, 0x00, 0x80);
    }
}

/**
 * Test FlexiCart with correct binary protocol
 */
async function testFlexiCartBinary(portPath) {
    console.log(`📀 FlexiCart Binary Protocol Test`);
    console.log(`================================`);
    console.log(`Using correct binary packet format from documentation`);
    console.log(`Port: ${portPath}`);
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    const results = {
        workingCommands: [],
        statusChanges: [],
        acknowledgments: []
    };
    
    try {
        // Test 1: System Reset and Dummy command
        console.log(`🔄 Phase 1: System Commands`);
        console.log(`---------------------------`);
        
        const systemTests = [
            { name: 'SYSTEM_RESET', cmd: FlexiCartProtocol.getSystemReset(), desc: 'System Reset' },
            { name: 'DUMMY', cmd: FlexiCartProtocol.getDummy(), desc: 'Dummy Command' }
        ];
        
        for (const test of systemTests) {
            console.log(`\n🧪 Testing: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
            console.log(`   📊 Breakdown: STX=${test.cmd[0].toString(16)} BC=${test.cmd[1].toString(16)} UA1=${test.cmd[2].toString(16)} UA2=${test.cmd[3].toString(16)} BT=${test.cmd[4].toString(16)} CMD=${test.cmd[5].toString(16)} CTL=${test.cmd[6].toString(16)} DATA=${test.cmd[7].toString(16)} CS=${test.cmd[8].toString(16)}`);
            
            try {
                const response = await sendCommand(portPath, test.cmd, 5000, false);
                console.log(`   📥 Response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response hex: ${response.toString('hex').toUpperCase()}`);
                    
                    // Check for ACK (04H) or NAK (05H)
                    if (response.includes(0x04)) {
                        console.log(`   ✅ ACK received - Command accepted!`);
                        results.acknowledgments.push({ command: test.name, type: 'ACK' });
                    } else if (response.includes(0x05)) {
                        console.log(`   ❌ NAK received - Command rejected`);
                        results.acknowledgments.push({ command: test.name, type: 'NAK' });
                    } else {
                        console.log(`   📊 Other response received`);
                    }
                }
                
                results.workingCommands.push({
                    name: test.name,
                    command: test.cmd.toString('hex'),
                    responseLength: response.length,
                    success: true
                });
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Test 2: Status Queries
        console.log(`\n\n📊 Phase 2: Status Queries`);
        console.log(`--------------------------`);
        
        const statusTests = [
            { name: 'SENSE_CART_STATUS', cmd: FlexiCartProtocol.getSenseCartStatus(), desc: 'Sense Cart Status' },
            { name: 'SENSE_CC_STATUS', cmd: FlexiCartProtocol.getSenseCCStatus(), desc: 'Sense C.C. Status' },
            { name: 'SENSE_BIN_STATUS', cmd: FlexiCartProtocol.getSenseBinStatus(), desc: 'Sense Bin Status' }
        ];
        
        let initialStatus = {};
        
        for (const test of statusTests) {
            console.log(`\n🧪 Testing: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
            
            try {
                const response = await sendCommand(portPath, test.cmd, 5000, false);
                console.log(`   📥 Response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response hex: ${response.toString('hex').toUpperCase()}`);
                    initialStatus[test.name] = response.toString('hex');
                    
                    // Look for meaningful status data
                    const meaningfulBytes = response.filter(b => b !== 0x55 && b !== 0x00);
                    if (meaningfulBytes.length > 0) {
                        console.log(`   📊 Status data: ${meaningfulBytes.slice(0, 10).toString('hex').toUpperCase()}`);
                    }
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        // Test 3: On Air Tally Commands
        console.log(`\n\n🚨 Phase 3: On Air Tally Commands`);
        console.log(`---------------------------------`);
        
        const onAirTests = [
            { 
                name: 'ON_AIR_TALLY_SET', 
                cmd: FlexiCartProtocol.getOnAirTallySet(), 
                desc: 'Set On Air Tally (control=00H)',
                expect: 'Turn ON Air tally ON'
            },
            { 
                name: 'ON_AIR_TALLY_RESET', 
                cmd: FlexiCartProtocol.getOnAirTallyReset(), 
                desc: 'Reset On Air Tally (control=01H)',
                expect: 'Turn ON Air tally OFF'
            }
        ];
        
        for (const test of onAirTests) {
            console.log(`\n🧪 Testing: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
            console.log(`   🎯 Expected: ${test.expect}`);
            console.log(`   👀 Watch for LED changes on the device...`);
            
            try {
                const response = await sendCommand(portPath, test.cmd, 5000, false);
                console.log(`   📥 Response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response hex: ${response.toString('hex').toUpperCase()}`);
                    
                    if (response.includes(0x04)) {
                        console.log(`   ✅ ACK - On Air command accepted!`);
                        console.log(`   💡 Check device for LED changes!`);
                    } else if (response.includes(0x05)) {
                        console.log(`   ❌ NAK - On Air command rejected`);
                    }
                }
                
                // Wait and check status
                console.log(`   ⏳ Waiting 5 seconds for visual changes...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Check if status changed
                const statusAfter = await getStatusAfterCommand(portPath);
                const statusChanged = JSON.stringify(initialStatus) !== JSON.stringify(statusAfter);
                
                if (statusChanged) {
                    console.log(`   🎉 STATUS CHANGE DETECTED!`);
                    results.statusChanges.push({
                        command: test.name,
                        before: initialStatus,
                        after: statusAfter
                    });
                } else {
                    console.log(`   ⏸️  No status change in response data`);
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Test 4: Lamp and Buzzer Controls
        console.log(`\n\n💡 Phase 4: Lamp and Buzzer Controls`);
        console.log(`------------------------------------`);
        
        const controlTests = [
            { name: 'SET_BIN_LAMP_ON', cmd: FlexiCartProtocol.getSetBinLamp(0x01), desc: 'Turn Bin Lamp ON' },
            { name: 'SET_BIN_LAMP_OFF', cmd: FlexiCartProtocol.getSetBinLamp(0x00), desc: 'Turn Bin Lamp OFF' },
            { name: 'SET_BUZZER_ON', cmd: FlexiCartProtocol.getSetBuzzer(0x01), desc: 'Turn Buzzer ON' },
            { name: 'SET_BUZZER_OFF', cmd: FlexiCartProtocol.getSetBuzzer(0x00), desc: 'Turn Buzzer OFF' }
        ];
        
        for (const test of controlTests) {
            console.log(`\n🧪 Testing: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
            
            try {
                const response = await sendCommand(portPath, test.cmd, 5000, false);
                console.log(`   📥 Response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response hex: ${response.toString('hex').toUpperCase()}`);
                    
                    if (response.includes(0x04)) {
                        console.log(`   ✅ ACK - Control command accepted!`);
                        if (test.name.includes('BUZZER')) {
                            console.log(`   🔊 Listen for buzzer sound!`);
                        } else {
                            console.log(`   💡 Check for lamp changes!`);
                        }
                    }
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        // Test 5: Movement Commands (if previous tests showed ACKs)
        if (results.acknowledgments.some(ack => ack.type === 'ACK')) {
            console.log(`\n\n🏃 Phase 5: Movement Commands`);
            console.log(`-----------------------------`);
            console.log(`Previous commands showed ACKs - testing movement...`);
            
            const movementTests = [
                { name: 'ELEVATOR_INIT', cmd: FlexiCartProtocol.getElevatorInitialize(), desc: 'Initialize Elevator' },
                { name: 'CASSETTE_MOVE_1', cmd: FlexiCartProtocol.getCassetteMove(1), desc: 'Move Cassette to Slot 1' },
                { name: 'ELEVATOR_MOVE_1', cmd: FlexiCartProtocol.getElevatorMove(1), desc: 'Move Elevator to Slot 1' },
                { name: 'CASSETTE_MOVE_0', cmd: FlexiCartProtocol.getCassetteMove(0), desc: 'Move Cassette Home' }
            ];
            
            for (const test of movementTests) {
                console.log(`\n🧪 Testing Movement: ${test.name}`);
                console.log(`   📋 ${test.desc}`);
                console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
                
                try {
                    const response = await sendCommand(portPath, test.cmd, 10000, false);
                    console.log(`   📥 Response: ${response.length} bytes`);
                    
                    if (response.length > 0) {
                        console.log(`   📊 Response hex: ${response.toString('hex').toUpperCase()}`);
                        
                        if (response.includes(0x04)) {
                            console.log(`   ✅ ACK - Movement command accepted!`);
                            console.log(`   🏃 Check for physical movement!`);
                        }
                    }
                    
                    console.log(`   ⏳ Waiting 10 seconds for movement...`);
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    
                } catch (error) {
                    console.log(`   ❌ Movement error: ${error.message}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        // Summary
        console.log(`\n\n📊 Binary Protocol Test Results`);
        console.log(`===============================`);
        console.log(`Commands tested: ${results.workingCommands.length}`);
        console.log(`ACK responses: ${results.acknowledgments.filter(a => a.type === 'ACK').length}`);
        console.log(`NAK responses: ${results.acknowledgments.filter(a => a.type === 'NAK').length}`);
        console.log(`Status changes: ${results.statusChanges.length}`);
        
        if (results.acknowledgments.some(ack => ack.type === 'ACK')) {
            console.log(`\n🎉 SUCCESS! FlexiCart is responding with ACK messages!`);
            console.log(`\n✅ Commands that received ACK:`);
            results.acknowledgments
                .filter(ack => ack.type === 'ACK')
                .forEach(ack => console.log(`   📋 ${ack.command}`));
            
            console.log(`\n🎯 Your FlexiCart is using the correct binary protocol!`);
            console.log(`   - Commands are being accepted (ACK responses)`);
            console.log(`   - Device communication is working`);
            console.log(`   - You can now control the FlexiCart programmatically`);
            
            // Generate working command library
            console.log(`\n🔧 Working FlexiCart Commands:`);
            console.log(`=============================`);
            console.log(`// On Air Tally`);
            console.log(`const ON_AIR_SET = Buffer.from([${FlexiCartProtocol.getOnAirTallySet().join(', ')}]);`);
            console.log(`const ON_AIR_RESET = Buffer.from([${FlexiCartProtocol.getOnAirTallyReset().join(', ')}]);`);
            console.log(`// Movement`);
            console.log(`const CASSETTE_MOVE = (slot) => Buffer.from([${FlexiCartProtocol.getCassetteMove(0).slice(0, -2).join(', ')}, slot, 0x80, checksum]);`);
            
        } else {
            console.log(`\n⚠️  No ACK responses received.`);
            console.log(`   The device may:`);
            console.log(`   - Need different unit addressing (UA1/UA2)`);
            console.log(`   - Require initialization sequence`);
            console.log(`   - Be in a different communication mode`);
            console.log(`   - Have different checksum calculation`);
        }
        
    } catch (error) {
        console.log(`❌ Binary protocol test failed: ${error.message}`);
    }
}

/**
 * Get status after command for comparison
 */
async function getStatusAfterCommand(portPath) {
    const status = {};
    
    try {
        const cartResponse = await sendCommand(portPath, FlexiCartProtocol.getSenseCartStatus(), 3000, false);
        if (cartResponse && cartResponse.length > 0) {
            status.cartStatus = cartResponse.toString('hex');
        }
        
        const binResponse = await sendCommand(portPath, FlexiCartProtocol.getSenseBinStatus(), 3000, false);
        if (binResponse && binResponse.length > 0) {
            status.binStatus = binResponse.toString('hex');
        }
    } catch (error) {
        // Ignore errors
    }
    
    return status;
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
testFlexiCartBinary(portPath);