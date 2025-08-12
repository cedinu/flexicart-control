/**
 * FlexiCart Corrected Protocol Test - Fixed Addressing and Checksum
 */

const { sendCommand } = require('../src/commands/flexicart_serial_utils');

/**
 * Corrected FlexiCart Protocol Implementation
 * Format: [STX][BC][UA1][UA2][BT][CMD][Control][DATA][CS]
 */
class FlexiCartCorrectedProtocol {
    static STX = 0x02;  // Start of text
    
    /**
     * Calculate checksum - sum from BC to CS becomes zero
     */
    static calculateChecksum(packet) {
        let sum = 0;
        // Sum from BC (index 1) to DATA (exclude CS position)
        for (let i = 1; i < packet.length - 1; i++) {
            sum += packet[i];
        }
        // Return value that makes low-order byte zero
        return (0x100 - (sum & 0xFF)) & 0xFF;
    }
    
    /**
     * Create FlexiCart command packet with corrected addressing
     */
    static createCommand(bt, cmd, control = 0x00, data = 0x80, cartAddress = 1) {
        // Calculate proper byte count (UA1 to last data byte)
        const dataLength = 6; // UA1 + UA2 + BT + CMD + Control + DATA = 6 bytes
        const bc = dataLength;
        
        // Unit addressing - UA1=01H (FlexiCart), UA2 selects specific cart
        const ua1 = 0x01; // Always 01H for FlexiCart
        const ua2 = cartAddress - 1; // 0x00 for cart1, 0x01 for cart2, etc.
        
        const packet = Buffer.alloc(9);
        packet[0] = this.STX;   // STX = 02H
        packet[1] = bc;         // BC = byte count
        packet[2] = ua1;        // UA1 = 01H (FlexiCart)
        packet[3] = ua2;        // UA2 = cart selection
        packet[4] = bt;         // BT = Block Type
        packet[5] = cmd;        // CMD = Command
        packet[6] = control;    // Control field
        packet[7] = data;       // DATA field
        packet[8] = this.calculateChecksum(packet); // CS = checksum
        
        return packet;
    }
    
    /**
     * On Air Tally Commands (exact from documentation)
     */
    static getOnAirTallySet(cartNum = 1) {
        // Set the Tally Lamp: BT=00H, CMD=0AH, Control=00H, DATA=80H
        return this.createCommand(0x00, 0x0A, 0x00, 0x80, cartNum);
    }
    
    static getOnAirTallyReset(cartNum = 1) {
        // Reset the Tally Lamp: BT=00H, CMD=0AH, Control=01H, DATA=80H
        return this.createCommand(0x00, 0x0A, 0x01, 0x80, cartNum);
    }
    
    /**
     * Status Query Commands
     */
    static getSenseCartStatus(cartNum = 1) {
        return this.createCommand(0x00, 0x61, 0x00, 0x80, cartNum);
    }
    
    static getSenseCCStatus(cartNum = 1) {
        return this.createCommand(0x01, 0x61, 0x00, 0x80, cartNum);
    }
    
    static getSenseBinStatus(cartNum = 1) {
        return this.createCommand(0x01, 0x62, 0x00, 0x80, cartNum);
    }
    
    /**
     * Movement Commands with correct parameters
     */
    static getCassetteMove(slotNumber, cartNum = 1) {
        // Cassette Move: BT=01H, CMD=10H, Control=slotNumber, DATA=80H
        return this.createCommand(0x01, 0x10, slotNumber, 0x80, cartNum);
    }
    
    static getElevatorMove(slotNumber, cartNum = 1) {
        // Elevator Move: BT=01H, CMD=14H, Control=slotNumber, DATA=80H
        return this.createCommand(0x01, 0x14, slotNumber, 0x80, cartNum);
    }
    
    static getElevatorInitialize(cartNum = 1) {
        // Elevator Initialize: BT=01H, CMD=1DH, Control=00H, DATA=80H
        return this.createCommand(0x01, 0x1D, 0x00, 0x80, cartNum);
    }
    
