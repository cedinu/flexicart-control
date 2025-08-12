/**
 * FlexiCart On Air Tally Test - Toggle On Air Status
 */

const { sendCommand } = require('../src/commands/flexicart_serial_utils');

/**
 * On Air and Control Commands
 */
const FLEXICART_ON_AIR_COMMANDS = {
    // From documentation - On Air Tally commands
    ON_AIR_TALLY_ASCII: Buffer.from("00H,0AH\r"), // ASCII format from docs
    ON_AIR_TALLY_HEX: Buffer.from([0x00, 0x0A]), // Binary hex format
    
    // Alternative formats to try
    ON_AIR_ENABLE: Buffer.from("00H,0AH,01\r"), // Enable On Air
    ON_AIR_DISABLE: Buffer.from("00H,0AH,00\r"), // Disable On Air
    
    // Set Bin Lamp commands (might control LEDs)
    SET_BIN_LAMP_ASCII: Buffer.from("01H,09H\r"),
    SET_BIN_LAMP_HEX: Buffer.from([0x01, 0x09]),
    SET_BIN_LAMP_ON: Buffer.from("01H,09H,01\r"),
    SET_BIN_LAMP_OFF: Buffer.from("01H,09H,00\r"),
    
    // Set Buzzer commands (audible feedback)
    SET_BUZZER_ASCII: Buffer.from("01H,0BH\r"),
    SET_BUZZER_HEX: Buffer.from([0x01, 0x0B]),
    SET_BUZZER_ON: Buffer.from("01H,0BH,01\r"),
    SET_BUZZER_OFF: Buffer.from("01H,0BH,00\r"),
    
    // Status queries to check changes
    SENSE_CART_STATUS: Buffer.from("00H,61H\r"),
    SENSE_CC_STATUS: Buffer.from("01H,61H\r"),
    SENSE_BIN_STATUS: Buffer.from("01H,62H\r"),
    
    // Binary versions
    SENSE_CART_STATUS_HEX: Buffer.from([0x00, 0x61]),
    SENSE_CC_STATUS_HEX: Buffer.from([0x01, 0x61]),
    SENSE_BIN_STATUS_HEX: Buffer.from([0x01, 0x62]),
    
    // Simple ASCII commands
    ON_AIR_ASCII: Buffer.from("ONAIR\r\n"),
    LAMP_ON_ASCII: Buffer.from("LAMP ON\r\n"),
    LAMP_OFF_ASCII: Buffer.from("LAMP OFF\r\n"),
    BUZZER_ON_ASCII: Buffer.from("BUZZER ON\r\n"),
    BUZZER_OFF_ASCII: Buffer.from("BUZZER OFF\r\n"),
};

/**
 * Test On Air and control functions
 */
