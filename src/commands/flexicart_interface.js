const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

/**
 * Flexicart Interface Module
 * Handles communication and control of Sony Flexicart tape handling systems
 */

// Flexicart command constants
const FLEXICART_COMMANDS = {
    STATUS: Buffer.from([0x02, 0x53, 0x03]), // STX S ETX
    POSITION: Buffer.from([0x02, 0x50, 0x03]), // STX P ETX
    INVENTORY: Buffer.from([0x02, 0x49, 0x03]), // STX I ETX
    MOVE_HOME: Buffer.from([0x02, 0x48, 0x03]), // STX H ETX
    STOP: Buffer.from([0x02, 0x53, 0x54, 0x03]), // STX ST ETX
    ERROR_STATUS: Buffer.from([0x02, 0x45, 0x03]), // STX E ETX
    CALIBRATE: Buffer.from([0x02, 0x43, 0x03]), // STX C ETX
    RESET: Buffer.from([0x02, 0x52, 0x03]), // STX R ETX
    GET_VERSION: Buffer.from([0x02, 0x56, 0x03]), // STX V ETX
    CLEAR_ERRORS: Buffer.from([0x02, 0x43, 0x45, 0x03]) // STX CE ETX
};

// Status codes and their meanings
const FLEXICART_STATUS_CODES = {
    0x00: 'IDLE',
    0x01: 'MOVING',
    0x02: 'CALIBRATING',
    0x03: 'ERROR',
    0x04: 'READY',
    0x05: 'HOMING',
    0x06: 'LOADING',
    0x07: 'UNLOADING',
    0x08: 'MAINTENANCE',
    0xFF: 'UNKNOWN'
};

// Error codes
const FLEXICART_ERROR_CODES = {
    0x01: 'MECHANICAL_JAM',
    0x02: 'POSITION_ERROR',
    0x03: 'TIMEOUT',
    0x04: 'COMMUNICATION_ERROR',
    0x05: 'CALIBRATION_FAILED',
    0x06: 'SAFETY_INTERLOCK',
    0x07: 'POWER_FAULT',
    0x08: 'SENSOR_ERROR'
};

class FlexicartError extends Error {
    constructor(message, code, path) {
        super(message);
        this.name = 'FlexicartError';
        this.code = code;
        this.path = path;
    }
}

/**
 * Send command to Flexicart with timeout and error handling
 * @param {string} path - Serial port path
 * @param {Buffer} command - Command buffer to send
 * @param {number} timeout - Response timeout in milliseconds
 * @returns {Promise<Buffer>} Response buffer
 */
async function sendCommand(path, command, timeout = 3000) {
    return new Promise((resolve, reject) => {
        let port;
        let timeoutId;
        let responseBuffer = Buffer.alloc(0);

        try {
            port = new SerialPort({
                path: path,
                baudRate: 9600,
                dataBits: 8,
                parity: 'none',
                stopBits: 1,
                autoOpen: false
            });

            const openTimeout = setTimeout(() => {
                port.close();
                reject(new FlexicartError(`Port open timeout: ${path}`, 'OPEN_TIMEOUT', path));
            }, 5000);

            port.open((err) => {
                clearTimeout(openTimeout);
                
                if (err) {
                    reject(new FlexicartError(`Failed to open port: ${err.message}`, 'OPEN_FAILED', path));
                    return;
                }

                // Set up data handler
                port.on('data', (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);
                    
                    // Check for complete response (ends with ETX 0x03)
                    if (data.includes(0x03)) {
                        clearTimeout(timeoutId);
                        port.close(() => {
                            resolve(responseBuffer);
                        });
                    }
                });

                // Set response timeout
                timeoutId = setTimeout(() => {
                    port.close(() => {
                        if (responseBuffer.length > 0) {
                            resolve(responseBuffer);
                        } else {
                            reject(new FlexicartError(`Response timeout: ${timeout}ms`, 'RESPONSE_TIMEOUT', path));
                        }
                    });
                }, timeout);

                // Send command
                port.write(command, (err) => {
                    if (err) {
                        clearTimeout(timeoutId);
                        port.close();
                        reject(new FlexicartError(`Write failed: ${err.message}`, 'WRITE_FAILED', path));
                    }
                });
            });

            port.on('error', (err) => {
                clearTimeout(timeoutId);
                reject(new FlexicartError(`Port error: ${err.message}`, 'PORT_ERROR', path));
            });

        } catch (error) {
            if (timeoutId) clearTimeout(timeoutId);
            if (port && port.isOpen) port.close();
            reject(new FlexicartError(`Send command failed: ${error.message}`, 'SEND_FAILED', path));
        }
    });
}

