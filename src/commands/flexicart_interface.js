/**
 * Flexicart Interface - Main Integration Module
 * Combines status, transport, and parsing functionality
 */

const { SerialPort } = require('serialport');

// Import specialized modules
const {
    getFlexicartStatus,
    getFlexicartPosition,
    getFlexicartInventory,
    getFlexicartErrors,
    clearFlexicartErrors,
    testFlexicartCommunication,
    autoScanFlexicarts,
    FLEXICART_COMMANDS
} = require('./flexicart_cmds_status');

const {
    sendFlexicartCommand,
    moveFlexicartHome,
    moveFlexicartToPosition,
    emergencyStopFlexicart,
    calibrateFlexicart,
    establishFlexicartControl,
    testFlexicartMovement,
    FLEXICART_MOVEMENT_COMMANDS
} = require('./flexicart_cmds_transport');

const {
    parseFlexicartStatus,
    parseFlexicartPosition,
    parseFlexicartInventory,
    parseFlexicartErrors,
    parseFlexicartMoveResponse,
    parseFlexicartCalibrationResponse,
    FLEXICART_STATUS_CODES,
    FLEXICART_ERROR_CODES
} = require('./flexicart_status_parser');

/**
 * Flexicart Error class for handling device-specific errors
 */
class FlexicartError extends Error {
    constructor(message, code = 'FLEXICART_ERROR', port = null) {
        super(message);
        this.name = 'FlexicartError';
        this.code = code;
        this.port = port;
        this.timestamp = new Date().toISOString();
    }
}

/**
 * Core command sending function with enhanced error handling
 * @param {string} path - Serial port path
 * @param {Buffer} command - Command buffer to send
 * @param {number} timeout - Response timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Buffer>} Response buffer
 */
