/**
 * Fixed Sony Flexicart Movement Test - Using Correct Protocol
 */

const { sendCommand } = require('../src/commands/flexicart_serial_utils');

/**
 * Corrected Sony FlexiCart Command Set
 * Based on Sony protocol documentation and your successful status responses
 */
const SONY_FLEXICART_COMMANDS = {
    // Status Commands (CONFIRMED WORKING)
    DEVICE_TYPE: Buffer.from([0x90, 0x11, 0x00, 0x00]),
    ID_REQUEST: Buffer.from([0x88, 0x01]),
    STATUS_QUERY: Buffer.from([0x53, 0x3F, 0x0D]), // "S?" + CR
    POSITION_QUERY: Buffer.from([0x90, 0x10, 0x00, 0x00]),
    
    // Movement Commands - Sony FlexiCart Protocol Format
    // Format: [0x90][CMD][SLOT_HIGH][SLOT_LOW]
    MOVE_TO_SLOT: (slot) => Buffer.from([0x90, 0x20, 0x00, slot & 0xFF]),
    
    // Alternative movement formats to try
    GOTO_SLOT: (slot) => Buffer.from([0x47, 0x4F, 0x54, 0x4F, 0x20, 0x30 + slot, 0x0D]), // "GOTO X" + CR
    MOVE_ASCII: (slot) => Buffer.from([0x4D, 0x4F, 0x56, 0x45, 0x20, 0x30 + slot, 0x0D]), // "MOVE X" + CR
    
    // Home and control commands
    HOME_COMMAND: Buffer.from([0x90, 0x21, 0x00, 0x00]),
    HOME_ASCII: Buffer.from([0x48, 0x4F, 0x4D, 0x45, 0x0D]), // "HOME" + CR
    STOP_COMMAND: Buffer.from([0x90, 0x22, 0x00, 0x00]),
    STOP_ASCII: Buffer.from([0x53, 0x54, 0x4F, 0x50, 0x0D]), // "STOP" + CR
    
    // Load/Eject commands
    LOAD_COMMAND: Buffer.from([0x90, 0x23, 0x00, 0x00]),
    EJECT_COMMAND: Buffer.from([0x90, 0x24, 0x00, 0x00]),
    
    // Extended movement commands (some FlexiCarts support these)
    SEARCH_SLOT: (slot) => Buffer.from([0x90, 0x25, 0x00, slot & 0xFF]),
    POSITION_SLOT: (slot) => Buffer.from([0x90, 0x26, 0x00, slot & 0xFF]),
};

/**
 * Test Sony FlexiCart movement with multiple command formats
 */