/**
 * Auto-scan for Flexicart devices on available ports
 * @param {Array} portPaths - Array of port paths to scan
 * @returns {Promise<Array>} Array of found Flexicart devices
 */
async function autoScanFlexicarts(portPaths = []) {
    console.log('🔍 Auto-scanning for Flexicart devices...');
    
    const defaultPorts = Array.from({ length: 8 }, (_, i) => `/dev/ttyRP${i + 16}`);
    const portsToScan = portPaths.length > 0 ? portPaths : defaultPorts;
    
    const foundDevices = [];
    
    for (const port of portsToScan) {
        try {
            console.log(`📡 Scanning ${port}...`);
            const response = await sendCommand(port, FLEXICART_COMMANDS.STATUS, 2000);
            
            if (response && response.length > 0) {
                const status = parseFlexicartStatus(response);
                foundDevices.push({
                    port,
                    status,
                    timestamp: new Date().toISOString()
                });
                console.log(`✅ Flexicart found at ${port}`);
            }
        } catch (error) {
            // No device or error - continue scanning
            console.log(`⚠️  No Flexicart at ${port}`);
        }
    }
    
    console.log(`📊 Scan complete: ${foundDevices.length} Flexicart(s) found`);
    return foundDevices;
}

/**
 * Get comprehensive status from Flexicart
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Status information
 */
