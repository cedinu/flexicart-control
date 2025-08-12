/**
 * Flexicart Status Parsing Functions
 * Handles parsing and interpretation of Flexicart device responses
 */

/**
 * Parse Flexicart status response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed status information
 */
function parseFlexicartStatus(response) {
    // Default status structure
    const status = {
        statusCode: 0xFF,
        statusText: 'UNKNOWN',
        ready: false,
        moving: false,
        errorCount: 0,
        deviceType: 'FLEXICART',
        communicating: false,
        raw: response ? response.toString('hex') : '',
        timestamp: new Date().toISOString()
    };

    if (!response || response.length === 0) {
        status.statusText = 'NO_RESPONSE';
        return status;
    }

    status.communicating = true;

    // Check if this looks like a Sony sync response
    if (response && response.length >= 32) {
        const syncByteCount = response.filter(byte => byte === 0x55).length;
        if (syncByteCount > response.length * 0.8) {
            // This is likely a Sony sync response
            return parseSonyFlexicartStatus(response);
        }
    }

    // Standard Flexicart status parsing
    if (response.length >= 1) {
        status.statusCode = response[0];
        status.statusText = FLEXICART_STATUS_CODES[response[0]] || `STATUS_${response[0].toString(16).toUpperCase()}`;
        
        // Map common status codes
        switch (response[0]) {
            case 0x00:
                status.statusText = 'IDLE';
                status.ready = true;
                break;
            case 0x01:
                status.statusText = 'MOVING';
                status.moving = true;
                break;
            case 0x02:
                status.statusText = 'BUSY';
                status.moving = true;
                break;
            case 0x04:
                status.statusText = 'READY';
                status.ready = true;
                break;
            case 0x06:
                status.statusText = 'ACK';
                status.ready = true;
                break;
            case 0x15:
                status.statusText = 'NAK';
                status.errorCount = 1;
                break;
            case 0x03:
            case 0xFF:
                status.statusText = 'ERROR';
                status.errorCount = 1;
                break;
        }
    }

    // Parse extended status information if available
    if (response.length >= 4) {
        const extendedStatus = parseExtendedStatus(response);
        Object.assign(status, extendedStatus);
    }

    return status;
}

/**
 * Parse Sony Flexicart status from sync-heavy response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed Sony status
 */
function parseSonyFlexicartStatus(response) {
    const analysis = analyzeSonyResponse(response);
    
    const status = {
        statusCode: 0x55, // Default to sync byte
        statusText: 'SONY_READY',
        ready: true,
        moving: false,
        errorCount: 0,
        deviceType: 'SONY_FLEXICART',
        communicating: true,
        raw: response ? response.toString('hex') : '',
        analysis: analysis,
        timestamp: new Date().toISOString()
    };
    
    if (!response || response.length === 0) {
        status.statusText = 'NO_RESPONSE';
        status.ready = false;
        status.communicating = false;
        return status;
    }
    
    // Analyze non-sync bytes for status information
    const nonSyncBytes = response.filter(byte => byte !== 0x55);
    
    if (nonSyncBytes.length === 0) {
        // Pure sync response
        status.statusText = 'SONY_IDLE';
        status.interpretation = 'Device is idle and ready for commands';
    } else if (nonSyncBytes.length === 1) {
        const statusByte = nonSyncBytes[0];
        status.statusCode = statusByte;
        
        switch (statusByte) {
            case 0x57:
                status.statusText = 'SONY_ACTIVE';
                status.interpretation = 'Device is active and responding';
                break;
            case 0x00:
                status.statusText = 'SONY_STANDBY';
                status.interpretation = 'Device in standby mode';
                break;
            case 0xFF:
                status.statusText = 'SONY_ERROR';
                status.errorCount = 1;
                status.ready = false;
                break;
            default:
                status.statusText = `SONY_STATUS_${statusByte.toString(16).toUpperCase()}`;
                status.interpretation = `Unknown status byte: 0x${statusByte.toString(16)}`;
        }
    } else {
        // Multiple non-sync bytes - could be data payload
        status.statusText = 'SONY_DATA_RESPONSE';
        status.interpretation = `Response contains ${nonSyncBytes.length} data bytes`;
        status.dataBytes = nonSyncBytes;
    }
    
    return status;
}