async function testSonyFlexiCartMovement(portPath) {
    console.log(`🎌 Sony FlexiCart Movement Test (Protocol Fixed)`);
    console.log(`===============================================`);
    console.log(`Port: ${portPath}`);
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    const results = {
        timestamp: new Date().toISOString(),
        workingCommands: [],
        failedCommands: [],
        movementDetected: false,
        totalTests: 0
    };
    
    try {
        // First, get initial status and position
        console.log(`📊 Getting initial device status...`);
        const initialStatus = await getDeviceStatus(portPath);
        console.log(`   Initial Position: ${initialStatus.position || 'Unknown'}`);
        console.log(`   Device Ready: ${initialStatus.ready ? 'YES' : 'NO'}`);
        
        if (!initialStatus.ready) {
            console.log(`   ⚠️  Device not ready - continuing anyway...`);
        }
        
        // Test different movement command formats
        const movementTests = [
            {
                name: 'HOME_BINARY',
                command: SONY_FLEXICART_COMMANDS.HOME_COMMAND,
                description: 'Binary home command (0x90 0x21 0x00 0x00)',
                target: 'HOME'
            },
            {
                name: 'HOME_ASCII',
                command: SONY_FLEXICART_COMMANDS.HOME_ASCII,
                description: 'ASCII home command ("HOME")',
                target: 'HOME'
            },
            {
                name: 'MOVE_SLOT_1_BINARY',
                command: SONY_FLEXICART_COMMANDS.MOVE_TO_SLOT(1),
                description: 'Binary move to slot 1 (0x90 0x20 0x00 0x01)',
                target: 1
            },
            {
                name: 'GOTO_SLOT_1_ASCII',
                command: SONY_FLEXICART_COMMANDS.GOTO_SLOT(1),
                description: 'ASCII goto slot 1 ("GOTO 1")',
                target: 1
            },
            {
                name: 'MOVE_SLOT_2_BINARY',
                command: SONY_FLEXICART_COMMANDS.MOVE_TO_SLOT(2),
                description: 'Binary move to slot 2 (0x90 0x20 0x00 0x02)',
                target: 2
            },
            {
                name: 'SEARCH_SLOT_3',
                command: SONY_FLEXICART_COMMANDS.SEARCH_SLOT(3),
                description: 'Search/move to slot 3 (0x90 0x25 0x00 0x03)',
                target: 3
            },
            {
                name: 'STOP_COMMAND',
                command: SONY_FLEXICART_COMMANDS.STOP_COMMAND,
                description: 'Stop movement command (0x90 0x22 0x00 0x00)',
                target: 'STOP'
            }
        ];
        
        for (const test of movementTests) {
            console.log(`\n🧪 Testing: ${test.name}`);
            console.log(`   Description: ${test.description}`);
            console.log(`   Command: ${test.command.toString('hex').toUpperCase()}`);
            
            results.totalTests++;
            
            try {
                // Get position before command
                const posBefore = await getPosition(portPath);
                console.log(`   Position before: ${posBefore || 'Unknown'}`);
                
                // Send movement command with extended timeout
                console.log(`   📤 Sending command...`);
                const response = await sendCommand(portPath, test.command, 8000, true);
                
                // Analyze response
                const responseValid = analyzeSonyResponse(response);
                console.log(`   📥 Response: ${responseValid ? 'VALID' : 'INVALID'} (${response.length} bytes)`);
                
                if (response.length > 0) {
                    console.log(`   📊 Response data: ${response.slice(0, 10).toString('hex').toUpperCase()}`);
                }
                
                // Wait for movement to complete
                console.log(`   ⏳ Waiting for movement (5 seconds)...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Check position after
                const posAfter = await getPosition(portPath);
                console.log(`   Position after: ${posAfter || 'Unknown'}`);
                
                // Determine if movement occurred
                const moved = (posBefore !== posAfter) || 
                             (responseValid && response.length > 5);
                
                const result = {
                    command: test.name,
                    description: test.description,
                    target: test.target,
                    commandHex: test.command.toString('hex').toUpperCase(),
                    positionBefore: posBefore,
                    positionAfter: posAfter,
                    moved: moved,
                    responseValid: responseValid,
                    responseLength: response.length,
                    success: responseValid && !response.includes(0xFF), // No error bytes
                    timestamp: new Date().toISOString()
                };
                
                if (result.success) {
                    results.workingCommands.push(result);
                    console.log(`   ✅ SUCCESS: Command accepted`);
                    
                    if (moved) {
                        results.movementDetected = true;
                        console.log(`   🏃 MOVEMENT DETECTED!`);
                    }
                } else {
                    results.failedCommands.push(result);
                    console.log(`   ❌ FAILED: Command not accepted`);
                }
                
            } catch (error) {
                console.log(`   ❌ ERROR: ${error.message}`);
                results.failedCommands.push({
                    command: test.name,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Delay between tests
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Summary
        console.log(`\n\n📊 Test Results Summary`);
        console.log(`======================`);
        console.log(`Total tests: ${results.totalTests}`);
        console.log(`Working commands: ${results.workingCommands.length}`);
        console.log(`Failed commands: ${results.failedCommands.length}`);
        console.log(`Movement detected: ${results.movementDetected ? 'YES' : 'NO'}`);
        
        if (results.workingCommands.length > 0) {
            console.log(`\n✅ Working Commands:`);
            results.workingCommands.forEach(cmd => {
                console.log(`   📋 ${cmd.command}: ${cmd.commandHex}`);
                if (cmd.moved) console.log(`      🏃 CAUSED MOVEMENT!`);
            });
        }
        
        if (results.movementDetected) {
            console.log(`\n🎉 SUCCESS: Your FlexiCart responds to movement commands!`);
            
            // Try a final movement test
            console.log(`\n🧪 Final Test: Complete Movement Sequence`);
            await testMovementSequence(portPath);
        } else {
            console.log(`\n⚠️  No movement detected. Possible causes:`);
            console.log(`   - Device may be locked or in safety mode`);
            console.log(`   - Movement may be too subtle to detect`);
            console.log(`   - Device may need initialization sequence`);
            console.log(`   - Check if cartridges are loaded`);
        }
        
    } catch (error) {
        console.log(`❌ Test failed: ${error.message}`);
    }
}

/**
 * Get current device status
 */
async function getDeviceStatus(portPath) {
    try {
        const statusResponse = await sendCommand(portPath, SONY_FLEXICART_COMMANDS.STATUS_QUERY, 3000, false);
        const positionResponse = await sendCommand(portPath, SONY_FLEXICART_COMMANDS.POSITION_QUERY, 3000, false);
        
        return {
            ready: statusResponse.length > 0 && !statusResponse.includes(0xFF),
            position: interpretPositionResponse(positionResponse),
            statusData: statusResponse.slice(0, 5).toString('hex')
        };
    } catch (error) {
        return { ready: false, position: null, error: error.message };
    }
}

/**
 * Get current position
 */
async function getPosition(portPath) {
    try {
        const response = await sendCommand(portPath, SONY_FLEXICART_COMMANDS.POSITION_QUERY, 3000, false);
        return interpretPositionResponse(response);
    } catch (error) {
        return null;
    }
}

/**
 * Interpret position response
 */
function interpretPositionResponse(response) {
    if (!response || response.length < 2) return null;
    
    // Filter out sync bytes and get meaningful data
    const dataBytes = response.filter(byte => byte !== 0x55 && byte !== 0x00);
    
    if (dataBytes.length >= 2) {
        const position = (dataBytes[0] << 8) | dataBytes[1];
        
        if (position === 0xFFFF || position === 0xDDDD) return 'HOME';
        if (position >= 1 && position <= 100) return `SLOT_${position}`;
        return position.toString();
    }
    
    return 'UNKNOWN';
}

/**
 * Analyze Sony response for validity
 */
function analyzeSonyResponse(response) {
    if (!response || response.length === 0) return false;
    
    // Sony responses typically start with specific bytes
    if (response[0] === 0xFF && response.length > 3) return true;
    if (response.includes(0x55)) return true; // Sync bytes present
    if (response.length > 10) return true; // Substantial response
    
    return false;
}

/**
 * Test complete movement sequence
 */
async function testMovementSequence(portPath) {
    console.log(`🔄 Testing complete movement sequence...`);
    
    const sequence = [
        { name: 'HOME', command: SONY_FLEXICART_COMMANDS.HOME_COMMAND },
        { name: 'SLOT_1', command: SONY_FLEXICART_COMMANDS.MOVE_TO_SLOT(1) },
        { name: 'SLOT_2', command: SONY_FLEXICART_COMMANDS.MOVE_TO_SLOT(2) },
        { name: 'HOME', command: SONY_FLEXICART_COMMANDS.HOME_COMMAND }
    ];
    
    for (const step of sequence) {
        console.log(`   📍 Moving to ${step.name}...`);
        
        try {
            const response = await sendCommand(portPath, step.command, 8000, false);
            console.log(`   ✅ Command sent: ${step.command.toString('hex').toUpperCase()}`);
            
            await new Promise(resolve => setTimeout(resolve, 4000));
            
            const position = await getPosition(portPath);
            console.log(`   📊 Current position: ${position || 'Unknown'}`);
            
        } catch (error) {
            console.log(`   ❌ Failed: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
testSonyFlexiCartMovement(portPath);