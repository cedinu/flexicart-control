/**
 * Flexicart Transport/Movement Command Functions
 * Handles all movement and positioning operations for Flexicart devices
 */

// Import from the new serial utils module
const { sendCommand } = require('./flexicart_serial_utils');
const { parseFlexicartStatus, parseFlexicartPosition, parseFlexicartMoveResponse } = require('./flexicart_status_parser');

/**
 * Send generic Flexicart command
 * @param {string} path - Serial port path
 * @param {Buffer} command - Command buffer
 * @param {string} commandName - Human readable command name
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Command result
 */
async function sendFlexicartCommand(path, command, commandName, timeout = 3000, debug = false) {
    try {
        if (debug) console.log(`📤 Sending ${commandName} command to ${path}...`);
        
        const response = await sendCommand(path, command, timeout, debug);
        const status = parseFlexicartStatus(response);
        
        return {
            success: true,
            command: commandName,
            status: status,
            raw: response,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        if (debug) console.log(`❌ ${commandName} command failed: ${error.message}`);
        return {
            success: false,
            command: commandName,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Move Flexicart to home position
 * @param {string} path - Serial port path
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Move result
 */
async function moveFlexicartHome(path, timeout = 10000, debug = false) {
    try {
        if (debug) console.log(`🏠 Moving Flexicart to home position on ${path}...`);
        
        const response = await sendCommand(path, FLEXICART_MOVEMENT_COMMANDS.MOVE_HOME, timeout, debug);
        const moveResult = parseFlexicartMoveResponse(response);
        
        return {
            success: true,
            command: 'MOVE_HOME',
            moveResult: moveResult,
            raw: response,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        if (debug) console.log(`❌ Move home failed: ${error.message}`);
        return {
            success: false,
            command: 'MOVE_HOME',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Move Flexicart to specific position
 * @param {string} path - Serial port path
 * @param {number} position - Target position number
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Move result
 */
async function moveFlexicartToPosition(path, position, timeout = 10000, debug = false) {
    try {
        if (debug) console.log(`📍 Moving Flexicart to position ${position} on ${path}...`);
        
        // Create position command - this will depend on your specific protocol
        const positionCommand = createPositionCommand(position);
        const response = await sendCommand(path, positionCommand, timeout, debug);
        const moveResult = parseFlexicartMoveResponse(response);
        
        return {
            success: true,
            command: 'MOVE_TO_POSITION',
            targetPosition: position,
            moveResult: moveResult,
            raw: response,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        if (debug) console.log(`❌ Move to position ${position} failed: ${error.message}`);
        return {
            success: false,
            command: 'MOVE_TO_POSITION',
            targetPosition: position,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Emergency stop Flexicart movement
 * @param {string} path - Serial port path
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Stop result
 */
async function emergencyStopFlexicart(path, timeout = 3000, debug = false) {
    try {
        if (debug) console.log(`🛑 Emergency stop on ${path}...`);
        
        const response = await sendCommand(path, FLEXICART_MOVEMENT_COMMANDS.EMERGENCY_STOP, timeout, debug);
        const status = parseFlexicartStatus(response);
        
        return {
            success: true,
            command: 'EMERGENCY_STOP',
            status: status,
            raw: response,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        if (debug) console.log(`❌ Emergency stop failed: ${error.message}`);
        return {
            success: false,
            command: 'EMERGENCY_STOP',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Calibrate Flexicart positioning system
 * @param {string} path - Serial port path
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Calibration result
 */
async function calibrateFlexicart(path, timeout = 30000, debug = false) {
    try {
        if (debug) console.log(`⚙️ Calibrating Flexicart on ${path}...`);
        
        const response = await sendCommand(path, FLEXICART_MOVEMENT_COMMANDS.CALIBRATE, timeout, debug);
        const calibrationResult = parseFlexicartCalibrationResponse(response);
        
        return {
            success: true,
            command: 'CALIBRATE',
            calibrationResult: calibrationResult,
            raw: response,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        if (debug) console.log(`❌ Calibration failed: ${error.message}`);
        return {
            success: false,
            command: 'CALIBRATE',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Establish control connection with Flexicart
 * @param {string} path - Serial port path
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Control establishment result
 */
async function establishFlexicartControl(path, timeout = 5000, debug = false) {
    try {
        if (debug) console.log(`🤝 Establishing control with ${path}...`);
        
        // Send control establishment sequence
        const handshakeResponse = await sendCommand(path, FLEXICART_MOVEMENT_COMMANDS.ESTABLISH_CONTROL, timeout, debug);
        const status = parseFlexicartStatus(handshakeResponse);
        
        if (status.ready) {
            return {
                success: true,
                command: 'ESTABLISH_CONTROL',
                status: status,
                raw: handshakeResponse,
                timestamp: new Date().toISOString()
            };
        } else {
            throw new Error(`Flexicart not ready: ${status.statusText}`);
        }
    } catch (error) {
        if (debug) console.log(`❌ Control establishment failed: ${error.message}`);
        return {
            success: false,
            command: 'ESTABLISH_CONTROL',
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Test Flexicart movement capabilities
 * @param {string} path - Serial port path
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Movement test results
 */
async function testFlexicartMovement(path, debug = false) {
    const testResults = {
        homeTest: false,
        positionTest: false,
        stopTest: false,
        calibrationTest: false,
        errors: [],
        details: []
    };

    try {
        if (debug) console.log(`🧪 Testing Flexicart movement capabilities on ${path}...`);

        // Test 1: Emergency Stop (should always work)
        try {
            const stopResult = await emergencyStopFlexicart(path, 3000, debug);
            testResults.stopTest = stopResult.success;
            testResults.details.push({
                test: 'Emergency Stop',
                success: stopResult.success,
                error: stopResult.error || null
            });
        } catch (error) {
            testResults.errors.push(`Emergency Stop test failed: ${error.message}`);
        }

        // Test 2: Home Movement
        try {
            const homeResult = await moveFlexicartHome(path, 10000, debug);
            testResults.homeTest = homeResult.success;
            testResults.details.push({
                test: 'Move Home',
                success: homeResult.success,
                error: homeResult.error || null
            });
        } catch (error) {
            testResults.errors.push(`Home movement test failed: ${error.message}`);
        }

        // Test 3: Position Movement (to position 1)
        try {
            const positionResult = await moveFlexicartToPosition(path, 1, 10000, debug);
            testResults.positionTest = positionResult.success;
            testResults.details.push({
                test: 'Move to Position 1',
                success: positionResult.success,
                targetPosition: 1,
                error: positionResult.error || null
            });
        } catch (error) {
            testResults.errors.push(`Position movement test failed: ${error.message}`);
        }

        // Test 4: Calibration (optional, longer test)
        try {
            const calibrationResult = await calibrateFlexicart(path, 30000, debug);
            testResults.calibrationTest = calibrationResult.success;
            testResults.details.push({
                test: 'Calibration',
                success: calibrationResult.success,
                error: calibrationResult.error || null
            });
        } catch (error) {
            testResults.errors.push(`Calibration test failed: ${error.message}`);
        }

        const successCount = testResults.details.filter(d => d.success).length;
        const totalTests = testResults.details.length;

        if (debug) {
            console.log(`🧪 Movement tests completed: ${successCount}/${totalTests} successful`);
        }

        return {
            success: successCount > 0,
            testResults: testResults,
            timestamp: new Date().toISOString()
        };

    } catch (error) {
        testResults.errors.push(`Movement test suite failed: ${error.message}`);
        return {
            success: false,
            testResults: testResults,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Create position command for specific target
 * @param {number} position - Target position number
 * @returns {Buffer} Position command buffer
 */
function createPositionCommand(position) {
    // This will depend on your specific Flexicart protocol
    // Example implementation for a hypothetical protocol:
    const positionBytes = [
        0x02,                           // STX
        0x4D,                           // 'M' for Move
        (position >> 8) & 0xFF,         // Position high byte
        position & 0xFF,                // Position low byte
        0x03                            // ETX
    ];
    
    return Buffer.from(positionBytes);
}

// Flexicart movement command constants
const FLEXICART_MOVEMENT_COMMANDS = {
    MOVE_HOME: Buffer.from([0x02, 0x48, 0x03]),                    // STX H ETX
    EMERGENCY_STOP: Buffer.from([0x02, 0x21, 0x03]),               // STX ! ETX
    CALIBRATE: Buffer.from([0x02, 0x43, 0x41, 0x4C, 0x03]),        // STX CAL ETX
    ESTABLISH_CONTROL: Buffer.from([0x02, 0x43, 0x54, 0x52, 0x4C, 0x03]),  // STX CTRL ETX
    
    // Sony-specific movement commands
    SONY_STOP: Buffer.from([0x90, 0x20, 0x00, 0x00]),
    SONY_EJECT: Buffer.from([0x90, 0x2A, 0x00, 0x00]),
    SONY_LOAD: Buffer.from([0x90, 0x2B, 0x00, 0x00]),
    SONY_GOTO_POS: Buffer.from([0x90, 0x24, 0x00, 0x00])          // Position will be set in last byte
};

module.exports = {
    sendFlexicartCommand,
    moveFlexicartHome,
    moveFlexicartToPosition,
    emergencyStopFlexicart,
    calibrateFlexicart,
    establishFlexicartControl,
    testFlexicartMovement,
    createPositionCommand,
    FLEXICART_MOVEMENT_COMMANDS
};