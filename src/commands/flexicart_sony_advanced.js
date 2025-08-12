/**
 * Advanced Sony Flexicart Control System
 * Based on successful communication analysis
 */

const { sendCommand } = require('./flexicart_serial_utils');

/**
 * Enhanced Sony Command Set
 */
const SONY_COMMANDS = {
    // Status Commands (CONFIRMED WORKING)
    DEVICE_TYPE: Buffer.from([0x90, 0x11, 0x00, 0x00]),
    ID_REQUEST: Buffer.from([0x88, 0x01]),
    STATUS_QUERY: Buffer.from([0x53, 0x3F, 0x0D]), // "S?" + CR
    
    // Position Commands (TO TEST)
    POSITION_QUERY: Buffer.from([0x90, 0x10, 0x00, 0x00]),
    HOME_COMMAND: Buffer.from([0x48, 0x4F, 0x4D, 0x45, 0x0D]), // "HOME" + CR
    
    // Movement Commands (TO TEST)
    MOVE_TO_SLOT_1: Buffer.from([0x90, 0x24, 0x00, 0x01]),
    MOVE_TO_SLOT_2: Buffer.from([0x90, 0x24, 0x00, 0x02]),
    MOVE_TO_SLOT_3: Buffer.from([0x90, 0x24, 0x00, 0x03]),
    MOVE_TO_SLOT_5: Buffer.from([0x90, 0x24, 0x00, 0x05]),
    MOVE_TO_SLOT_10: Buffer.from([0x90, 0x24, 0x00, 0x0A]),
    
    // Control Commands (TO TEST)
    STOP_COMMAND: Buffer.from([0x53, 0x54, 0x4F, 0x50, 0x0D]), // "STOP" + CR
    EJECT_COMMAND: Buffer.from([0x90, 0x2A, 0x00, 0x00]),
    LOAD_COMMAND: Buffer.from([0x90, 0x2B, 0x00, 0x00]),
    
    // Advanced Queries
    INVENTORY_QUERY: Buffer.from([0x49, 0x4E, 0x56, 0x3F, 0x0D]), // "INV?" + CR
    ERROR_QUERY: Buffer.from([0x45, 0x52, 0x52, 0x3F, 0x0D]),     // "ERR?" + CR
};

/**
 * Get comprehensive device status
 */
async function getComprehensiveStatus(path, debug = false) {
    if (debug) console.log(`🔍 Getting comprehensive Sony Flexicart status...`);
    
    const status = {
        timestamp: new Date().toISOString(),
        device: null,
        position: null,
        operational: null,
        capabilities: [],
        errors: []
    };
    
    try {
        // 1. Device Information
        if (debug) console.log(`   📋 Querying device info...`);
        const deviceResponse = await sendCommand(path, SONY_COMMANDS.DEVICE_TYPE, 3000, debug);
        const deviceData = extractDataBytes(deviceResponse);
        
        if (deviceData.length >= 3) {
            status.device = {
                manufacturer: deviceData[0],
                model: deviceData[1],
                version: deviceData[2],
                identification: `${deviceData[0]}-${deviceData[1]}-${deviceData[2]}`,
                type: interpretDeviceType(deviceData)
            };
        }
        
        // 2. Position Information
        if (debug) console.log(`   📍 Querying position...`);
        const posResponse = await sendCommand(path, SONY_COMMANDS.POSITION_QUERY, 3000, debug);
        const posData = extractDataBytes(posResponse);
        
        if (posData.length >= 2) {
            const currentPos = (posData[0] << 8) | posData[1];
            status.position = {
                raw: posData,
                current: currentPos,
                isHome: currentPos === 0xFFFF || currentPos === 0,
                isValid: currentPos !== 0xFFFF,
                interpretation: interpretPosition(currentPos)
            };
        }
        
        // 3. Operational Status
        if (debug) console.log(`   📊 Querying operational status...`);
        const statusResponse = await sendCommand(path, SONY_COMMANDS.STATUS_QUERY, 3000, debug);
        const statusData = extractDataBytes(statusResponse);
        
        if (statusData.length >= 3) {
            status.operational = {
                raw: statusData,
                ready: !!(statusData[2] & 0x01),
                moving: !!(statusData[2] & 0x02),
                home: !!(statusData[2] & 0x04),
                error: !!(statusData[2] & 0x08),
                cartridgePresent: !!(statusData[2] & 0x10),
                interpretation: interpretSonyStatus(statusData)
            };
        }
        
        // Determine capabilities
        status.capabilities = [
            'SONY_VTR_PROTOCOL',
            'DEVICE_IDENTIFICATION',
            'POSITION_REPORTING',
            'STATUS_MONITORING'
        ];
        
        if (status.device) status.capabilities.push('DEVICE_TYPE_DETECTION');
        if (status.position && status.position.isValid) status.capabilities.push('POSITION_TRACKING');
        if (status.operational && status.operational.ready) status.capabilities.push('READY_STATE');
        if (status.operational && status.operational.cartridgePresent) status.capabilities.push('MEDIA_DETECTION');
        
        return { success: true, status };
        
    } catch (error) {
        status.errors.push(`Status query failed: ${error.message}`);
        return { success: false, status, error: error.message };
    }
}