async function sendCommand(path, command, timeout = 3000, debug = false) {
    return new Promise((resolve, reject) => {
        let port;
        let timeoutId;
        let openTimeout;
        let responseBuffer = Buffer.alloc(0);
        const startTime = Date.now();
        let isResolved = false;

        function cleanup(error = null, result = null) {
            if (isResolved) return;
            isResolved = true;
            
            // Clear all timeouts
            if (timeoutId) clearTimeout(timeoutId);
            if (openTimeout) clearTimeout(openTimeout);
            
            // Close port safely
            if (port) {
                try {
                    if (port.isOpen) {
                        port.removeAllListeners();
                        port.close((err) => {
                            if (debug && err) console.log(`    ⚠️  [DEBUG] Close error: ${err.message}`);
                            if (error) reject(error);
                            else if (result) resolve(result);
                        });
                    } else {
                        if (error) reject(error);
                        else if (result) resolve(result);
                    }
                } catch (closeError) {
                    if (debug) console.log(`    ⚠️  [DEBUG] Close exception: ${closeError.message}`);
                    if (error) reject(error);
                    else if (result) resolve(result);
                }
            } else {
                if (error) reject(error);
                else if (result) resolve(result);
            }
        }

        try {
            if (debug) console.log(`    🔌 [DEBUG] Opening RS-422 port ${path}...`);
            
            // RS-422 configuration for Sony Flexicart
            port = new SerialPort({
                path: path,
                baudRate: 38400,        
                dataBits: 8,           
                parity: 'even',        
                stopBits: 1,           
                flowControl: false,    
                autoOpen: false,
                lock: false  // Disable port locking
            });

            if (debug) {
                console.log(`    📡 [DEBUG] RS-422 Settings: 38400 baud, 8E1, no flow control, no locking`);
            }

            // Set open timeout
            openTimeout = setTimeout(() => {
                if (debug) console.log(`    ⏰ [DEBUG] Port open timeout for ${path}`);
                cleanup(new FlexicartError(`Port open timeout: ${path}`, 'OPEN_TIMEOUT', path));
            }, 5000);

            // Handle port errors
            port.on('error', (err) => {
                if (debug) console.log(`    ❌ [DEBUG] RS-422 port error: ${err.message}`);
                cleanup(new FlexicartError(`Port error: ${err.message}`, 'PORT_ERROR', path));
            });

            port.open((err) => {
                if (openTimeout) {
                    clearTimeout(openTimeout);
                    openTimeout = null;
                }
                
                const openDuration = Date.now() - startTime;
                
                if (err) {
                    if (debug) console.log(`    ❌ [DEBUG] Failed to open ${path}: ${err.message} (${openDuration}ms)`);
                    cleanup(new FlexicartError(`Failed to open port: ${err.message}`, 'OPEN_FAILED', path));
                    return;
                }
                
                if (debug) console.log(`    ✅ [DEBUG] RS-422 port ${path} opened successfully (${openDuration}ms)`);

                // Set up data handler
                port.on('data', (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);
                    
                    if (debug) {
                        console.log(`    📥 [DEBUG] Received ${data.length} bytes: ${data.toString('hex')}`);
                        console.log(`    📥 [DEBUG] ASCII: "${data.toString('ascii').replace(/[^\x20-\x7E]/g, '.')}" `);
                        console.log(`    📥 [DEBUG] Total buffer: ${responseBuffer.length} bytes: ${responseBuffer.toString('hex')}`);
                    }
                    
                    // Check for complete response patterns
                    if (data.includes(0x03) ||           // ETX terminator
                        data.includes(0x0D) ||           // CR terminator  
                        data.includes(0x0A) ||           // LF terminator
                        responseBuffer.length >= 64) {   // Max reasonable response length
                        
                        const totalDuration = Date.now() - startTime;
                        if (debug) console.log(`    ✅ [DEBUG] Complete response received (${totalDuration}ms total)`);
                        cleanup(null, responseBuffer);
                    }
                });

                // Set response timeout
                timeoutId = setTimeout(() => {
                    const totalDuration = Date.now() - startTime;
                    if (debug) {
                        console.log(`    ⏰ [DEBUG] Response timeout after ${totalDuration}ms`);
                        console.log(`    📥 [DEBUG] Partial response: ${responseBuffer.length} bytes: ${responseBuffer.toString('hex')}`);
                    }
                    
                    if (responseBuffer.length > 0) {
                        if (debug) console.log(`    📥 [DEBUG] Returning partial response`);
                        cleanup(null, responseBuffer);
                    } else {
                        cleanup(new FlexicartError(`Response timeout: ${timeout}ms`, 'RESPONSE_TIMEOUT', path));
                    }
                }, timeout);

                // Send command with RS-422 considerations
                if (debug) {
                    console.log(`    📤 [DEBUG] Sending RS-422 command: ${command.toString('hex')} (${command.length} bytes)`);
                    console.log(`    📤 [DEBUG] Command ASCII: "${command.toString('ascii').replace(/[^\x20-\x7E]/g, '.')}"`);
                }
                
                port.write(command, (err) => {
                    const writeDuration = Date.now() - startTime;
                    if (err) {
                        if (debug) console.log(`    ❌ [DEBUG] RS-422 write failed after ${writeDuration}ms: ${err.message}`);
                        cleanup(new FlexicartError(`Write failed: ${err.message}`, 'WRITE_FAILED', path));
                    } else {
                        if (debug) console.log(`    ✅ [DEBUG] RS-422 command sent successfully (${writeDuration}ms)`);
                    }
                });
            });

        } catch (error) {
            const catchDuration = Date.now() - startTime;
            if (debug) console.log(`    ❌ [DEBUG] RS-422 exception after ${catchDuration}ms: ${error.message}`);
            cleanup(new FlexicartError(`Send command failed: ${error.message}`, 'SEND_FAILED', path));
        }
    });
}

// Export all functionality from the specialized modules
module.exports = {
    // Status functions
    getFlexicartStatus,
    getFlexicartPosition,
    getFlexicartInventory,
    getFlexicartErrors,
    clearFlexicartErrors,
    testFlexicartCommunication,
    autoScanFlexicarts,
    
    // Transport functions
    sendFlexicartCommand,
    moveFlexicartHome,
    moveFlexicartToPosition,
    emergencyStopFlexicart,
    calibrateFlexicart,
    establishFlexicartControl,
    testFlexicartMovement,
    
    // Parsing functions
    parseFlexicartStatus,
    parseFlexicartPosition,
    parseFlexicartInventory,
    parseFlexicartErrors,
    parseFlexicartMoveResponse,
    parseFlexicartCalibrationResponse,
    
    // Core utility
    sendCommand,
    
    // Constants and classes
    FLEXICART_COMMANDS,
    FLEXICART_MOVEMENT_COMMANDS,
    FLEXICART_STATUS_CODES,
    FLEXICART_ERROR_CODES,
    FlexicartError
};