async function getFlexicartStatus(path) {
    console.log(`📊 Getting Flexicart status from ${path}...`);
    
    try {
        const response = await sendCommand(path, FLEXICART_COMMANDS.STATUS, 3000);
        const status = parseFlexicartStatus(response);
        
        console.log(`✅ Status retrieved: ${status.statusText}`);
        return {
            success: true,
            status,
            rawResponse: response.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ Failed to get status: ${error.message}`);
        throw error;
    }
}

/**
 * Send generic command to Flexicart
 * @param {string} path - Flexicart port path
 * @param {Buffer} command - Command buffer
 * @param {string} commandName - Command name for logging
 * @param {number} timeout - Response timeout
 * @returns {Promise<Object>} Command result
 */
async function sendFlexicartCommand(path, command, commandName = 'UNKNOWN', timeout = 3000) {
    console.log(`📤 Sending ${commandName} to Flexicart at ${path}...`);
    
    try {
        const response = await sendCommand(path, command, timeout);
        
        console.log(`✅ ${commandName} successful`);
        console.log(`📥 Response: ${response.toString('hex')} (${response.length} bytes)`);
        
        return {
            success: true,
            command: commandName,
            response,
            responseHex: response.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ ${commandName} failed: ${error.message}`);
        return {
            success: false,
            command: commandName,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Establish control connection with Flexicart
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Control session info
 */
async function establishFlexicartControl(path) {
    console.log(`🔌 Establishing control with Flexicart at ${path}...`);
    
    try {
        // Test basic communication
        const statusResult = await getFlexicartStatus(path);
        
        if (!statusResult.success) {
            throw new FlexicartError('Failed to establish communication', 'COMM_FAILED', path);
        }
        
        // Get version information
        const versionResult = await sendFlexicartCommand(path, FLEXICART_COMMANDS.GET_VERSION, 'GET_VERSION');
        
        console.log(`✅ Control established with Flexicart at ${path}`);
        
        return {
            success: true,
            path,
            status: statusResult.status,
            version: versionResult.success ? parseFlexicartVersion(versionResult.response) : null,
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ Failed to establish control: ${error.message}`);
        throw error;
    }
}

/**
 * Test communication with Flexicart
 * @param {string} path - Flexicart port path
 * @returns {Promise<boolean>} Communication test result
 */
async function testFlexicartCommunication(path) {
    console.log(`🔧 Testing communication with Flexicart at ${path}...`);
    
    try {
        const response = await sendCommand(path, FLEXICART_COMMANDS.STATUS, 2000);
        
        if (response && response.length > 0) {
            console.log(`✅ Communication test passed`);
            return true;
        } else {
            console.log(`❌ Communication test failed - no response`);
            return false;
        }
        
    } catch (error) {
        console.log(`❌ Communication test failed: ${error.message}`);
        return false;
    }
}

/**
 * Get current position of Flexicart
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Position information
 */
async function getFlexicartPosition(path) {
    console.log(`📍 Getting Flexicart position from ${path}...`);
    
    try {
        const response = await sendCommand(path, FLEXICART_COMMANDS.POSITION, 3000);
        const position = parseFlexicartPosition(response);
        
        console.log(`✅ Position: ${position.current}/${position.total}`);
        return {
            success: true,
            position,
            rawResponse: response.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ Failed to get position: ${error.message}`);
        throw error;
    }
}

/**
 * Move Flexicart to specific position
 * @param {string} path - Flexicart port path
 * @param {number} position - Target position (1-based)
 * @returns {Promise<Object>} Move result
 */
async function moveFlexicartToPosition(path, position) {
    console.log(`🏃 Moving Flexicart at ${path} to position ${position}...`);
    
    try {
        // Validate position
        if (position < 1 || position > 999) {
            throw new FlexicartError(`Invalid position: ${position} (must be 1-999)`, 'INVALID_POSITION', path);
        }
        
        // Create move command: STX M <high_byte> <low_byte> ETX
        const highByte = Math.floor(position / 256);
        const lowByte = position % 256;
        const moveCommand = Buffer.from([0x02, 0x4D, highByte, lowByte, 0x03]);
        
        const response = await sendCommand(path, moveCommand, 5000);
        const result = parseFlexicartMoveResponse(response);
        
        if (result.success) {
            console.log(`✅ Move command accepted, moving to position ${position}`);
        } else {
            console.log(`❌ Move command rejected: ${result.error}`);
        }
        
        return {
            success: result.success,
            targetPosition: position,
            response: result,
            rawResponse: response.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ Move failed: ${error.message}`);
        throw error;
    }
}

/**
 * Get Flexicart inventory (cartridge status)
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Inventory information
 */
async function getFlexicartInventory(path) {
    console.log(`📦 Getting Flexicart inventory from ${path}...`);
    
    try {
        const response = await sendCommand(path, FLEXICART_COMMANDS.INVENTORY, 3000);
        const inventory = parseFlexicartInventory(response);
        
        console.log(`✅ Inventory: ${inventory.occupied.length}/${inventory.total} slots occupied`);
        return {
            success: true,
            inventory,
            rawResponse: response.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ Failed to get inventory: ${error.message}`);
        throw error;
    }
}

/**
 * Test Flexicart movement capabilities
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Movement test results
 */
async function testFlexicartMovement(path) {
    console.log(`🏃 Testing Flexicart movement capabilities at ${path}...`);
    
    const testResults = {
        homeTest: false,
        positionTest: false,
        stopTest: false,
        errors: [],
        startTime: new Date().toISOString()
    };
    
    try {
        // Test 1: Home command
        console.log('🏠 Testing HOME command...');
        try {
            const homeResult = await sendFlexicartCommand(path, FLEXICART_COMMANDS.MOVE_HOME, 'HOME');
            testResults.homeTest = homeResult.success;
            if (homeResult.success) {
                console.log('✅ HOME command successful');
                // Wait for movement to complete
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        } catch (error) {
            testResults.errors.push(`HOME test: ${error.message}`);
            console.log(`❌ HOME test failed: ${error.message}`);
        }
        
        // Test 2: Position movement
        console.log('📍 Testing position movement...');
        try {
            const moveResult = await moveFlexicartToPosition(path, 2);
            testResults.positionTest = moveResult.success;
            if (moveResult.success) {
                console.log('✅ Position movement successful');
                // Wait for movement
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Move back to position 1
                await moveFlexicartToPosition(path, 1);
            }
        } catch (error) {
            testResults.errors.push(`Position test: ${error.message}`);
            console.log(`❌ Position test failed: ${error.message}`);
        }
        
        // Test 3: Stop command
        console.log('🛑 Testing STOP command...');
        try {
            const stopResult = await sendFlexicartCommand(path, FLEXICART_COMMANDS.STOP, 'STOP');
            testResults.stopTest = stopResult.success;
            if (stopResult.success) {
                console.log('✅ STOP command successful');
            }
        } catch (error) {
            testResults.errors.push(`STOP test: ${error.message}`);
            console.log(`❌ STOP test failed: ${error.message}`);
        }
        
        testResults.endTime = new Date().toISOString();
        
        // Summary
        const passedTests = [testResults.homeTest, testResults.positionTest, testResults.stopTest].filter(Boolean).length;
        console.log(`\n📊 Movement Test Summary: ${passedTests}/3 tests passed`);
        
        return testResults;
        
    } catch (error) {
        testResults.errors.push(`Test framework error: ${error.message}`);
        console.log(`❌ Movement test framework error: ${error.message}`);
        return testResults;
    }
}

/**
 * Calibrate Flexicart positioning system
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Calibration result
 */
async function calibrateFlexicart(path) {
    console.log(`⚙️ Calibrating Flexicart at ${path}...`);
    
    try {
        const response = await sendCommand(path, FLEXICART_COMMANDS.CALIBRATE, 30000); // 30s timeout for calibration
        const result = parseFlexicartCalibrationResponse(response);
        
        if (result.success) {
            console.log(`✅ Calibration completed successfully`);
        } else {
            console.log(`❌ Calibration failed: ${result.error}`);
        }
        
        return {
            success: result.success,
            calibrationData: result,
            rawResponse: response.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ Calibration failed: ${error.message}`);
        throw error;
    }
}

/**
 * Emergency stop Flexicart
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Stop result
 */
async function emergencyStopFlexicart(path) {
    console.log(`🚨 Emergency stop for Flexicart at ${path}...`);
    
    try {
        const response = await sendCommand(path, FLEXICART_COMMANDS.STOP, 1000);
        
        console.log(`✅ Emergency stop command sent`);
        return {
            success: true,
            rawResponse: response.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ Emergency stop failed: ${error.message}`);
        throw error;
    }
}

/**
 * Get Flexicart error status
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Error information
 */
async function getFlexicartErrors(path) {
    console.log(`🚨 Getting error status from Flexicart at ${path}...`);
    
    try {
        const response = await sendCommand(path, FLEXICART_COMMANDS.ERROR_STATUS, 3000);
        const errors = parseFlexicartErrors(response);
        
        if (errors.length === 0) {
            console.log(`✅ No errors reported`);
        } else {
            console.log(`⚠️  ${errors.length} error(s) found:`);
            errors.forEach((error, index) => {
                console.log(`   ${index + 1}. [${error.code}] ${error.description}`);
            });
        }
        
        return {
            success: true,
            errors,
            errorCount: errors.length,
            rawResponse: response.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ Failed to get errors: ${error.message}`);
        throw error;
    }
}

/**
 * Clear Flexicart errors
 * @param {string} path - Flexicart port path
 * @returns {Promise<Object>} Clear result
 */
async function clearFlexicartErrors(path) {
    console.log(`🧹 Clearing errors on Flexicart at ${path}...`);
    
    try {
        const response = await sendCommand(path, FLEXICART_COMMANDS.CLEAR_ERRORS, 3000);
        
        console.log(`✅ Error clear command sent`);
        return {
            success: true,
            rawResponse: response.toString('hex'),
            timestamp: new Date().toISOString()
        };
        
    } catch (error) {
        console.log(`❌ Failed to clear errors: ${error.message}`);
        throw error;
    }
}

// === PARSING FUNCTIONS ===

/**
 * Parse Flexicart status response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed status
 */
function parseFlexicartStatus(response) {
    if (!response || response.length < 3) {
        return {
            statusCode: 0xFF,
            statusText: 'UNKNOWN',
            ready: false,
            moving: false,
            errorCount: 0,
            raw: response ? response.toString('hex') : ''
        };
    }
    
    // Assuming response format: STX <status_byte> <error_count> ETX
    const statusByte = response[1];
    const errorCount = response.length > 2 ? response[2] : 0;
    
    return {
        statusCode: statusByte,
        statusText: FLEXICART_STATUS_CODES[statusByte] || 'UNKNOWN',
        ready: statusByte === 0x04,
        moving: statusByte === 0x01,
        errorCount: errorCount,
        raw: response.toString('hex')
    };
}

/**
 * Parse Flexicart position response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed position
 */
function parseFlexicartPosition(response) {
    if (!response || response.length < 4) {
        return {
            current: 0,
            total: 0,
            moving: false,
            raw: response ? response.toString('hex') : ''
        };
    }
    
    // Assuming response format: STX <current_high> <current_low> <total> ETX
    const currentHigh = response[1];
    const currentLow = response[2];
    const total = response[3];
    
    return {
        current: (currentHigh * 256) + currentLow,
        total: total,
        moving: false, // Would be determined from status
        raw: response.toString('hex')
    };
}

/**
 * Parse Flexicart inventory response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed inventory
 */
function parseFlexicartInventory(response) {
    if (!response || response.length < 3) {
        return {
            total: 0,
            occupied: [],
            empty: [],
            raw: response ? response.toString('hex') : ''
        };
    }
    
    // Simplified parsing - actual format would depend on Flexicart protocol
    const total = response[1];
    const occupiedCount = response[2];
    
    const occupied = [];
    const empty = [];
    
    // Generate mock data based on counts
    for (let i = 1; i <= total; i++) {
        if (i <= occupiedCount) {
            occupied.push(i);
        } else {
            empty.push(i);
        }
    }
    
    return {
        total,
        occupied,
        empty,
        raw: response.toString('hex')
    };
}

/**
 * Parse Flexicart version response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed version
 */
function parseFlexicartVersion(response) {
    if (!response || response.length < 4) {
        return {
            major: 0,
            minor: 0,
            build: 0,
            versionString: 'Unknown',
            raw: response ? response.toString('hex') : ''
        };
    }
    
    const major = response[1];
    const minor = response[2];
    const build = response[3];
    
    return {
        major,
        minor,
        build,
        versionString: `${major}.${minor}.${build}`,
        raw: response.toString('hex')
    };
}

/**
 * Parse Flexicart move response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed move result
 */
function parseFlexicartMoveResponse(response) {
    if (!response || response.length < 2) {
        return {
            success: false,
            error: 'No response',
            raw: response ? response.toString('hex') : ''
        };
    }
    
    const ackByte = response[1];
    
    return {
        success: ackByte === 0x06, // ACK
        error: ackByte === 0x15 ? 'Command rejected' : null,
        raw: response.toString('hex')
    };
}

/**
 * Parse Flexicart calibration response
 * @param {Buffer} response - Raw response buffer
 * @returns {Object} Parsed calibration result
 */
function parseFlexicartCalibrationResponse(response) {
    if (!response || response.length < 2) {
        return {
            success: false,
            error: 'No response',
            raw: response ? response.toString('hex') : ''
        };
    }
    
    const resultByte = response[1];
    
    return {
        success: resultByte === 0x06,
        error: resultByte !== 0x06 ? 'Calibration failed' : null,
        raw: response.toString('hex')
    };
}

/**
 * Parse Flexicart error response
 * @param {Buffer} response - Raw response buffer
 * @returns {Array} Array of error objects
 */
function parseFlexicartErrors(response) {
    if (!response || response.length < 2) {
        return [];
    }
    
    const errors = [];
    
    // Parse error bytes (skip STX and ETX)
    for (let i = 1; i < response.length - 1; i++) {
        const errorCode = response[i];
        if (errorCode !== 0x00) {
            errors.push({
                code: errorCode,
                description: FLEXICART_ERROR_CODES[errorCode] || `Unknown error (0x${errorCode.toString(16)})`
            });
        }
    }
    
    return errors;
}

module.exports = {
    // Main interface functions
    autoScanFlexicarts,
    getFlexicartStatus,
    sendFlexicartCommand,
    establishFlexicartControl,
    testFlexicartCommunication,
    getFlexicartPosition,
    moveFlexicartToPosition,
    getFlexicartInventory,
    testFlexicartMovement,
    calibrateFlexicart,
    emergencyStopFlexicart,
    getFlexicartErrors,
    clearFlexicartErrors,
    
    // Parsing functions
    parseFlexicartStatus,
    parseFlexicartPosition,
    parseFlexicartInventory,
    parseFlexicartVersion,
    parseFlexicartMoveResponse,
    parseFlexicartCalibrationResponse,
    parseFlexicartErrors,
    
    // Utility functions
    sendCommand,
    
    // Constants and classes
    FLEXICART_COMMANDS,
    FLEXICART_STATUS_CODES,
    FLEXICART_ERROR_CODES,
    FlexicartError
};