/**
 * Parse Flexicart position response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed position information
 */
function parseFlexicartPosition(response) {
    const position = {
        current: 0,
        target: 0,
        total: 0,
        moving: false,
        homed: false,
        calibrated: false,
        raw: response ? response.toString('hex') : '',
        timestamp: new Date().toISOString()
    };

    if (!response || response.length === 0) {
        return position;
    }

    // Parse position data based on response format
    if (response.length >= 6) {
        // Example format: [STATUS, CURRENT_HIGH, CURRENT_LOW, TARGET_HIGH, TARGET_LOW, FLAGS]
        position.current = (response[1] << 8) | response[2];
        position.target = (response[3] << 8) | response[4];
        
        const flags = response[5];
        position.moving = !!(flags & 0x01);
        position.homed = !!(flags & 0x02);
        position.calibrated = !!(flags & 0x04);
    } else if (response.length >= 3) {
        // Simplified format: [STATUS, CURRENT_HIGH, CURRENT_LOW]
        position.current = (response[1] << 8) | response[2];
    }

    return position;
}

/**
 * Parse Flexicart inventory response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed inventory information
 */
function parseFlexicartInventory(response) {
    const inventory = {
        total: 0,
        occupied: [],
        empty: [],
        cartridges: [],
        raw: response ? response.toString('hex') : '',
        timestamp: new Date().toISOString()
    };

    if (!response || response.length === 0) {
        return inventory;
    }

    // Parse inventory data
    if (response.length >= 2) {
        inventory.total = response[1];
        
        // Parse slot status (each bit represents a slot)
        const statusBytes = response.slice(2);
        for (let byteIndex = 0; byteIndex < statusBytes.length; byteIndex++) {
            const statusByte = statusBytes[byteIndex];
            
            for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
                const slotNumber = (byteIndex * 8) + bitIndex + 1;
                
                if (slotNumber > inventory.total) break;
                
                if (statusByte & (1 << bitIndex)) {
                    inventory.occupied.push(slotNumber);
                    inventory.cartridges.push({
                        slot: slotNumber,
                        present: true,
                        type: 'UNKNOWN'
                    });
                } else {
                    inventory.empty.push(slotNumber);
                    inventory.cartridges.push({
                        slot: slotNumber,
                        present: false,
                        type: null
                    });
                }
            }
        }
    }

    return inventory;
}

/**
 * Parse Flexicart error response
 * @param {Buffer} response - Raw response buffer
 * @returns {Array} Array of error objects
 */
function parseFlexicartErrors(response) {
    const errors = [];

    if (!response || response.length === 0) {
        return errors;
    }

    // Parse error data
    if (response.length >= 2) {
        const errorCount = response[1];
        
        for (let i = 0; i < errorCount && i < (response.length - 2); i++) {
            const errorCode = response[2 + i];
            const error = {
                code: errorCode,
                description: FLEXICART_ERROR_CODES[errorCode] || `Unknown error: 0x${errorCode.toString(16)}`,
                timestamp: new Date().toISOString()
            };
            errors.push(error);
        }
    }

    return errors;
}

/**
 * Parse Flexicart movement response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed movement result
 */
function parseFlexicartMoveResponse(response) {
    const moveResult = {
        success: false,
        targetReached: false,
        moving: false,
        position: 0,
        error: null,
        raw: response ? response.toString('hex') : '',
        timestamp: new Date().toISOString()
    };

    if (!response || response.length === 0) {
        moveResult.error = 'No response received';
        return moveResult;
    }

    // Parse movement response
    if (response.length >= 1) {
        const statusByte = response[0];
        
        switch (statusByte) {
            case 0x06: // ACK
                moveResult.success = true;
                moveResult.moving = true;
                break;
            case 0x00: // Movement complete
                moveResult.success = true;
                moveResult.targetReached = true;
                break;
            case 0x15: // NAK
                moveResult.error = 'Movement command rejected';
                break;
            case 0xFF: // Error
                moveResult.error = 'Movement error';
                break;
            default:
                moveResult.error = `Unknown movement status: 0x${statusByte.toString(16)}`;
        }
        
        // Parse position if available
        if (response.length >= 3) {
            moveResult.position = (response[1] << 8) | response[2];
        }
    }

    return moveResult;
}