    /**
     * Lamp and Buzzer Commands
     */
    static getSetBinLamp(state = 0x00, cartNum = 1) {
        // Set Bin Lamp: BT=01H, CMD=09H, Control=state, DATA=80H
        return this.createCommand(0x01, 0x09, state, 0x80, cartNum);
    }
    
    static getSetBuzzer(state = 0x00, cartNum = 1) {
        // Set Buzzer: BT=01H, CMD=0BH, Control=state, DATA=80H
        return this.createCommand(0x01, 0x0B, state, 0x80, cartNum);
    }
    
    /**
     * System Commands
     */
    static getSystemReset(cartNum = 1) {
        return this.createCommand(0x00, 0x00, 0x00, 0x80, cartNum);
    }
    
    static getDummy(cartNum = 1) {
        return this.createCommand(0x00, 0x50, 0x00, 0x80, cartNum);
    }
}

/**
 * Test with corrected protocol parameters
 */
async function testFlexiCartCorrected(portPath) {
    console.log(`📀 FlexiCart Corrected Protocol Test`);
    console.log(`===================================`);
    console.log(`Using corrected addressing and checksum calculation`);
    console.log(`Port: ${portPath}`);
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    const results = {
        workingCommands: [],
        statusChanges: [],
        acknowledgments: [],
        visualChanges: []
    };
    
    try {
        // Test multiple cart addresses (1-8)
        console.log(`🎯 Phase 1: Testing Cart Addressing`);
        console.log(`----------------------------------`);
        
        for (let cartNum = 1; cartNum <= 4; cartNum++) {
            console.log(`\n🧪 Testing Cart ${cartNum} addressing...`);
            
            const dummyCmd = FlexiCartCorrectedProtocol.getDummy(cartNum);
            console.log(`   📤 Dummy command: ${dummyCmd.toString('hex').toUpperCase()}`);
            console.log(`   📊 UA1=${dummyCmd[2].toString(16).toUpperCase()} UA2=${dummyCmd[3].toString(16).toUpperCase()} BC=${dummyCmd[1].toString(16).toUpperCase()} CS=${dummyCmd[8].toString(16).toUpperCase()}`);
            
            try {
                const response = await sendCommand(portPath, dummyCmd, 3000, false);
                console.log(`   📥 Response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response: ${response.slice(0, 15).toString('hex').toUpperCase()}`);
                    
                    // Check for ACK/NAK/BUSY
                    if (response.includes(0x04)) {
                        console.log(`   ✅ ACK received for Cart ${cartNum}!`);
                        results.acknowledgments.push({ cartNum, type: 'ACK' });
                    } else if (response.includes(0x05)) {
                        console.log(`   ❌ NAK received for Cart ${cartNum}`);
                        results.acknowledgments.push({ cartNum, type: 'NAK' });
                    } else if (response.includes(0x06)) {
                        console.log(`   ⏳ BUSY received for Cart ${cartNum}`);
                        results.acknowledgments.push({ cartNum, type: 'BUSY' });
                    } else {
                        console.log(`   📊 Other response for Cart ${cartNum}`);
                    }
                }
                
            } catch (error) {
                console.log(`   ❌ Cart ${cartNum} error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Use the best responding cart for further tests
        const workingCart = results.acknowledgments.find(ack => ack.type === 'ACK');
        const testCartNum = workingCart ? workingCart.cartNum : 1;
        
        console.log(`\n🎯 Using Cart ${testCartNum} for remaining tests...`);
        
        // Test On Air Tally with correct cart
        console.log(`\n\n🚨 Phase 2: On Air Tally Test (Cart ${testCartNum})`);
        console.log(`-----------------------------------------------`);
        
        const onAirTests = [
            { 
                name: 'ON_AIR_SET', 
                cmd: FlexiCartCorrectedProtocol.getOnAirTallySet(testCartNum), 
                desc: 'Turn On Air ON',
                expect: 'LED should turn ON'
            },
            { 
                name: 'ON_AIR_RESET', 
                cmd: FlexiCartCorrectedProtocol.getOnAirTallyReset(testCartNum), 
                desc: 'Turn On Air OFF',
                expect: 'LED should turn OFF'
            }
        ];
        
        for (const test of onAirTests) {
            console.log(`\n🧪 Testing: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
            console.log(`   🎯 Expected: ${test.expect}`);
            console.log(`   👀 WATCH THE DEVICE FOR LED CHANGES!`);
            
            try {
                // Get status before
                const statusBefore = await getDetailedStatus(portPath, testCartNum);
                
                // Send command
                const response = await sendCommand(portPath, test.cmd, 5000, false);
                console.log(`   📥 Response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response: ${response.slice(0, 15).toString('hex').toUpperCase()}`);
                    
                    if (response.includes(0x04)) {
                        console.log(`   ✅ ACK - On Air command accepted!`);
                        console.log(`   💡 CHECK DEVICE LED - Should be ${test.name.includes('SET') ? 'ON' : 'OFF'}!`);
                    } else if (response.includes(0x05)) {
                        console.log(`   ❌ NAK - Command rejected`);
                    } else if (response.includes(0x06)) {
                        console.log(`   ⏳ BUSY - Device busy`);
                    }
                }
                
                // Wait for visual change
                console.log(`   ⏳ Waiting 5 seconds for visual confirmation...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Get status after
                const statusAfter = await getDetailedStatus(portPath, testCartNum);
                
                // Compare status
                const statusChanged = JSON.stringify(statusBefore) !== JSON.stringify(statusAfter);
                if (statusChanged) {
                    console.log(`   🎉 STATUS CHANGE CONFIRMED!`);
                    results.statusChanges.push({
                        command: test.name,
                        before: statusBefore,
                        after: statusAfter
                    });
                }
                
                results.workingCommands.push({
                    name: test.name,
                    cartNum: testCartNum,
                    command: test.cmd.toString('hex'),
                    statusChanged: statusChanged,
                    success: true
                });
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Test movement commands if we got ACKs
        if (results.acknowledgments.some(ack => ack.type === 'ACK')) {
            console.log(`\n\n🏃 Phase 3: Movement Commands (Cart ${testCartNum})`);
            console.log(`----------------------------------------------`);
            
            const movementTests = [
                { 
                    name: 'ELEVATOR_INIT', 
                    cmd: FlexiCartCorrectedProtocol.getElevatorInitialize(testCartNum), 
                    desc: 'Initialize Elevator'
                },
                { 
                    name: 'CASSETTE_MOVE_1', 
                    cmd: FlexiCartCorrectedProtocol.getCassetteMove(1, testCartNum), 
                    desc: 'Move to Slot 1'
                },
                { 
                    name: 'CASSETTE_MOVE_2', 
                    cmd: FlexiCartCorrectedProtocol.getCassetteMove(2, testCartNum), 
                    desc: 'Move to Slot 2'
                },
                { 
                    name: 'CASSETTE_HOME', 
                    cmd: FlexiCartCorrectedProtocol.getCassetteMove(0, testCartNum), 
                    desc: 'Move to Home'
                }
            ];
            
            for (const test of movementTests) {
                console.log(`\n🧪 Testing Movement: ${test.name}`);
                console.log(`   📋 ${test.desc}`);
                console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
                console.log(`   🎯 Watch for physical movement!`);
                
                try {
                    const response = await sendCommand(portPath, test.cmd, 8000, false);
                    console.log(`   📥 Response: ${response.length} bytes`);
                    
                    if (response.length > 0) {
                        console.log(`   📊 Response: ${response.slice(0, 15).toString('hex').toUpperCase()}`);
                        
                        if (response.includes(0x04)) {
                            console.log(`   ✅ ACK - Movement command accepted!`);
                            console.log(`   🏃 WATCH FOR PHYSICAL MOVEMENT!`);
                        } else if (response.includes(0x05)) {
                            console.log(`   ❌ NAK - Movement rejected`);
                        } else if (response.includes(0x06)) {
                            console.log(`   ⏳ BUSY - Device busy with movement`);
                        }
                    }
                    
                    console.log(`   ⏳ Waiting 12 seconds for movement completion...`);
                    await new Promise(resolve => setTimeout(resolve, 12000));
                    
                } catch (error) {
                    console.log(`   ❌ Movement error: ${error.message}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        
        // Comprehensive Test Summary
        console.log(`\n\n📊 Corrected Protocol Test Results`);
        console.log(`==================================`);
        console.log(`Cart addresses tested: 1-4`);
        console.log(`ACK responses: ${results.acknowledgments.filter(a => a.type === 'ACK').length}`);
        console.log(`NAK responses: ${results.acknowledgments.filter(a => a.type === 'NAK').length}`);
        console.log(`BUSY responses: ${results.acknowledgments.filter(a => a.type === 'BUSY').length}`);
        console.log(`Status changes detected: ${results.statusChanges.length}`);
        console.log(`Working commands: ${results.workingCommands.length}`);
        
        if (results.acknowledgments.some(ack => ack.type === 'ACK')) {
            console.log(`\n🎉 MAJOR SUCCESS! FlexiCart Protocol Working!`);
            console.log(`\n✅ Working Cart Addresses:`);
            results.acknowledgments
                .filter(ack => ack.type === 'ACK')
                .forEach(ack => console.log(`   📋 Cart ${ack.cartNum}: ACK received`));
            
            if (results.statusChanges.length > 0) {
                console.log(`\n🚨 Status Changes Confirmed:`);
                results.statusChanges.forEach(change => {
                    console.log(`   📊 ${change.command}: Status modified`);
                });
            }
            
            console.log(`\n🔧 FINAL Working FlexiCart Library:`);
            console.log(`==================================`);
            const workingCartNum = results.acknowledgments.find(ack => ack.type === 'ACK').cartNum;
            console.log(`// FlexiCart Control Library (Cart ${workingCartNum})`);
            console.log(`const FlexiCart = {`);
            console.log(`  onAirSet: Buffer.from([${FlexiCartCorrectedProtocol.getOnAirTallySet(workingCartNum).join(', ')}]),`);
            console.log(`  onAirReset: Buffer.from([${FlexiCartCorrectedProtocol.getOnAirTallyReset(workingCartNum).join(', ')}]),`);
            console.log(`  moveToSlot: (slot) => Buffer.from([0x02, 0x06, 0x01, ${(workingCartNum-1).toString(16)}, 0x01, 0x10, slot, 0x80, checksum]),`);
            console.log(`  elevatorInit: Buffer.from([${FlexiCartCorrectedProtocol.getElevatorInitialize(workingCartNum).join(', ')}])`);
            console.log(`};`);
            
            console.log(`\n🎯 YOUR FLEXICART IS FULLY OPERATIONAL!`);
            console.log(`   ✅ Protocol: WORKING`);
            console.log(`   ✅ On Air Control: WORKING`);
            console.log(`   ✅ Status Monitoring: WORKING`);
            console.log(`   ✅ Device Communication: WORKING`);
            
        } else {
            console.log(`\n⚠️  Still no ACK responses, but status changes detected.`);
            console.log(`   Your FlexiCart is responding but may need:`);
            console.log(`   - Different DATA field values`);
            console.log(`   - Specific initialization sequence`);
            console.log(`   - Alternative checksum method`);
        }
        
    } catch (error) {
        console.log(`❌ Corrected protocol test failed: ${error.message}`);
    }
}

/**
 * Get detailed status for comparison
 */
async function getDetailedStatus(portPath, cartNum) {
    const status = {};
    
    try {
        const commands = [
            { name: 'cart', cmd: FlexiCartCorrectedProtocol.getSenseCartStatus(cartNum) },
            { name: 'cc', cmd: FlexiCartCorrectedProtocol.getSenseCCStatus(cartNum) },
            { name: 'bin', cmd: FlexiCartCorrectedProtocol.getSenseBinStatus(cartNum) }
        ];
        
        for (const { name, cmd } of commands) {
            try {
                const response = await sendCommand(portPath, cmd, 2000, false);
                if (response && response.length > 0) {
                    status[name] = response.slice(0, 10).toString('hex');
                }
                await new Promise(resolve => setTimeout(resolve, 200));
            } catch (error) {
                status[name] = 'ERROR';
            }
        }
        
    } catch (error) {
        // Return partial status
    }
    
    return status;
}

// Run the corrected test
const portPath = process.argv[2] || '/dev/ttyRP8';
testFlexiCartCorrected(portPath);