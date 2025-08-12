/**
 * FlexiCart Exact Protocol Test - Using Commands from FLEXICART_PT1.pdf
 */

const { sendCommand } = require('../src/commands/flexicart_serial_utils');

/**
 * Exact FlexiCart Commands from Documentation
 * Format: BT+CMD or BT+CMD+DATA
 * Where BT = Block Type (00H-FFH)
 */
const FLEXICART_EXACT_COMMANDS = {
    // System Commands (7-1 table)
    SYSTEM_RESET: Buffer.from("00H,00H\r"), // System Reset
    STANDARD_TIME_PRESET: Buffer.from("00H,01H\r"), // Standard Time Preset
    TURN_ON_TIME: Buffer.from("00H,02H\r"), // Turn On Time
    SYSTEM_MODE_PRESET: Buffer.from("00H,05H\r"), // System Mode Preset
    SET_VTR_CONTROL_MODE: Buffer.from("00H,09H\r"), // Set VTR Control Mode
    ON_AIR_TALLY: Buffer.from("00H,0AH\r"), // On Air Tally
    DUMMY: Buffer.from("00H,50H\r"), // Dummy
    REQUEST: Buffer.from("00H,60H\r"), // Request
    RE_REQUEST_RETURN: Buffer.from("00H,70H\r"), // Re-Request Return
    SENSE_CART_STATUS: Buffer.from("00H,61H\r"), // Sense Cart Status
    SENSE_SYSTEM_MODE: Buffer.from("00H,65H\r"), // Sense System Mode
    SENSE_EXT_IN_PORT: Buffer.from("00H,68H\r"), // Sense Ext. In-port
    SENSE_VTR_CONTROL_MODE: Buffer.from("00H,69H\r"), // Sense VTR Control Mode
    SENSE_CART_TYPE: Buffer.from("00H,6CH\r"), // Sense Cart Type
    SENSE_VERSION_NUMBER: Buffer.from("00H,6DH\r"), // Sense Version Number
    SENSE_ERROR_REPORT: Buffer.from("00H,6FH\r"), // Sense Error Report
    ERROR_REPORT_RETURN: Buffer.from("00H,7FH\r"), // Error Report Return
    
    // Transport Control Commands (7-2 table)
    TRANSPORT_SYSTEM_RESET: Buffer.from("01H,00H\r"), // System Reset
    SET_BIN_LAMP: Buffer.from("01H,09H\r"), // Set Bin Lamp
    SET_BUZZER: Buffer.from("01H,0BH\r"), // Set Buzzer
    CASSETTE_MOVE: Buffer.from("01H,10H\r"), // Cassette Move
    ELEVATOR_MOVE: Buffer.from("01H,14H\r"), // Elevator Move
    ELEVATOR_INITIALIZE: Buffer.from("01H,1DH\r"), // Elevator Initialize
    SENSE_CC_STATUS: Buffer.from("01H,61H\r"), // Sense C.C. Status
    CC_STATUS_RETURN: Buffer.from("01H,71H\r"), // C.C. Status Return
    SENSE_BIN_STATUS: Buffer.from("01H,62H\r"), // Sense Bin Status
    BIN_STATUS_RETURN: Buffer.from("01H,72H\r"), // Bin Status Return
    SENSE_CC_ERROR_CODE: Buffer.from("01H,63H\r"), // Sense C.C. Error Code
    CC_ERROR_CODE_RETURN: Buffer.from("01H,73H\r"), // C.C. Error Code Return
    SENSE_CONSOL_CONFIG: Buffer.from("01H,6FH\r"), // Sense Consol Config
    CC_CONFIG_RETURN: Buffer.from("01H,7FH\r"), // C.C. Config Return
    
    // Movement commands with slot numbers
    CASSETTE_MOVE_TO_SLOT: (slot) => Buffer.from(`01H,10H,${slot.toString().padStart(2, '0')}\r`),
    ELEVATOR_MOVE_TO_SLOT: (slot) => Buffer.from(`01H,14H,${slot.toString().padStart(2, '0')}\r`),
    
    // Alternative hex format
    CASSETTE_MOVE_HEX: (slot) => Buffer.from([0x30, 0x31, 0x48, 0x2C, 0x31, 0x30, 0x48, 0x2C, 0x30 + Math.floor(slot/10), 0x30 + (slot%10), 0x0D]),
    
    // Simple ASCII commands
    STATUS_ASCII: Buffer.from("STATUS\r\n"),
    HOME_ASCII: Buffer.from("HOME\r\n"),
    POSITION_ASCII: Buffer.from("POSITION\r\n"),
    MOVE_ASCII: (slot) => Buffer.from(`MOVE ${slot}\r\n`),
    
    // Binary hex format (actual hex bytes)
    SYSTEM_RESET_HEX: Buffer.from([0x00, 0x00]),
    CASSETTE_MOVE_HEX_DIRECT: (slot) => Buffer.from([0x01, 0x10, slot]),
    ELEVATOR_MOVE_HEX_DIRECT: (slot) => Buffer.from([0x01, 0x14, slot]),
    STATUS_REQUEST_HEX: Buffer.from([0x00, 0x61]),
    POSITION_REQUEST_HEX: Buffer.from([0x01, 0x62]),
};

