/**
 * Sony Flexicart Protocol Implementation
 * Specialized module for Sony VTR-style Flexicart communication
 */

// Import from the new serial utils module instead of main interface
const { sendCommand } = require('./flexicart_serial_utils');

/**
 * Sony VTR Command Constants
 */
const SONY_COMMANDS = {
    // High-level status commands (working well)
    DEVICE_TYPE: Buffer.from([0x90, 0x11, 0x00, 0x00]),        // Returns 3 data bytes
    SENSE_STATUS: Buffer.from([0x90, 0x61, 0x00, 0x00]),       // Returns 3 data bytes  
    POSITION_STATUS: Buffer.from([0x90, 0x10, 0x00, 0x00]),    // Returns 2 data bytes
    GENERAL_STATUS: Buffer.from([0x90, 0x60, 0x00, 0x00]),     // Returns sync pattern
    
    // Alternative command formats (also working)
    ID_REQUEST: Buffer.from([0x88, 0x01]),                     // Returns 3 data bytes
    STATUS_REQUEST: Buffer.from([0x88, 0x20]),                 // Returns 1 data byte
    
    // Text-based queries (working well)
    STATUS_QUERY: Buffer.from([0x53, 0x3F, 0x0D]),             // "S?" + CR - Returns 2 data bytes
    ID_QUERY: Buffer.from([0x49, 0x44, 0x3F, 0x0D]),           // "ID?" + CR - Returns 3 data bytes
    
    // Control commands
    HOME_COMMAND: Buffer.from([0x48, 0x4F, 0x4D, 0x45, 0x0D]), // "HOME" + CR - Returns 3 data bytes
    STOP_COMMAND: Buffer.from([0x53, 0x54, 0x4F, 0x50, 0x0D]), // "STOP" + CR
    
    // Movement commands (to be tested)
    SONY_STOP: Buffer.from([0x90, 0x20, 0x00, 0x00]),
    SONY_EJECT: Buffer.from([0x90, 0x2A, 0x00, 0x00]),
    SONY_LOAD: Buffer.from([0x90, 0x2B, 0x00, 0x00])
};

/**
 * Get detailed Sony device information
 * @param {string} path - Serial port path
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Device information
 */