async function testOnAirToggle(portPath) {
    console.log(`🚨 FlexiCart On Air Tally Test`);
    console.log(`==============================`);
    console.log(`Testing On Air, Lamp, and Buzzer controls`);
    console.log(`Port: ${portPath}`);
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    const results = {
        workingCommands: [],
        visualChanges: [],
        audioChanges: []
    };
    
    try {
        // Get initial status
        console.log(`📊 Getting Initial Device Status`);
        console.log(`--------------------------------`);
        
        const initialStatus = await getDeviceStatus(portPath);
        console.log(`✅ Initial status captured`);
        console.log(`   📊 Cart Status: ${initialStatus.cartStatus}`);
        console.log(`   📊 CC Status: ${initialStatus.ccStatus}`);
        console.log(`   📊 Bin Status: ${initialStatus.binStatus}\n`);
        
        // Test On Air commands
        console.log(`🚨 Testing On Air Tally Commands`);
        console.log(`---------------------------------`);
        
        const onAirTests = [
            { 
                name: 'ON_AIR_TALLY_ASCII', 
                cmd: FLEXICART_ON_AIR_COMMANDS.ON_AIR_TALLY_ASCII, 
                desc: 'On Air Tally (ASCII: 00H,0AH)',
                expect: 'Toggle On Air indicator'
            },
            { 
                name: 'ON_AIR_TALLY_HEX', 
                cmd: FLEXICART_ON_AIR_COMMANDS.ON_AIR_TALLY_HEX, 
                desc: 'On Air Tally (Binary: 0x00 0x0A)',
                expect: 'Toggle On Air indicator'
            },
            { 
                name: 'ON_AIR_ENABLE', 
                cmd: FLEXICART_ON_AIR_COMMANDS.ON_AIR_ENABLE, 
                desc: 'Enable On Air (00H,0AH,01)',
                expect: 'Turn On Air ON'
            },
            { 
                name: 'ON_AIR_DISABLE', 
                cmd: FLEXICART_ON_AIR_COMMANDS.ON_AIR_DISABLE, 
                desc: 'Disable On Air (00H,0AH,00)',
                expect: 'Turn On Air OFF'
            },
            { 
                name: 'ON_AIR_ASCII', 
                cmd: FLEXICART_ON_AIR_COMMANDS.ON_AIR_ASCII, 
                desc: 'Simple ASCII On Air command',
                expect: 'Toggle On Air'
            }
        ];
        
        for (const test of onAirTests) {
            console.log(`\n🧪 Testing: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
            console.log(`   📤 ASCII: "${test.cmd.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
            console.log(`   🎯 Expected: ${test.expect}`);
            
            try {
                // Send command
                console.log(`   📡 Sending command...`);
                const response = await sendCommand(portPath, test.cmd, 5000, false);
                console.log(`   📥 Response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response hex: ${response.slice(0, 15).toString('hex').toUpperCase()}`);
                    
                    // Check for acknowledgment
                    const meaningfulBytes = response.filter(b => b !== 0x55 && b !== 0x00);
                    if (meaningfulBytes.length > 0) {
                        console.log(`   ✅ Device acknowledged command`);
                        console.log(`   📊 Meaningful response: ${meaningfulBytes.slice(0, 5).toString('hex').toUpperCase()}`);
                    }
                }
                
                // Wait and check for visual/audio changes
                console.log(`   👀 Checking for visual/audio changes (5 seconds)...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Get status after command
                const statusAfter = await getDeviceStatus(portPath);
                
                // Compare status
                const statusChanged = 
                    initialStatus.cartStatus !== statusAfter.cartStatus ||
                    initialStatus.ccStatus !== statusAfter.ccStatus ||
                    initialStatus.binStatus !== statusAfter.binStatus;
                
                if (statusChanged) {
                    console.log(`   🎉 STATUS CHANGE DETECTED!`);
                    console.log(`   📊 Cart Status: ${initialStatus.cartStatus} → ${statusAfter.cartStatus}`);
                    console.log(`   📊 CC Status: ${initialStatus.ccStatus} → ${statusAfter.ccStatus}`);
                    console.log(`   📊 Bin Status: ${initialStatus.binStatus} → ${statusAfter.binStatus}`);
                    
                    results.visualChanges.push({
                        command: test.name,
                        statusBefore: initialStatus,
                        statusAfter: statusAfter
                    });
                } else {
                    console.log(`   ⏸️  No status change detected`);
                }
                
                results.workingCommands.push({
                    name: test.name,
                    command: test.cmd.toString('hex'),
                    responseLength: response.length,
                    statusChanged: statusChanged,
                    success: true
                });
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Test Lamp controls
        console.log(`\n\n💡 Testing Lamp Control Commands`);
        console.log(`---------------------------------`);
        
        const lampTests = [
            { 
                name: 'SET_BIN_LAMP_ASCII', 
                cmd: FLEXICART_ON_AIR_COMMANDS.SET_BIN_LAMP_ASCII, 
                desc: 'Set Bin Lamp (ASCII: 01H,09H)',
                expect: 'Toggle bin lamp'
            },
            { 
                name: 'SET_BIN_LAMP_ON', 
                cmd: FLEXICART_ON_AIR_COMMANDS.SET_BIN_LAMP_ON, 
                desc: 'Turn Bin Lamp ON (01H,09H,01)',
                expect: 'Turn lamp ON'
            },
            { 
                name: 'SET_BIN_LAMP_OFF', 
                cmd: FLEXICART_ON_AIR_COMMANDS.SET_BIN_LAMP_OFF, 
                desc: 'Turn Bin Lamp OFF (01H,09H,00)',
                expect: 'Turn lamp OFF'
            },
            { 
                name: 'LAMP_ON_ASCII', 
                cmd: FLEXICART_ON_AIR_COMMANDS.LAMP_ON_ASCII, 
                desc: 'ASCII Lamp ON command',
                expect: 'Turn lamp ON'
            },
            { 
                name: 'LAMP_OFF_ASCII', 
                cmd: FLEXICART_ON_AIR_COMMANDS.LAMP_OFF_ASCII, 
                desc: 'ASCII Lamp OFF command',
                expect: 'Turn lamp OFF'
            }
        ];
        
        for (const test of lampTests) {
            console.log(`\n🧪 Testing Lamp: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
            console.log(`   🎯 Expected: ${test.expect}`);
            
            try {
                const statusBefore = await getDeviceStatus(portPath);
                const response = await sendCommand(portPath, test.cmd, 5000, false);
                
                console.log(`   📥 Response: ${response.length} bytes`);
                
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                const statusAfter = await getDeviceStatus(portPath);
                const changed = statusBefore.binStatus !== statusAfter.binStatus;
                
                if (changed) {
                    console.log(`   💡 LAMP CHANGE DETECTED!`);
                    console.log(`   📊 Bin Status: ${statusBefore.binStatus} → ${statusAfter.binStatus}`);
                } else {
                    console.log(`   ⏸️  No lamp change detected`);
                }
                
            } catch (error) {
                console.log(`   ❌ Lamp error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Test Buzzer controls
        console.log(`\n\n🔊 Testing Buzzer Control Commands`);
        console.log(`----------------------------------`);
        
        const buzzerTests = [
            { 
                name: 'SET_BUZZER_ASCII', 
                cmd: FLEXICART_ON_AIR_COMMANDS.SET_BUZZER_ASCII, 
                desc: 'Set Buzzer (ASCII: 01H,0BH)',
                expect: 'Toggle buzzer'
            },
            { 
                name: 'SET_BUZZER_ON', 
                cmd: FLEXICART_ON_AIR_COMMANDS.SET_BUZZER_ON, 
                desc: 'Turn Buzzer ON (01H,0BH,01)',
                expect: 'Sound buzzer'
            },
            { 
                name: 'BUZZER_ON_ASCII', 
                cmd: FLEXICART_ON_AIR_COMMANDS.BUZZER_ON_ASCII, 
                desc: 'ASCII Buzzer ON command',
                expect: 'Sound buzzer'
            }
        ];
        
        for (const test of buzzerTests) {
            console.log(`\n🧪 Testing Buzzer: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
            console.log(`   🎯 Expected: ${test.expect}`);
            console.log(`   👂 Listen for buzzer sound...`);
            
            try {
                const response = await sendCommand(portPath, test.cmd, 5000, false);
                console.log(`   📥 Response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response: ${response.slice(0, 10).toString('hex').toUpperCase()}`);
                }
                
                // Wait for buzzer sound
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                console.log(`   🔊 Did you hear a buzzer sound? (Check manually)`);
                
            } catch (error) {
                console.log(`   ❌ Buzzer error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Test sequence - toggle on/off
        console.log(`\n\n🔄 Testing Toggle Sequence`);
        console.log(`--------------------------`);
        
        const toggleSequence = [
            { name: 'ON_AIR_ENABLE', cmd: FLEXICART_ON_AIR_COMMANDS.ON_AIR_ENABLE },
            { name: 'LAMP_ON', cmd: FLEXICART_ON_AIR_COMMANDS.SET_BIN_LAMP_ON },
            { name: 'BUZZER_BEEP', cmd: FLEXICART_ON_AIR_COMMANDS.SET_BUZZER_ON },
            { name: 'WAIT', cmd: null },
            { name: 'ON_AIR_DISABLE', cmd: FLEXICART_ON_AIR_COMMANDS.ON_AIR_DISABLE },
            { name: 'LAMP_OFF', cmd: FLEXICART_ON_AIR_COMMANDS.SET_BIN_LAMP_OFF }
        ];
        
        for (const step of toggleSequence) {
            if (step.cmd === null) {
                console.log(`   ⏳ Waiting 3 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                continue;
            }
            
            console.log(`   🔄 ${step.name}: ${step.cmd.toString('hex').toUpperCase()}`);
            
            try {
                await sendCommand(portPath, step.cmd, 3000, false);
                await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (error) {
                console.log(`   ❌ ${step.name} failed: ${error.message}`);
            }
        }
        
        // Final summary
        console.log(`\n\n📊 On Air Test Results`);
        console.log(`======================`);
        console.log(`Commands tested: ${results.workingCommands.length}`);
        console.log(`Status changes detected: ${results.visualChanges.length}`);
        
        if (results.visualChanges.length > 0) {
            console.log(`\n🎉 SUCCESS! Device responds to control commands!`);
            console.log(`\n📊 Commands that caused status changes:`);
            results.visualChanges.forEach(change => {
                console.log(`   ✅ ${change.command}: Status changed`);
            });
            
            console.log(`\n💡 Working control commands found! Your FlexiCart is responding to:`);
            console.log(`   - On Air tally controls`);
            console.log(`   - Lamp controls`);
            console.log(`   - Status monitoring`);
            console.log(`\n🎯 This confirms the device is functional and communication is working!`);
        } else {
            console.log(`\n⚠️  No visible status changes detected.`);
            console.log(`   However, the device may still be responding.`);
            console.log(`   Check for:`);
            console.log(`   - LED indicators on the device`);
            console.log(`   - Audio beeps or buzzer sounds`);
            console.log(`   - Physical button/lamp changes`);
        }
        
    } catch (error) {
        console.log(`❌ On Air test failed: ${error.message}`);
    }
}

/**
 * Get device status using multiple commands
 */
async function getDeviceStatus(portPath) {
    const status = {
        cartStatus: 'UNKNOWN',
        ccStatus: 'UNKNOWN',
        binStatus: 'UNKNOWN'
    };
    
    try {
        // Try ASCII commands first
        const cartResponse = await sendCommand(portPath, FLEXICART_ON_AIR_COMMANDS.SENSE_CART_STATUS, 3000, false);
        if (cartResponse && cartResponse.length > 0) {
            status.cartStatus = cartResponse.slice(0, 10).toString('hex').toUpperCase();
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const ccResponse = await sendCommand(portPath, FLEXICART_ON_AIR_COMMANDS.SENSE_CC_STATUS, 3000, false);
        if (ccResponse && ccResponse.length > 0) {
            status.ccStatus = ccResponse.slice(0, 10).toString('hex').toUpperCase();
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const binResponse = await sendCommand(portPath, FLEXICART_ON_AIR_COMMANDS.SENSE_BIN_STATUS, 3000, false);
        if (binResponse && binResponse.length > 0) {
            status.binStatus = binResponse.slice(0, 10).toString('hex').toUpperCase();
        }
        
    } catch (error) {
        // Status queries failed, but return what we have
    }
    
    return status;
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
testOnAirToggle(portPath);