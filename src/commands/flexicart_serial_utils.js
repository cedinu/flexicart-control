/**
 * Flexicart Serial Communication Utilities
 * Core serial communication functions without circular dependencies
 */

const { SerialPort } = require('serialport');
const { execSync } = require('child_process');

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
 * PRODUCTION READY - FlexiCart Serial Communication
 * Using CONFIRMED working configuration: 19200 baud, 8E1
 */

/**
 * Force release port locks (Linux-specific fix)
 */
function releasePortLocks(path) {
    try {
        execSync(`fuser -k ${path}`, { stdio: 'ignore' });
    } catch (e) {
        // Ignore errors - port might not be in use
    }
}

/**
 * Create FlexiCart command packet
 */
function createFlexiCartCommand(ua2, cmd, bt = 0x00, control = 0x00, data = 0x80) {
    const packet = Buffer.alloc(9);
    packet[0] = 0x02;        // STX
    packet[1] = 0x06;        // BC (Byte Count)
    packet[2] = 0x01;        // UA1 (Unit Address 1 - FlexiCart type)
    packet[3] = ua2;         // UA2 (Unit Address 2 - Cart ID)
    packet[4] = bt;          // BT (Block Type)
    packet[5] = cmd;         // CMD (Command)
    packet[6] = control;     // Control byte
    packet[7] = data;        // Data byte
    
    // Calculate checksum (sum of BC through DATA, then 2's complement)
    let sum = 0;
    for (let i = 1; i < 8; i++) {
        sum += packet[i];
    }
    packet[8] = (0x100 - (sum & 0xFF)) & 0xFF;
    
    return packet;
}

/**
 * Parse FlexiCart response
 */
function parseFlexiCartResponse(response) {
    if (!response || response.length === 0) {
        return { type: 'NO_RESPONSE', valid: false };
    }

    const hex = response.toString('hex').toUpperCase();
    
    // Check for known FlexiCart response patterns
    const patterns = {
        hasSpacePattern: hex.includes('2020'),
        hasStatusPattern: hex.includes('0606') || hex.includes('FCFC'),
        hasUnitPattern: hex.includes('0101'),
        hasMaxPattern: hex.includes('FFFF'),
        hasETXPattern: hex.includes('0303'),
        isStatusLength: response.length >= 10 && response.length <= 30
    };
    
    const patternCount = Object.values(patterns).filter(p => p).length;
    
    return {
        type: 'FLEXICART_STATUS',
        valid: patternCount >= 2, // At least 2 patterns indicate FlexiCart response
        length: response.length,
        hex: hex,
        patterns: patterns,
        raw: response
    };
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
            
            // CONFIRMED WORKING CONFIGURATION
            port = new SerialPort({
                path: path,
                baudRate: 19200,        // CONFIRMED: Changed from 38400 to 19200
                dataBits: 8,           
                parity: 'even',        // CONFIRMED: Even parity required
                stopBits: 1,           
                flowControl: false,    
                autoOpen: false,
                lock: false
            });

            if (debug) {
                console.log(`    📡 [DEBUG] RS-422 Settings: 19200 baud, 8E1 (CONFIRMED WORKING)`);
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

/**
 * High-level FlexiCart command functions using CONFIRMED settings
 */

/**
 * Send dummy command (CONFIRMED WORKING)
 */
async function sendDummyCommand(path, cartAddress = 0x01, debug = false) {
    if (debug) console.log(`📤 [DEBUG] Sending dummy command to cart 0x${cartAddress.toString(16).toUpperCase()}`);
    
    const command = createFlexiCartCommand(cartAddress, 0x50); // CMD 0x50 = Dummy
    const response = await sendCommand(path, command, 5000, debug);
    
    if (debug && response) {
        console.log(`📥 [DEBUG] Dummy response: ${response.type}, Length: ${response.length || 0}`);
    }
    
    return response;
}

/**
 * Send status request
 */
async function sendStatusRequest(path, cartAddress = 0x01, debug = false) {
    if (debug) console.log(`📤 [DEBUG] Sending status request to cart 0x${cartAddress.toString(16).toUpperCase()}`);
    
    const command = createFlexiCartCommand(cartAddress, 0x61); // CMD 0x61 = Status
    const response = await sendCommand(path, command, 5000, debug);
    
    if (debug && response) {
        console.log(`📥 [DEBUG] Status response: ${response.type}, Length: ${response.length || 0}`);
    }
    
    return response;
}

/**
 * Send system mode request
 */
async function sendSystemModeRequest(path, cartAddress = 0x01, debug = false) {
    if (debug) console.log(`📤 [DEBUG] Sending system mode request to cart 0x${cartAddress.toString(16).toUpperCase()}`);
    
    const command = createFlexiCartCommand(cartAddress, 0x65); // CMD 0x65 = System Mode
    const response = await sendCommand(path, command, 5000, debug);
    
    if (debug && response) {
        console.log(`📥 [DEBUG] System mode response: ${response.type}, Length: ${response.length || 0}`);
    }
    
    return response;
}

/**
 * Test FlexiCart connectivity with CONFIRMED settings
 */
async function testFlexiCartConnection(path, debug = false) {
    console.log(`🔬 Testing FlexiCart connection on ${path}`);
    console.log(`📡 Using CONFIRMED settings: 19200 baud, 8E1, RS-422`);
    
    try {
        // Test with confirmed working dummy command
        const response = await sendDummyCommand(path, 0x01, debug);
        
        if (response && response.valid) {
            console.log(`✅ FlexiCart connection successful!`);
            console.log(`📊 Response type: ${response.type}`);
            console.log(`📊 Response length: ${response.length} bytes`);
            console.log(`📊 Response hex: ${response.hex}`);
            return { success: true, response: response };
        } else {
            console.log(`❌ FlexiCart connection failed - invalid response`);
            return { success: false, error: 'Invalid response format' };
        }
        
    } catch (error) {
        console.log(`❌ FlexiCart connection failed: ${error.message}`);
        return { success: false, error: error.message };
    }
}

module.exports = {
    FlexicartError,
    sendCommand,
    createFlexiCartCommand,
    parseFlexiCartResponse,
    sendDummyCommand,
    sendStatusRequest,
    sendSystemModeRequest,
    testFlexiCartConnection
};