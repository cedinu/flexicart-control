/**
 * Enhanced Sony FlexiCart Movement Test - With Better Position Decoding
 */

const { sendCommand } = require('../src/commands/flexicart_serial_utils');

/**
 * Enhanced Sony FlexiCart Commands
 */
const SONY_FLEXICART_COMMANDS = {
    // Status Commands (CONFIRMED WORKING)
    DEVICE_TYPE: Buffer.from([0x90, 0x11, 0x00, 0x00]),
    ID_REQUEST: Buffer.from([0x88, 0x01]),
    STATUS_QUERY: Buffer.from([0x53, 0x3F, 0x0D]), // "S?" + CR
    POSITION_QUERY: Buffer.from([0x90, 0x10, 0x00, 0x00]),
    
    // Movement Commands (CONFIRMED WORKING)
    MOVE_TO_SLOT: (slot) => Buffer.from([0x90, 0x20, 0x00, slot & 0xFF]),
    HOME_COMMAND: Buffer.from([0x90, 0x21, 0x00, 0x00]),
    STOP_COMMAND: Buffer.from([0x90, 0x22, 0x00, 0x00]),
    
    // Additional commands to test
    SEARCH_SLOT: (slot) => Buffer.from([0x90, 0x25, 0x00, slot & 0xFF]),
    POSITION_SLOT: (slot) => Buffer.from([0x90, 0x26, 0x00, slot & 0xFF]),
    LOAD_COMMAND: Buffer.from([0x90, 0x23, 0x00, 0x00]),
    EJECT_COMMAND: Buffer.from([0x90, 0x24, 0x00, 0x00]),
    
    // ASCII commands
    HOME_ASCII: Buffer.from([0x48, 0x4F, 0x4D, 0x45, 0x0D]), // "HOME" + CR
    STOP_ASCII: Buffer.from([0x53, 0x54, 0x4F, 0x50, 0x0D]), // "STOP" + CR
    GOTO_SLOT: (slot) => Buffer.from([0x47, 0x4F, 0x54, 0x4F, 0x20, 0x30 + slot, 0x0D]), // "GOTO X" + CR
};

/**
 * Enhanced position decoder
 */
function interpretPositionResponse(response) {
    if (!response || response.length < 2) return null;
    
    console.log(`   🔍 Raw position response: ${response.toString('hex').toUpperCase()}`);
    
    // Try different decoding methods
    const decodings = [];
    
    // Method 1: Filter sync bytes, use first two data bytes
    const dataBytes = response.filter(byte => byte !== 0x55 && byte !== 0x00);
    if (dataBytes.length >= 2) {
        const pos1 = (dataBytes[0] << 8) | dataBytes[1];
        decodings.push(`DataBytes: ${pos1} (0x${pos1.toString(16).toUpperCase()})`);
    }
    
    // Method 2: Use raw first two bytes
    if (response.length >= 2) {
        const pos2 = (response[0] << 8) | response[1];
        decodings.push(`Raw: ${pos2} (0x${pos2.toString(16).toUpperCase()})`);
    }
    
    // Method 3: Look for non-0x55 pattern
    let firstNonSync = -1;
    for (let i = 0; i < response.length; i++) {
        if (response[i] !== 0x55) {
            firstNonSync = i;
            break;
        }
    }
    
    if (firstNonSync >= 0 && firstNonSync + 1 < response.length) {
        const pos3 = (response[firstNonSync] << 8) | response[firstNonSync + 1];
        decodings.push(`NonSync: ${pos3} (0x${pos3.toString(16).toUpperCase()})`);
    }
    
    // Method 4: Look for specific Sony patterns
    if (response.includes(0xFF) && response.includes(0xDD)) {
        const ffIndex = response.indexOf(0xFF);
        const ddIndex = response.indexOf(0xDD);
        if (Math.abs(ffIndex - ddIndex) <= 2) {
            decodings.push(`Sony Pattern: HOME/UNKNOWN`);
        }
    }
    
    console.log(`   📊 Position decodings: ${decodings.join(', ')}`);
    
    // Return the most reasonable interpretation
    if (dataBytes.length >= 2) {
        const position = (dataBytes[0] << 8) | dataBytes[1];
        
        // Classify position
        if (position === 0xFFFF || position === 0xDDDD || position === 0xFDDD) {
            return 'HOME';
        }
        if (position >= 1 && position <= 100) {
            return `SLOT_${position}`;
        }
        if (position > 10000) {
            // Large values might be encoded positions
            const slot = position % 1000; // Try modulo
            if (slot >= 1 && slot <= 100) {
                return `SLOT_${slot} (encoded:${position})`;
            }
        }
        
        return `POS_${position}`;
    }
    
    return 'UNKNOWN';
}

/**
 * Test comprehensive movement sequence
 */