/**
 * Test movement capabilities
 */
async function testMovementCapabilities(path, debug = false) {
    if (debug) console.log(`🏃 Testing Sony Flexicart movement capabilities...`);
    
    const results = {
        timestamp: new Date().toISOString(),
        movements: [],
        successful: 0,
        failed: 0,
        positionChanges: 0
    };
    
    const movements = [
        { name: 'HOME', command: SONY_COMMANDS.HOME_COMMAND, description: 'Return to home position' },
        { name: 'SLOT_1', command: SONY_COMMANDS.MOVE_TO_SLOT_1, description: 'Move to slot 1' },
        { name: 'SLOT_2', command: SONY_COMMANDS.MOVE_TO_SLOT_2, description: 'Move to slot 2' },
        { name: 'SLOT_3', command: SONY_COMMANDS.MOVE_TO_SLOT_3, description: 'Move to slot 3' },
        { name: 'STOP', command: SONY_COMMANDS.STOP_COMMAND, description: 'Stop movement' }
    ];
    
    for (const movement of movements) {
        if (debug) console.log(`\n   🧪 Testing: ${movement.name} - ${movement.description}`);
        
        try {
            // Get position before
            const posBefore = await getPosition(path, false);
            
            // Send movement command
            const moveResponse = await sendCommand(path, movement.command, 5000, debug);
            const moveData = extractDataBytes(moveResponse);
            
            // Wait for movement to complete
            if (debug) console.log(`   ⏳ Waiting for movement...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Get position after
            const posAfter = await getPosition(path, false);
            
            const result = {
                command: movement.name,
                description: movement.description,
                success: true,
                positionBefore: posBefore,
                positionAfter: posAfter,
                positionChanged: JSON.stringify(posBefore) !== JSON.stringify(posAfter),
                responseData: moveData,
                timestamp: new Date().toISOString()
            };
            
            results.movements.push(result);
            results.successful++;
            
            if (result.positionChanged) {
                results.positionChanges++;
                if (debug) console.log(`   ✅ SUCCESS: Position changed!`);
            } else {
                if (debug) console.log(`   ⚠️  Command sent, but no position change detected`);
            }
            
        } catch (error) {
            const result = {
                command: movement.name,
                description: movement.description,
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
            
            results.movements.push(result);
            results.failed++;
            
            if (debug) console.log(`   ❌ FAILED: ${error.message}`);
        }
        
        // Delay between movements
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
}

/**
 * Move to specific slot
 */
async function moveToSlot(path, slotNumber, debug = false) {
    if (debug) console.log(`📍 Moving to slot ${slotNumber}...`);
    
    // Create position command
    const command = Buffer.from([0x90, 0x24, 0x00, slotNumber & 0xFF]);
    
    try {
        // Get current position
        const currentPos = await getPosition(path, debug);
        
        // Send move command
        const response = await sendCommand(path, command, 8000, debug);
        const responseData = extractDataBytes(response);
        
        // Wait for movement
        if (debug) console.log(`   ⏳ Waiting for movement to complete...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Verify final position
        const finalPos = await getPosition(path, debug);
        
        const success = finalPos && finalPos.current !== undefined && 
                        (finalPos.current === slotNumber || Math.abs(finalPos.current - slotNumber) <= 1);
        
        return {
            success: success,
            targetSlot: slotNumber,
            currentPosition: currentPos,
            finalPosition: finalPos,
            moved: JSON.stringify(currentPos) !== JSON.stringify(finalPos),
            responseData: responseData,
            command: command.toString('hex')
        };
        
    } catch (error) {
        return {
            success: false,
            error: error.message,
            targetSlot: slotNumber
        };
    }
}

/**
 * Get current position
 */
async function getPosition(path, debug = false) {
    try {
        const response = await sendCommand(path, SONY_COMMANDS.POSITION_QUERY, 3000, debug);
        const data = extractDataBytes(response);
        
        if (data.length >= 2) {
            const position = (data[0] << 8) | data[1];
            return {
                raw: data,
                current: position,
                isHome: position === 0xFFFF || position === 0,
                isValid: position !== 0xFFFF
            };
        }
        
        return null;
    } catch (error) {
        if (debug) console.log(`Position query failed: ${error.message}`);
        return null;
    }
}

/**
 * Extract meaningful data bytes from response
 */
function extractDataBytes(response) {
    if (!response || response.length === 0) return [];
    
    // Filter out sync bytes (0x55) and common padding
    return response.filter(byte => 
        byte !== 0x55 && // Sony sync byte
        byte !== 0x00 && // Null padding
        !(byte >= 0xF0 && byte <= 0xFF) // High-value noise
    ).slice(0, 10); // Take first 10 meaningful bytes
}

/**
 * Interpret device type
 */
function interpretDeviceType(deviceData) {
    if (!deviceData || deviceData.length < 3) return 'Unknown';
    
    const [mfg, model, version] = deviceData;
    
    if (mfg === 0xFF || mfg === 0x5D) {
        return 'Sony/Compatible Flexicart';
    }
    
    return `Device Type: Mfg=${mfg}, Model=${model}, Ver=${version}`;
}

/**
 * Interpret position value
 */
function interpretPosition(position) {
    if (position === 0xFFFF) return 'Home/Unknown';
    if (position === 0) return 'Home';
    if (position >= 1 && position <= 100) return `Slot ${position}`;
    return `Position ${position}`;
}

/**
 * Interpret Sony status (enhanced)
 */
function interpretSonyStatus(statusBytes) {
    if (!statusBytes || statusBytes.length === 0) return 'No status data';
    
    const flags = [];
    
    if (statusBytes.length >= 3) {
        const statusByte = statusBytes[2];
        
        if (statusByte & 0x01) flags.push('READY');
        if (statusByte & 0x02) flags.push('MOVING');
        if (statusByte & 0x04) flags.push('HOME');
        if (statusByte & 0x08) flags.push('ERROR');
        if (statusByte & 0x10) flags.push('CARTRIDGE_PRESENT');
        if (statusByte & 0x20) flags.push('INITIALIZED');
        if (statusByte & 0x40) flags.push('CALIBRATED');
        if (statusByte & 0x80) flags.push('BUSY');
    }
    
    return flags.length > 0 ? flags.join(', ') : 'Unknown status';
}

module.exports = {
    getComprehensiveStatus,
    testMovementCapabilities,
    moveToSlot,
    getPosition,
    extractDataBytes,
    SONY_COMMANDS
};