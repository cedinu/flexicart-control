/**
 * FlexiCart Protocol Test - Using Correct Commands from Documentation
 */

const { sendCommand } = require('../src/commands/flexicart_serial_utils');

/**
 * Correct FlexiCart Command Set (from FLEXICART_PT1.pdf)
 * Format: [STX][ADDR][CMD][DATA][ETX][CHECKSUM]
 */
const FLEXICART_COMMANDS = {
    // Control characters
    STX: 0x02,  // Start of text
    ETX: 0x03,  // End of text
    CR:  0x0D,  // Carriage return
    LF:  0x0A,  // Line feed
    
    // Standard FlexiCart commands
    STATUS_REQUEST: Buffer.from([0x02, 0x30, 0x30, 0x53, 0x03]),           // "00S" - Status
    POSITION_REQUEST: Buffer.from([0x02, 0x30, 0x30, 0x50, 0x03]),         // "00P" - Position
    HOME_COMMAND: Buffer.from([0x02, 0x30, 0x30, 0x48, 0x03]),             // "00H" - Home
    
    // Movement commands - Format: [STX]00M[slot][ETX]
    MOVE_TO_SLOT: (slot) => {
        const slotStr = slot.toString().padStart(2, '0');
        return Buffer.from([0x02, 0x30, 0x30, 0x4D, slotStr.charCodeAt(0), slotStr.charCodeAt(1), 0x03]);
    },
    
    // Alternative ASCII format
    ASCII_STATUS: Buffer.from("STATUS\r\n"),
    ASCII_HOME: Buffer.from("HOME\r\n"),
    ASCII_POSITION: Buffer.from("POSITION\r\n"),
    ASCII_MOVE: (slot) => Buffer.from(`MOVE ${slot}\r\n`),
    ASCII_GOTO: (slot) => Buffer.from(`GOTO ${slot}\r\n`),
    
    // Sony VTR protocol commands (if it's a hybrid device)
    SONY_DEVICE_ID: Buffer.from([0x88, 0x01]),
    SONY_STATUS: Buffer.from([0x61, 0x20, 0x00, 0x00]),
    SONY_POSITION: Buffer.from([0x61, 0x12, 0x00, 0x00]),
    SONY_SEARCH: (slot) => Buffer.from([0x61, 0x31, 0x00, slot & 0xFF]),
    
    // Simple binary commands
    BINARY_HOME: Buffer.from([0x48]),       // 'H'
    BINARY_STATUS: Buffer.from([0x53]),     // 'S'
    BINARY_POSITION: Buffer.from([0x50]),   // 'P'
    BINARY_MOVE: (slot) => Buffer.from([0x4D, slot & 0xFF]), // 'M' + slot
};

/**
 * Test FlexiCart with correct protocol
 */