/**
 * Parse Flexicart calibration response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed calibration result
 */
function parseFlexicartCalibrationResponse(response) {
    const calibrationResult = {
        success: false,
        completed: false,
        progress: 0,
        totalPositions: 0,
        error: null,
        raw: response ? response.toString('hex') : '',
        timestamp: new Date().toISOString()
    };

    if (!response || response.length === 0) {
        calibrationResult.error = 'No response received';
        return calibrationResult;
    }

    // Parse calibration response
    if (response.length >= 1) {
        const statusByte = response[0];
        
        switch (statusByte) {
            case 0x06: // ACK - calibration started
                calibrationResult.success = true;
                break;
            case 0x00: // Calibration complete
                calibrationResult.success = true;
                calibrationResult.completed = true;
                calibrationResult.progress = 100;
                break;
            case 0x01: // Calibration in progress
                calibrationResult.success = true;
                if (response.length >= 3) {
                    calibrationResult.progress = response[1];
                    calibrationResult.totalPositions = response[2];
                }
                break;
            case 0x15: // NAK
                calibrationResult.error = 'Calibration command rejected';
                break;
            case 0xFF: // Error
                calibrationResult.error = 'Calibration error';
                break;
        }
    }

    return calibrationResult;
}

/**
 * Parse extended status information
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Extended status data
 */
function parseExtendedStatus(response) {
    const extended = {};

    if (response.length >= 4) {
        // Example extended status format
        const flags = response[3];
        extended.doorOpen = !!(flags & 0x01);
        extended.motorEnabled = !!(flags & 0x02);
        extended.powerOk = !!(flags & 0x04);
        extended.emergencyStop = !!(flags & 0x08);
    }

    return extended;
}

/**
 * Analyze Sony response patterns
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
            nonSyncBytes: []
        };
    }
    
    // Count sync bytes (0x55)
    const syncByteCount = response.filter(byte => byte === 0x55).length;
    const nonSyncBytes = response.filter(byte => byte !== 0x55);
    
    const analysis = {
        type: 'SONY_SYNC_RESPONSE',
        valid: true,
        totalBytes: response.length,
        syncBytes: syncByteCount,
        dataBytes: response.length - syncByteCount,
        syncPercentage: (syncByteCount / response.length * 100).toFixed(1),
        nonSyncBytes: nonSyncBytes,
        patterns: []
    };
    
    if (nonSyncBytes.includes(0x57)) {
        analysis.patterns.push('CONTAINS_0x57');
    }
    if (nonSyncBytes.includes(0x00)) {
        analysis.patterns.push('CONTAINS_NULL');
    }
    
    return analysis;
}

// Status code mappings
const FLEXICART_STATUS_CODES = {
    0x00: 'IDLE',
    0x01: 'MOVING',
    0x02: 'BUSY', 
    0x03: 'ERROR',
    0x04: 'READY',
    0x05: 'CALIBRATING',
    0x06: 'ACK',
    0x15: 'NAK',
    0xFF: 'UNKNOWN'
};

// Error code mappings
const FLEXICART_ERROR_CODES = {
    0x01: 'Communication timeout',
    0x02: 'Invalid position',
    0x03: 'Motor error',
    0x04: 'Door open',
    0x05: 'Emergency stop activated',
    0x06: 'Calibration required',
    0x07: 'Power supply error',
    0x08: 'Sensor malfunction',
    0x09: 'Mechanical jam',
    0x0A: 'Invalid command',
    0xFF: 'Unknown error'
};

module.exports = {
    parseFlexicartStatus,
    parseSonyFlexicartStatus,
    parseFlexicartPosition,
    parseFlexicartInventory,
    parseFlexicartErrors,
    parseFlexicartMoveResponse,
    parseFlexicartCalibrationResponse,
    parseExtendedStatus,
    analyzeSonyResponse,
    FLEXICART_STATUS_CODES,
    FLEXICART_ERROR_CODES
};