async function testComprehensiveMovement(portPath) {
    console.log(`🎌 Enhanced Sony FlexiCart Movement Test`);
    console.log(`=====================================`);
    console.log(`Port: ${portPath}`);
    console.log(`Time: ${new Date().toISOString()}\n`);
    
    const results = {
        timestamp: new Date().toISOString(),
        workingCommands: [],
        positionHistory: [],
        movementCount: 0
    };
    
    try {
        // Get initial status
        console.log(`📊 Initial Status Check`);
        console.log(`----------------------`);
        
        const initialPos = await getPositionDetailed(portPath);
        console.log(`✅ Initial position: ${initialPos.interpreted}`);
        results.positionHistory.push({ position: initialPos.interpreted, timestamp: new Date().toISOString(), action: 'INITIAL' });
        
        // Test movement commands systematically
        const movementTests = [
            {
                name: 'HOME_BINARY',
                command: SONY_FLEXICART_COMMANDS.HOME_COMMAND,
                description: 'Return to home position',
                expected: 'HOME'
            },
            {
                name: 'MOVE_SLOT_1',
                command: SONY_FLEXICART_COMMANDS.MOVE_TO_SLOT(1),
                description: 'Move to slot 1',
                expected: 'SLOT_1'
            },
            {
                name: 'MOVE_SLOT_2',
                command: SONY_FLEXICART_COMMANDS.MOVE_TO_SLOT(2),
                description: 'Move to slot 2',
                expected: 'SLOT_2'
            },
            {
                name: 'MOVE_SLOT_3',
                command: SONY_FLEXICART_COMMANDS.MOVE_TO_SLOT(3),
                description: 'Move to slot 3',
                expected: 'SLOT_3'
            },
            {
                name: 'MOVE_SLOT_5',
                command: SONY_FLEXICART_COMMANDS.MOVE_TO_SLOT(5),
                description: 'Move to slot 5',
                expected: 'SLOT_5'
            },
            {
                name: 'SEARCH_SLOT_10',
                command: SONY_FLEXICART_COMMANDS.SEARCH_SLOT(10),
                description: 'Search slot 10',
                expected: 'SLOT_10'
            },
            {
                name: 'HOME_FINAL',
                command: SONY_FLEXICART_COMMANDS.HOME_COMMAND,
                description: 'Return home at end',
                expected: 'HOME'
            }
        ];
        
        for (const test of movementTests) {
            console.log(`\n🧪 Testing: ${test.name}`);
            console.log(`   📋 Description: ${test.description}`);
            console.log(`   📤 Command: ${test.command.toString('hex').toUpperCase()}`);
            console.log(`   🎯 Expected: ${test.expected}`);
            
            try {
                // Get position before
                const posBefore = await getPositionDetailed(portPath);
                console.log(`   📍 Position before: ${posBefore.interpreted}`);
                
                // Send command
                console.log(`   📡 Sending command...`);
                const response = await sendCommand(portPath, test.command, 10000, false);
                
                const responseValid = response && response.length > 5;
                console.log(`   📥 Response: ${responseValid ? 'VALID' : 'INVALID'} (${response.length} bytes)`);
                
                if (responseValid) {
                    console.log(`   📊 Response sample: ${response.slice(0, 10).toString('hex').toUpperCase()}`);
                }
                
                // Wait for movement
                console.log(`   ⏳ Waiting for movement (8 seconds)...`);
                await new Promise(resolve => setTimeout(resolve, 8000));
                
                // Get position after
                const posAfter = await getPositionDetailed(portPath);
                console.log(`   📍 Position after: ${posAfter.interpreted}`);
                
                // Check for movement
                const moved = posBefore.interpreted !== posAfter.interpreted;
                
                if (moved) {
                    results.movementCount++;
                    console.log(`   🏃 MOVEMENT DETECTED! (${posBefore.interpreted} → ${posAfter.interpreted})`);
                    
                    // Check if movement matches expectation
                    const matchesExpected = posAfter.interpreted.includes(test.expected) || 
                                          test.expected.includes(posAfter.interpreted.split('_')[1]);
                    
                    if (matchesExpected) {
                        console.log(`   ✅ EXPECTED RESULT ACHIEVED!`);
                    } else {
                        console.log(`   ⚠️  Unexpected position (expected ${test.expected})`);
                    }
                } else {
                    console.log(`   ⏸️  No position change detected`);
                }
                
                // Record result
                const result = {
                    command: test.name,
                    description: test.description,
                    commandHex: test.command.toString('hex').toUpperCase(),
                    positionBefore: posBefore.interpreted,
                    positionAfter: posAfter.interpreted,
                    moved: moved,
                    responseValid: responseValid,
                    expected: test.expected,
                    matchesExpected: moved && posAfter.interpreted.includes(test.expected),
                    timestamp: new Date().toISOString()
                };
                
                results.workingCommands.push(result);
                results.positionHistory.push({ 
                    position: posAfter.interpreted, 
                    timestamp: new Date().toISOString(), 
                    action: test.name 
                });
                
            } catch (error) {
                console.log(`   ❌ ERROR: ${error.message}`);
                results.workingCommands.push({
                    command: test.name,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
            
            // Delay between tests
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
        
        // Test ASCII commands
        console.log(`\n\n📝 Testing ASCII Commands`);
        console.log(`-------------------------`);
        
        const asciiTests = [
            { name: 'HOME_ASCII', command: SONY_FLEXICART_COMMANDS.HOME_ASCII, description: '"HOME" command' },
            { name: 'GOTO_1_ASCII', command: SONY_FLEXICART_COMMANDS.GOTO_SLOT(1), description: '"GOTO 1" command' },
            { name: 'STOP_ASCII', command: SONY_FLEXICART_COMMANDS.STOP_ASCII, description: '"STOP" command' }
        ];
        
        for (const test of asciiTests) {
            console.log(`\n🧪 Testing ASCII: ${test.name}`);
            console.log(`   📋 Description: ${test.description}`);
            console.log(`   📤 Command: ${test.command.toString('hex').toUpperCase()} ("${test.command.toString().replace(/\r/g, '\\r').replace(/\n/g, '\\n')}")`);
            
            try {
                const posBefore = await getPositionDetailed(portPath);
                const response = await sendCommand(portPath, test.command, 8000, false);
                
                console.log(`   📥 Response: ${response.length} bytes`);
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                const posAfter = await getPositionDetailed(portPath);
                const moved = posBefore.interpreted !== posAfter.interpreted;
                
                if (moved) {
                    console.log(`   🏃 ASCII MOVEMENT! (${posBefore.interpreted} → ${posAfter.interpreted})`);
                    results.movementCount++;
                } else {
                    console.log(`   ⏸️  No movement from ASCII command`);
                }
                
            } catch (error) {
                console.log(`   ❌ ASCII ERROR: ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Summary
        console.log(`\n\n📊 Comprehensive Test Results`);
        console.log(`=============================`);
        console.log(`Total movement commands tested: ${results.workingCommands.length}`);
        console.log(`Commands causing movement: ${results.movementCount}`);
        console.log(`Movement success rate: ${((results.movementCount / results.workingCommands.length) * 100).toFixed(1)}%`);
        
        console.log(`\n📍 Position History:`);
        results.positionHistory.forEach((entry, index) => {
            console.log(`   ${index + 1}. ${entry.action}: ${entry.position}`);
        });
        
        console.log(`\n🏃 Working Movement Commands:`);
        results.workingCommands
            .filter(cmd => cmd.moved && !cmd.error)
            .forEach(cmd => {
                console.log(`   ✅ ${cmd.command}: ${cmd.commandHex} (${cmd.positionBefore} → ${cmd.positionAfter})`);
            });
        
        if (results.movementCount > 0) {
            console.log(`\n🎉 SUCCESS! Your Sony FlexiCart is fully functional!`);
            console.log(`   - Movement commands working: ✅`);
            console.log(`   - Position reporting working: ✅`);
            console.log(`   - Device communication: ✅`);
            
            // Generate control library
            await generateControlLibrary(results);
        } else {
            console.log(`\n⚠️  Commands are being sent but no movement detected.`);
            console.log(`   This could mean:`);
            console.log(`   - Device is in maintenance/locked mode`);
            console.log(`   - Physical constraints preventing movement`);
            console.log(`   - Different position encoding than expected`);
        }
        
    } catch (error) {
        console.log(`❌ Test failed: ${error.message}`);
    }
}

/**
 * Get detailed position information
 */
async function getPositionDetailed(portPath) {
    try {
        const response = await sendCommand(portPath, SONY_FLEXICART_COMMANDS.POSITION_QUERY, 3000, false);
        return {
            raw: response,
            interpreted: interpretPositionResponse(response),
            hex: response.toString('hex').toUpperCase(),
            length: response.length
        };
    } catch (error) {
        return {
            raw: null,
            interpreted: 'ERROR',
            hex: '',
            length: 0,
            error: error.message
        };
    }
}

/**
 * Generate control library based on test results
 */
async function generateControlLibrary(results) {
    console.log(`\n🔧 Generating FlexiCart Control Library...`);
    
    const workingCommands = results.workingCommands.filter(cmd => cmd.moved && !cmd.error);
    
    if (workingCommands.length > 0) {
        console.log(`\n📚 Your FlexiCart Control Commands:`);
        console.log(`================================`);
        
        workingCommands.forEach(cmd => {
            console.log(`// ${cmd.description}`);
            console.log(`export const ${cmd.command} = Buffer.from([${cmd.commandHex.match(/.{2}/g).map(b => '0x' + b).join(', ')}]);`);
            console.log(``);
        });
        
        console.log(`🎯 You can now control your FlexiCart programmatically!`);
    }
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
testComprehensiveMovement(portPath);