/**
 * Test exact FlexiCart protocol
 */
async function testExactFlexiCartProtocol(portPath) {
    console.log(`📀 FlexiCart Exact Protocol Test`);
    console.log(`================================`);
    console.log(`Using commands from FLEXICART_PT1.pdf documentation`);
    console.log(`Port: ${portPath}`);
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    const results = {
        workingCommands: [],
        movementDetected: false,
        validResponses: []
    };
    
    try {
        // Phase 1: Status and diagnostic commands
        console.log(`📊 Phase 1: Status and Diagnostic Commands`);
        console.log(`------------------------------------------`);
        
        const statusTests = [
            { name: 'SYSTEM_RESET', cmd: FLEXICART_EXACT_COMMANDS.SYSTEM_RESET, desc: 'System Reset (00H,00H)' },
            { name: 'SENSE_CART_STATUS', cmd: FLEXICART_EXACT_COMMANDS.SENSE_CART_STATUS, desc: 'Sense Cart Status (00H,61H)' },
            { name: 'SENSE_SYSTEM_MODE', cmd: FLEXICART_EXACT_COMMANDS.SENSE_SYSTEM_MODE, desc: 'Sense System Mode (00H,65H)' },
            { name: 'SENSE_CART_TYPE', cmd: FLEXICART_EXACT_COMMANDS.SENSE_CART_TYPE, desc: 'Sense Cart Type (00H,6CH)' },
            { name: 'SENSE_VERSION_NUMBER', cmd: FLEXICART_EXACT_COMMANDS.SENSE_VERSION_NUMBER, desc: 'Sense Version Number (00H,6DH)' },
            { name: 'SENSE_CC_STATUS', cmd: FLEXICART_EXACT_COMMANDS.SENSE_CC_STATUS, desc: 'Sense C.C. Status (01H,61H)' },
            { name: 'SENSE_BIN_STATUS', cmd: FLEXICART_EXACT_COMMANDS.SENSE_BIN_STATUS, desc: 'Sense Bin Status (01H,62H)' },
            { name: 'STATUS_REQUEST_HEX', cmd: FLEXICART_EXACT_COMMANDS.STATUS_REQUEST_HEX, desc: 'Status Request (Binary 0x00 0x61)' },
            { name: 'POSITION_REQUEST_HEX', cmd: FLEXICART_EXACT_COMMANDS.POSITION_REQUEST_HEX, desc: 'Position Request (Binary 0x01 0x62)' }
        ];
        
        for (const test of statusTests) {
            console.log(`\n🧪 Testing: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command bytes: ${test.cmd.toString('hex').toUpperCase()}`);
            console.log(`   📤 Command ASCII: "${test.cmd.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
            
            try {
                const response = await sendCommand(portPath, test.cmd, 5000, false);
                console.log(`   📥 Response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response hex: ${response.slice(0, 20).toString('hex').toUpperCase()}`);
                    console.log(`   📊 Response ASCII: "${response.toString().replace(/[\x00-\x1F\x7F]/g, '.')}"`);
                    
                    // Check for meaningful response (not just sync bytes)
                    const meaningfulBytes = response.filter(b => b !== 0x55 && b !== 0x00);
                    if (meaningfulBytes.length > 2) {
                        console.log(`   ✅ Meaningful response detected!`);
                        results.validResponses.push({
                            command: test.name,
                            responseHex: response.slice(0, 10).toString('hex'),
                            meaningfulBytes: meaningfulBytes.slice(0, 5)
                        });
                    }
                    
                    results.workingCommands.push({
                        name: test.name,
                        command: test.cmd.toString('hex'),
                        response: response.slice(0, 20).toString('hex'),
                        responseLength: response.length,
                        success: true
                    });
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
        
        // Phase 2: Movement commands
        console.log(`\n\n🏃 Phase 2: Movement Commands`);
        console.log(`-----------------------------`);
        
        const movementTests = [
            { name: 'ELEVATOR_INITIALIZE', cmd: FLEXICART_EXACT_COMMANDS.ELEVATOR_INITIALIZE, desc: 'Elevator Initialize (01H,1DH)', target: 'INIT' },
            { name: 'CASSETTE_MOVE_SLOT_01', cmd: FLEXICART_EXACT_COMMANDS.CASSETTE_MOVE_TO_SLOT(1), desc: 'Cassette Move to Slot 1', target: 'SLOT_1' },
            { name: 'ELEVATOR_MOVE_SLOT_01', cmd: FLEXICART_EXACT_COMMANDS.ELEVATOR_MOVE_TO_SLOT(1), desc: 'Elevator Move to Slot 1', target: 'SLOT_1' },
            { name: 'CASSETTE_MOVE_SLOT_02', cmd: FLEXICART_EXACT_COMMANDS.CASSETTE_MOVE_TO_SLOT(2), desc: 'Cassette Move to Slot 2', target: 'SLOT_2' },
            { name: 'ELEVATOR_MOVE_SLOT_02', cmd: FLEXICART_EXACT_COMMANDS.ELEVATOR_MOVE_TO_SLOT(2), desc: 'Elevator Move to Slot 2', target: 'SLOT_2' },
            { name: 'CASSETTE_MOVE_HEX_01', cmd: FLEXICART_EXACT_COMMANDS.CASSETTE_MOVE_HEX_DIRECT(1), desc: 'Binary Cassette Move to 1', target: 'SLOT_1' },
            { name: 'ELEVATOR_MOVE_HEX_01', cmd: FLEXICART_EXACT_COMMANDS.ELEVATOR_MOVE_HEX_DIRECT(1), desc: 'Binary Elevator Move to 1', target: 'SLOT_1' },
            { name: 'CASSETTE_MOVE_HEX_03', cmd: FLEXICART_EXACT_COMMANDS.CASSETTE_MOVE_HEX_DIRECT(3), desc: 'Binary Cassette Move to 3', target: 'SLOT_3' },
            { name: 'CASSETTE_MOVE_HEX_05', cmd: FLEXICART_EXACT_COMMANDS.CASSETTE_MOVE_HEX_DIRECT(5), desc: 'Binary Cassette Move to 5', target: 'SLOT_5' },
            { name: 'CASSETTE_MOVE_HEX_00', cmd: FLEXICART_EXACT_COMMANDS.CASSETTE_MOVE_HEX_DIRECT(0), desc: 'Binary Cassette Move to Home (0)', target: 'HOME' }
        ];
        
        for (const test of movementTests) {
            console.log(`\n🧪 Testing Movement: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command bytes: ${test.cmd.toString('hex').toUpperCase()}`);
            console.log(`   📤 Command ASCII: "${test.cmd.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`);
            console.log(`   🎯 Target: ${test.target}`);
            
            try {
                // Get position before (using working status command)
                const posBefore = await getFlexiCartPositionExact(portPath);
                console.log(`   📍 Position before: ${posBefore || 'Unknown'}`);
                
                // Send movement command
                const response = await sendCommand(portPath, test.cmd, 12000, false);
                console.log(`   📥 Movement response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response hex: ${response.slice(0, 20).toString('hex').toUpperCase()}`);
                    
                    // Check for acknowledgment or error
                    const meaningfulBytes = response.filter(b => b !== 0x55 && b !== 0x00);
                    if (meaningfulBytes.length > 0) {
                        console.log(`   📊 Meaningful response: ${meaningfulBytes.slice(0, 5).toString('hex').toUpperCase()}`);
                    }
                }
                
                // Wait for movement
                console.log(`   ⏳ Waiting for movement (12 seconds)...`);
                await new Promise(resolve => setTimeout(resolve, 12000));
                
                // Get position after
                const posAfter = await getFlexiCartPositionExact(portPath);
                console.log(`   📍 Position after: ${posAfter || 'Unknown'}`);
                
                // Check for movement
                const moved = posBefore !== posAfter && posAfter !== 'Unknown';
                
                if (moved) {
                    console.log(`   🏃 MOVEMENT DETECTED! (${posBefore} → ${posAfter})`);
                    results.movementDetected = true;
                    
                    results.workingCommands.push({
                        name: test.name,
                        command: test.cmd.toString('hex'),
                        positionBefore: posBefore,
                        positionAfter: posAfter,
                        moved: true,
                        target: test.target,
                        success: true
                    });
                    
                    // If we found working movement, test a few more similar commands
                    if (!results.movementDetected) {
                        console.log(`   🎯 Found working movement command! Testing similar commands...`);
                    }
                } else {
                    console.log(`   ⏸️  No position change detected`);
                }
                
            } catch (error) {
                console.log(`   ❌ Movement error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Phase 3: If movement found, test more variations
        if (results.movementDetected) {
            console.log(`\n\n🎯 Phase 3: Testing More Movement Variations`);
            console.log(`--------------------------------------------`);
            
            const additionalTests = [
                { name: 'CASSETTE_MOVE_HEX_10', cmd: FLEXICART_EXACT_COMMANDS.CASSETTE_MOVE_HEX_DIRECT(10), desc: 'Move to slot 10' },
                { name: 'CASSETTE_MOVE_HEX_15', cmd: FLEXICART_EXACT_COMMANDS.CASSETTE_MOVE_HEX_DIRECT(15), desc: 'Move to slot 15' },
                { name: 'CASSETTE_MOVE_HEX_20', cmd: FLEXICART_EXACT_COMMANDS.CASSETTE_MOVE_HEX_DIRECT(20), desc: 'Move to slot 20' }
            ];
            
            for (const test of additionalTests) {
                console.log(`\n🧪 Additional Test: ${test.name} - ${test.desc}`);
                
                try {
                    const posBefore = await getFlexiCartPositionExact(portPath);
                    const response = await sendCommand(portPath, test.cmd, 12000, false);
                    
                    console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
                    console.log(`   📥 Response: ${response.length} bytes`);
                    
                    await new Promise(resolve => setTimeout(resolve, 10000));
                    
                    const posAfter = await getFlexiCartPositionExact(portPath);
                    const moved = posBefore !== posAfter;
                    
                    if (moved) {
                        console.log(`   🏃 ADDITIONAL MOVEMENT! (${posBefore} → ${posAfter})`);
                    } else {
                        console.log(`   ⏸️  No movement`);
                    }
                    
                } catch (error) {
                    console.log(`   ❌ Error: ${error.message}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        // Summary
        console.log(`\n\n📊 Exact Protocol Test Results`);
        console.log(`==============================`);
        console.log(`Total commands tested: ${results.workingCommands.length}`);
        console.log(`Movement detected: ${results.movementDetected ? 'YES' : 'NO'}`);
        console.log(`Valid responses: ${results.validResponses.length}`);
        
        if (results.validResponses.length > 0) {
            console.log(`\n✅ Commands with Valid Responses:`);
            results.validResponses.forEach(resp => {
                console.log(`   📋 ${resp.command}: ${resp.responseHex} (${resp.meaningfulBytes.length} meaningful bytes)`);
            });
        }
        
        if (results.movementDetected) {
            console.log(`\n🎉 SUCCESS! Working FlexiCart movement commands found!`);
            
            const movementCommands = results.workingCommands.filter(cmd => cmd.moved);
            console.log(`\n🏃 Working Movement Commands:`);
            movementCommands.forEach(cmd => {
                console.log(`   ✅ ${cmd.name}: ${cmd.command} (${cmd.positionBefore} → ${cmd.positionAfter})`);
            });
            
            // Generate final control library
            console.log(`\n🔧 FlexiCart Control Library (FINAL):`);
            console.log(`=====================================`);
            movementCommands.forEach(cmd => {
                const hexBytes = cmd.command.match(/.{2}/g).map(b => '0x' + b).join(', ');
                console.log(`// ${cmd.name}: ${cmd.positionBefore} → ${cmd.positionAfter}`);
                console.log(`export const ${cmd.name} = Buffer.from([${hexBytes}]);`);
                console.log(``);
            });
            
        } else {
            console.log(`\n⚠️  No movement detected with exact protocol commands.`);
            console.log(`   The device is responding but may require:`);
            console.log(`   - Specific initialization sequence`);
            console.log(`   - Different command parameters`);
            console.log(`   - Manual unlock/enable procedure`);
            console.log(`   - Physical intervention (door open, manual mode, etc.)`);
        }
        
    } catch (error) {
        console.log(`❌ Exact protocol test failed: ${error.message}`);
    }
}

/**
 * Get position using exact FlexiCart commands
 */
async function getFlexiCartPositionExact(portPath) {
    const positionCommands = [
        FLEXICART_EXACT_COMMANDS.SENSE_BIN_STATUS,
        FLEXICART_EXACT_COMMANDS.SENSE_CC_STATUS,
        FLEXICART_EXACT_COMMANDS.POSITION_REQUEST_HEX,
        FLEXICART_EXACT_COMMANDS.SENSE_CART_STATUS
    ];
    
    for (const cmd of positionCommands) {
        try {
            const response = await sendCommand(portPath, cmd, 3000, false);
            if (response && response.length > 0) {
                // Simple position interpretation
                const meaningfulBytes = response.filter(b => b !== 0x55 && b !== 0x00);
                if (meaningfulBytes.length >= 2) {
                    const pos = meaningfulBytes[0];
                    if (pos === 0 || pos === 0xFF) return 'HOME';
                    if (pos >= 1 && pos <= 100) return `SLOT_${pos}`;
                    return `POS_${pos}`;
                }
            }
        } catch (error) {
            // Continue to next command
        }
    }
    
    return 'UNKNOWN';
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
testExactFlexiCartProtocol(portPath);