async function testFlexiCartProtocol(portPath) {
    console.log(`📀 FlexiCart Protocol Test (Using Correct Commands)`);
    console.log(`=================================================`);
    console.log(`Port: ${portPath}`);
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    const results = {
        workingCommands: [],
        movementDetected: false,
        positionHistory: []
    };
    
    try {
        // Test 1: Basic status and position queries
        console.log(`📊 Phase 1: Status and Position Queries`);
        console.log(`--------------------------------------`);
        
        const statusTests = [
            { name: 'FLEXICART_STATUS', cmd: FLEXICART_COMMANDS.STATUS_REQUEST, desc: 'FlexiCart status request' },
            { name: 'FLEXICART_POSITION', cmd: FLEXICART_COMMANDS.POSITION_REQUEST, desc: 'FlexiCart position request' },
            { name: 'ASCII_STATUS', cmd: FLEXICART_COMMANDS.ASCII_STATUS, desc: 'ASCII status command' },
            { name: 'ASCII_POSITION', cmd: FLEXICART_COMMANDS.ASCII_POSITION, desc: 'ASCII position command' },
            { name: 'SONY_DEVICE_ID', cmd: FLEXICART_COMMANDS.SONY_DEVICE_ID, desc: 'Sony device ID' },
            { name: 'BINARY_STATUS', cmd: FLEXICART_COMMANDS.BINARY_STATUS, desc: 'Simple binary status' }
        ];
        
        for (const test of statusTests) {
            console.log(`\n🧪 Testing: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
            console.log(`   📤 ASCII: "${test.cmd.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/[\x00-\x1F\x7F]/g, '.')}"`);
            
            try {
                const response = await sendCommand(portPath, test.cmd, 5000, false);
                console.log(`   📥 Response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response hex: ${response.slice(0, 20).toString('hex').toUpperCase()}`);
                    console.log(`   📊 Response ASCII: "${response.toString().replace(/[\x00-\x1F\x7F]/g, '.')}"`);
                    
                    // Try to interpret response
                    const interpretation = interpretFlexiCartResponse(response);
                    if (interpretation) {
                        console.log(`   📍 Interpreted: ${interpretation}`);
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
            
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Test 2: Movement commands
        console.log(`\n\n🏃 Phase 2: Movement Commands`);
        console.log(`-----------------------------`);
        
        const movementTests = [
            { name: 'FLEXICART_HOME', cmd: FLEXICART_COMMANDS.HOME_COMMAND, desc: 'FlexiCart home command', target: 'HOME' },
            { name: 'ASCII_HOME', cmd: FLEXICART_COMMANDS.ASCII_HOME, desc: 'ASCII home command', target: 'HOME' },
            { name: 'BINARY_HOME', cmd: FLEXICART_COMMANDS.BINARY_HOME, desc: 'Binary home command', target: 'HOME' },
            { name: 'FLEXICART_MOVE_01', cmd: FLEXICART_COMMANDS.MOVE_TO_SLOT(1), desc: 'FlexiCart move to slot 1', target: 'SLOT_1' },
            { name: 'ASCII_MOVE_01', cmd: FLEXICART_COMMANDS.ASCII_MOVE(1), desc: 'ASCII move to slot 1', target: 'SLOT_1' },
            { name: 'ASCII_GOTO_02', cmd: FLEXICART_COMMANDS.ASCII_GOTO(2), desc: 'ASCII goto slot 2', target: 'SLOT_2' },
            { name: 'BINARY_MOVE_03', cmd: FLEXICART_COMMANDS.BINARY_MOVE(3), desc: 'Binary move to slot 3', target: 'SLOT_3' },
            { name: 'SONY_SEARCH_05', cmd: FLEXICART_COMMANDS.SONY_SEARCH(5), desc: 'Sony search slot 5', target: 'SLOT_5' }
        ];
        
        for (const test of movementTests) {
            console.log(`\n🧪 Testing Movement: ${test.name}`);
            console.log(`   📋 ${test.desc}`);
            console.log(`   📤 Command: ${test.cmd.toString('hex').toUpperCase()}`);
            console.log(`   📤 ASCII: "${test.cmd.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/[\x00-\x1F\x7F]/g, '.')}"`);
            console.log(`   🎯 Target: ${test.target}`);
            
            try {
                // Get position before
                const posBefore = await getFlexiCartPosition(portPath);
                console.log(`   📍 Position before: ${posBefore || 'Unknown'}`);
                
                // Send movement command
                const response = await sendCommand(portPath, test.cmd, 10000, false);
                console.log(`   📥 Movement response: ${response.length} bytes`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response: ${response.slice(0, 20).toString('hex').toUpperCase()}`);
                }
                
                // Wait for movement
                console.log(`   ⏳ Waiting for movement (10 seconds)...`);
                await new Promise(resolve => setTimeout(resolve, 10000));
                
                // Get position after
                const posAfter = await getFlexiCartPosition(portPath);
                console.log(`   📍 Position after: ${posAfter || 'Unknown'}`);
                
                // Check for movement
                const moved = posBefore !== posAfter;
                
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
                } else {
                    console.log(`   ⏸️  No position change detected`);
                }
                
            } catch (error) {
                console.log(`   ❌ Movement error: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Summary
        console.log(`\n\n📊 Protocol Test Results`);
        console.log(`========================`);
        console.log(`Working commands: ${results.workingCommands.length}`);
        console.log(`Movement detected: ${results.movementDetected ? 'YES' : 'NO'}`);
        
        if (results.workingCommands.length > 0) {
            console.log(`\n✅ Working Commands:`);
            results.workingCommands.forEach(cmd => {
                console.log(`   📋 ${cmd.name}: ${cmd.command}`);
                if (cmd.moved) {
                    console.log(`      🏃 MOVEMENT: ${cmd.positionBefore} → ${cmd.positionAfter}`);
                }
            });
        }
        
        if (results.movementDetected) {
            console.log(`\n🎉 SUCCESS! FlexiCart movement commands identified!`);
            generateFlexiCartLibrary(results);
        } else {
            console.log(`\n⚠️  No movement detected. The device may:`);
            console.log(`   - Be in a locked/maintenance mode`);
            console.log(`   - Require different command syntax`);
            console.log(`   - Need initialization sequence`);
            console.log(`   - Be responding but not physically moving`);
        }
        
    } catch (error) {
        console.log(`❌ Protocol test failed: ${error.message}`);
    }
}

/**
 * Get FlexiCart position using multiple methods
 */
async function getFlexiCartPosition(portPath) {
    const positionCommands = [
        FLEXICART_COMMANDS.POSITION_REQUEST,
        FLEXICART_COMMANDS.ASCII_POSITION,
        FLEXICART_COMMANDS.BINARY_POSITION,
        FLEXICART_COMMANDS.SONY_POSITION
    ];
    
    for (const cmd of positionCommands) {
        try {
            const response = await sendCommand(portPath, cmd, 3000, false);
            const position = interpretFlexiCartResponse(response);
            if (position && position !== 'UNKNOWN') {
                return position;
            }
        } catch (error) {
            // Try next command
        }
    }
    
    return 'UNKNOWN';
}

/**
 * Interpret FlexiCart response
 */
function interpretFlexiCartResponse(response) {
    if (!response || response.length === 0) return null;
    
    // Try ASCII interpretation
    const ascii = response.toString().trim();
    if (ascii.match(/^(HOME|SLOT_?\d+|POSITION\s*\d+)$/i)) {
        return ascii.toUpperCase();
    }
    
    // Try binary interpretation
    if (response.length >= 2) {
        // Check for STX/ETX framing
        if (response[0] === 0x02 && response.includes(0x03)) {
            const data = response.slice(1, response.indexOf(0x03));
            const dataStr = data.toString().trim();
            if (dataStr.match(/^\d+$/)) {
                const position = parseInt(dataStr);
                if (position === 0) return 'HOME';
                if (position >= 1 && position <= 100) return `SLOT_${position}`;
                return `POS_${position}`;
            }
        }
        
        // Check for simple numeric response
        if (response.length === 2) {
            const position = (response[0] << 8) | response[1];
            if (position === 0 || position === 0xFFFF) return 'HOME';
            if (position >= 1 && position <= 100) return `SLOT_${position}`;
            return `POS_${position}`;
        }
    }
    
    return 'UNKNOWN';
}

/**
 * Generate working FlexiCart control library
 */
function generateFlexiCartLibrary(results) {
    console.log(`\n🔧 FlexiCart Control Library`);
    console.log(`===========================`);
    
    const movementCommands = results.workingCommands.filter(cmd => cmd.moved);
    
    if (movementCommands.length > 0) {
        console.log(`\n// Working FlexiCart Movement Commands`);
        movementCommands.forEach(cmd => {
            const hexBytes = cmd.command.match(/.{2}/g).map(b => '0x' + b).join(', ');
            console.log(`export const ${cmd.name} = Buffer.from([${hexBytes}]); // ${cmd.positionBefore} → ${cmd.positionAfter}`);
        });
        
        console.log(`\n🎯 You now have working FlexiCart control commands!`);
    }
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
testFlexiCartProtocol(portPath);