async function getSonyDeviceInfo(path, debug = false) {
    if (debug) console.log(`🎌 Getting Sony device information from ${path}...`);
    
    const deviceInfo = {
        deviceType: null,
        deviceId: null,
        position: null,
        status: null,
        capabilities: [],
        raw: {},
        timestamp: new Date().toISOString()
    };
    
    try {
        // 1. Get Device Type (3 data bytes)
        if (debug) console.log(`   📋 Querying device type...`);
        const typeResponse = await sendCommand(path, SONY_COMMANDS.DEVICE_TYPE, 3000, debug);
        const typeAnalysis = analyzeSonyResponse(typeResponse);
        deviceInfo.raw.deviceType = typeResponse.toString('hex');
        
        if (typeAnalysis.nonSyncBytes.length >= 3) {
            deviceInfo.deviceType = {
                manufacturer: typeAnalysis.nonSyncBytes[0],
                model: typeAnalysis.nonSyncBytes[1],
                version: typeAnalysis.nonSyncBytes[2],
                decoded: `Manufacturer: 0x${typeAnalysis.nonSyncBytes[0].toString(16)}, Model: 0x${typeAnalysis.nonSyncBytes[1].toString(16)}, Version: 0x${typeAnalysis.nonSyncBytes[2].toString(16)}`
            };
            if (debug) console.log(`   ✅ Device Type: ${deviceInfo.deviceType.decoded}`);
        }
        
        // 2. Get Device ID (3 data bytes)
        if (debug) console.log(`   📋 Querying device ID...`);
        const idResponse = await sendCommand(path, SONY_COMMANDS.ID_REQUEST, 3000, debug);
        const idAnalysis = analyzeSonyResponse(idResponse);
        deviceInfo.raw.deviceId = idResponse.toString('hex');
        
        if (idAnalysis.nonSyncBytes.length >= 3) {
            deviceInfo.deviceId = {
                id1: idAnalysis.nonSyncBytes[0],
                id2: idAnalysis.nonSyncBytes[1], 
                id3: idAnalysis.nonSyncBytes[2],
                decoded: `ID: ${idAnalysis.nonSyncBytes[0]}-${idAnalysis.nonSyncBytes[1]}-${idAnalysis.nonSyncBytes[2]}`,
                hex: idAnalysis.nonSyncBytes.map(b => b.toString(16).padStart(2, '0')).join('')
            };
            if (debug) console.log(`   ✅ Device ID: ${deviceInfo.deviceId.decoded}`);
        }
        
        // 3. Get Position Status (2 data bytes)
        if (debug) console.log(`   📋 Querying position status...`);
        const posResponse = await sendCommand(path, SONY_COMMANDS.POSITION_STATUS, 3000, debug);
        const posAnalysis = analyzeSonyResponse(posResponse);
        deviceInfo.raw.position = posResponse.toString('hex');
        
        if (posAnalysis.nonSyncBytes.length >= 2) {
            deviceInfo.position = {
                currentHigh: posAnalysis.nonSyncBytes[0],
                currentLow: posAnalysis.nonSyncBytes[1],
                current: (posAnalysis.nonSyncBytes[0] << 8) | posAnalysis.nonSyncBytes[1],
                decoded: `Position: ${(posAnalysis.nonSyncBytes[0] << 8) | posAnalysis.nonSyncBytes[1]}`
            };
            if (debug) console.log(`   ✅ Position: ${deviceInfo.position.decoded}`);
        }
        
        // 4. Get Sense Status (3 data bytes) - this often contains operational status
        if (debug) console.log(`   📋 Querying sense status...`);
        const senseResponse = await sendCommand(path, SONY_COMMANDS.SENSE_STATUS, 3000, debug);
        const senseAnalysis = analyzeSonyResponse(senseResponse);
        deviceInfo.raw.sense = senseResponse.toString('hex');
        
        if (senseAnalysis.nonSyncBytes.length >= 3) {
            deviceInfo.status = {
                status1: senseAnalysis.nonSyncBytes[0],
                status2: senseAnalysis.nonSyncBytes[1],
                status3: senseAnalysis.nonSyncBytes[2],
                decoded: `Status: 0x${senseAnalysis.nonSyncBytes[0].toString(16)} 0x${senseAnalysis.nonSyncBytes[1].toString(16)} 0x${senseAnalysis.nonSyncBytes[2].toString(16)}`,
                interpretation: interpretSonyStatus(senseAnalysis.nonSyncBytes)
            };
            if (debug) console.log(`   ✅ Sense Status: ${deviceInfo.status.decoded}`);
            if (debug) console.log(`   📊 Interpretation: ${deviceInfo.status.interpretation}`);
        }
        
        // Determine capabilities
        deviceInfo.capabilities = [
            'SONY_VTR_PROTOCOL',
            'DEVICE_IDENTIFICATION', 
            'POSITION_REPORTING',
            'STATUS_MONITORING'
        ];
        
        if (deviceInfo.deviceType) deviceInfo.capabilities.push('TYPE_DETECTION');
        if (deviceInfo.deviceId) deviceInfo.capabilities.push('ID_REPORTING');
        if (deviceInfo.position) deviceInfo.capabilities.push('POSITION_TRACKING');
        if (deviceInfo.status) deviceInfo.capabilities.push('STATUS_SENSE');
        
        return {
            success: true,
            deviceInfo: deviceInfo
        };
        
    } catch (error) {
        if (debug) console.log(`❌ Device info query failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            deviceInfo: deviceInfo // Return partial info
        };
    }
}

/**
 * Test Sony movement commands with detailed analysis
 * @param {string} path - Serial port path
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Movement test results
 */
async function testSonyMovementCommands(path, debug = false) {
    if (debug) console.log(`🏃 Testing Sony movement commands on ${path}...`);
    
    const movementTests = [
        { name: 'HOME_TEXT', command: SONY_COMMANDS.HOME_COMMAND, description: 'Text-based HOME command' },
        { name: 'STOP_TEXT', command: SONY_COMMANDS.STOP_COMMAND, description: 'Text-based STOP command' },
        { name: 'SONY_STOP', command: SONY_COMMANDS.SONY_STOP, description: 'Sony VTR STOP command' },
        { name: 'SONY_EJECT', command: SONY_COMMANDS.SONY_EJECT, description: 'Sony VTR EJECT command' },
        { name: 'SONY_LOAD', command: SONY_COMMANDS.SONY_LOAD, description: 'Sony VTR LOAD command' }
    ];
    
    const results = [];
    
    for (const test of movementTests) {
        if (debug) console.log(`\n   🧪 Testing: ${test.name} - ${test.description}`);
        
        try {
            // Get position before movement
            const posBefore = await sendCommand(path, SONY_COMMANDS.POSITION_STATUS, 2000, debug);
            const beforeAnalysis = analyzeSonyResponse(posBefore);
            
            // Send movement command
            const response = await sendCommand(path, test.command, 5000, debug);
            const responseAnalysis = analyzeSonyResponse(response);
            
            // Wait a moment, then check position again
            await new Promise(resolve => setTimeout(resolve, 1000));
            const posAfter = await sendCommand(path, SONY_COMMANDS.POSITION_STATUS, 2000, debug);
            const afterAnalysis = analyzeSonyResponse(posAfter);
            
            const result = {
                command: test.name,
                description: test.description,
                success: true,
                response: responseAnalysis,
                positionBefore: beforeAnalysis.nonSyncBytes,
                positionAfter: afterAnalysis.nonSyncBytes,
                positionChanged: JSON.stringify(beforeAnalysis.nonSyncBytes) !== JSON.stringify(afterAnalysis.nonSyncBytes),
                raw: {
                    command: test.command.toString('hex'),
                    response: response.toString('hex'),
                    posBefore: posBefore.toString('hex'),
                    posAfter: posAfter.toString('hex')
                }
            };
            
            results.push(result);
            
            if (debug) {
                console.log(`   ✅ Command sent successfully`);
                console.log(`   📍 Position before: [${beforeAnalysis.nonSyncBytes.map(b => '0x' + b.toString(16)).join(', ')}]`);
                console.log(`   📍 Position after:  [${afterAnalysis.nonSyncBytes.map(b => '0x' + b.toString(16)).join(', ')}]`);
                console.log(`   🔄 Position changed: ${result.positionChanged ? 'YES' : 'NO'}`);
                
                if (responseAnalysis.nonSyncBytes.length > 0) {
                    console.log(`   📋 Response data: [${responseAnalysis.nonSyncBytes.map(b => '0x' + b.toString(16)).join(', ')}]`);
                }
            }
            
        } catch (error) {
            results.push({
                command: test.name,
                description: test.description,
                success: false,
                error: error.message
            });
            
            if (debug) console.log(`   ❌ Failed: ${error.message}`);
        }
        
        // Delay between movement commands
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return {
        success: true,
        movementTests: results,
        summary: {
            total: results.length,
            successful: results.filter(r => r.success).length,
            withMovement: results.filter(r => r.success && r.positionChanged).length
        }
    };
}

/**
 * Test specific position movement
 * @param {string} path - Serial port path
 * @param {number} targetPosition - Target position number
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Position movement result
 */
async function testSonyPositionMovement(path, targetPosition, debug = false) {
    if (debug) console.log(`📍 Testing Sony position movement to slot ${targetPosition}...`);
    
    try {
        // Get current position
        const currentPosResponse = await sendCommand(path, SONY_COMMANDS.POSITION_STATUS, 3000, debug);
        const currentAnalysis = analyzeSonyResponse(currentPosResponse);
        const currentPosition = currentAnalysis.nonSyncBytes.length >= 2 ? 
            (currentAnalysis.nonSyncBytes[0] << 8) | currentAnalysis.nonSyncBytes[1] : 0;
        
        if (debug) console.log(`   📍 Current position: ${currentPosition}`);
        
        // Create and send position command
        const positionCommand = createSonyPositionCommand(targetPosition);
        if (debug) console.log(`   📤 Sending position command: ${positionCommand.toString('hex')}`);
        
        const moveResponse = await sendCommand(path, positionCommand, 10000, debug);
        const moveAnalysis = analyzeSonyResponse(moveResponse);
        
        // Wait for movement to complete
        if (debug) console.log(`   ⏳ Waiting for movement to complete...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Check final position
        const finalPosResponse = await sendCommand(path, SONY_COMMANDS.POSITION_STATUS, 3000, debug);
        const finalAnalysis = analyzeSonyResponse(finalPosResponse);
        const finalPosition = finalAnalysis.nonSyncBytes.length >= 2 ? 
            (finalAnalysis.nonSyncBytes[0] << 8) | finalAnalysis.nonSyncBytes[1] : 0;
        
        if (debug) console.log(`   📍 Final position: ${finalPosition}`);
        
        const success = Math.abs(finalPosition - targetPosition) <= 1; // Allow 1 position tolerance
        
        return {
            success: success,
            targetPosition: targetPosition,
            currentPosition: currentPosition,
            finalPosition: finalPosition,
            moved: currentPosition !== finalPosition,
            reachedTarget: success,
            moveResponse: moveAnalysis,
            raw: {
                command: positionCommand.toString('hex'),
                moveResponse: moveResponse.toString('hex'),
                currentPos: currentPosResponse.toString('hex'),
                finalPos: finalPosResponse.toString('hex')
            }
        };
        
    } catch (error) {
        if (debug) console.log(`❌ Position movement failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            targetPosition: targetPosition
        };
    }
}

/**
 * Create a position command for Sony Flexicart
 * @param {number} position - Target position (0-255)
 * @returns {Buffer} Sony position command
 */
function createSonyPositionCommand(position) {
    // Sony VTR position command format: [0x90, 0x24, high_byte, low_byte]
    return Buffer.from([0x90, 0x24, 0x00, position & 0xFF]);
}

/**
 * Interpret Sony status bytes
 * @param {Array} statusBytes - Array of status bytes
 * @returns {string} Interpretation
 */
function interpretSonyStatus(statusBytes) {
    if (!statusBytes || statusBytes.length === 0) {
        return 'No status data';
    }
    
    const interpretations = [];
    
    // Common Sony VTR status patterns
    if (statusBytes.length >= 3) {
        const [status1, status2, status3] = statusBytes;
        
        // Status byte 1 - often device state
        if (status1 === 0x00) interpretations.push('Device idle');
        else if (status1 === 0x01) interpretations.push('Device active');
        else if (status1 === 0x02) interpretations.push('Device busy');
        else if (status1 === 0xFF) interpretations.push('Device error');
        else interpretations.push(`Device state: 0x${status1.toString(16)}`);
        
        // Status byte 2 - often position/operation related
        if (status2 === 0x00) interpretations.push('Operation complete');
        else if (status2 === 0x01) interpretations.push('Operation in progress');
        else if (status2 === 0x80) interpretations.push('Position reached');
        else interpretations.push(`Operation: 0x${status2.toString(16)}`);
        
        // Status byte 3 - often flags/capabilities
        if (status3 & 0x01) interpretations.push('Ready flag set');
        if (status3 & 0x02) interpretations.push('Moving flag set');
        if (status3 & 0x04) interpretations.push('Home flag set');
        if (status3 & 0x08) interpretations.push('Error flag set');
        if (status3 & 0x10) interpretations.push('Cartridge present');
        
        if (interpretations.length === 1) {
            interpretations.push(`Flags: 0x${status3.toString(16)}`);
        }
    }
    
    return interpretations.join(', ') || 'Unknown status pattern';
}

/**
 * Enhanced Sony response analysis
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Analysis results
 */
function analyzeSonyResponse(response) {
    if (!response || response.length === 0) {
        return {
            type: 'EMPTY',
            valid: false,
            syncBytes: 0,
            dataBytes: 0,
            nonSyncBytes: [],
            syncPercentage: 0
        };
    }
    
    // Count sync bytes (0x55)
    const syncByteCount = response.filter(byte => byte === 0x55).length;
    const nonSyncBytes = response.filter(byte => byte !== 0x55);
    
    return {
        type: syncByteCount > 0 ? 'SONY_SYNC_RESPONSE' : 'SONY_DATA_RESPONSE',
        valid: true,
        totalBytes: response.length,
        syncBytes: syncByteCount,
        dataBytes: nonSyncBytes.length,
        nonSyncBytes: nonSyncBytes,
        syncPercentage: (syncByteCount / response.length * 100).toFixed(1),
        hex: response.toString('hex')
    };
}

module.exports = {
    getSonyDeviceInfo,
    testSonyMovementCommands,
    testSonyPositionMovement,
    createSonyPositionCommand,
    interpretSonyStatus,
    analyzeSonyResponse,
    SONY_COMMANDS
};