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

    return status;
}

/**
 * Parse Sony Flexicart status from sync-heavy response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed Sony status
 */
function parseSonyFlexicartStatus(response) {
    const status = {
        statusCode: 0x55, // Default to sync byte
        statusText: 'SONY_READY',
        ready: true,
        moving: false,
        errorCount: 0,
        deviceType: 'SONY_FLEXICART',
        communicating: true,
        raw: response ? response.toString('hex') : '',
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
    } else if (nonSyncBytes.length === 1) {
        const statusByte = nonSyncBytes[0];
        status.statusCode = statusByte;
        
        switch (statusByte) {
            case 0x57:
                status.statusText = 'SONY_ACTIVE';
                break;
            case 0x00:
                status.statusText = 'SONY_STANDBY';
                break;
            case 0xFF:
                status.statusText = 'SONY_ERROR';
                status.errorCount = 1;
                status.ready = false;
                break;
            default:
                status.statusText = `SONY_STATUS_${statusByte.toString(16).toUpperCase()}`;
        }
    } else {
        // Multiple non-sync bytes - could be data payload
        status.statusText = 'SONY_DATA_RESPONSE';
    }
    
    return status;
}

/**
 * Parse Flexicart position response (placeholder)
 */
function parseFlexicartPosition(response) {
    return {
        current: 0,
        target: 0,
        moving: false,
        raw: response ? response.toString('hex') : ''
    };
}

/**
 * Parse Flexicart inventory response (placeholder)
 */
function parseFlexicartInventory(response) {
    return {
        total: 0,
        occupied: [],
        empty: [],
        raw: response ? response.toString('hex') : ''
    };
}

/**
 * Parse Flexicart move response (placeholder)
 */
function parseFlexicartMoveResponse(response) {
    return {
        success: true,
        moving: false,
        position: 0,
        raw: response ? response.toString('hex') : ''
    };
}

/**
 * Parse Flexicart calibration response (placeholder)
 */
function parseFlexicartCalibrationResponse(response) {
    return {
        success: true,
        completed: false,
        progress: 0,
        raw: response ? response.toString('hex') : ''
    };
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

module.exports = {
    parseFlexicartStatus,
    parseSonyFlexicartStatus,
    parseFlexicartPosition,
    parseFlexicartInventory,
    parseFlexicartMoveResponse,
    parseFlexicartCalibrationResponse,
    FLEXICART_STATUS_CODES
};