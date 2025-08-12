/**
 * Flexicart Status Command Functions
 * Handles all status-related operations for Flexicart devices
 */

// Import from the new serial utils module
const { sendCommand } = require('./flexicart_serial_utils');
const { parseFlexicartStatus } = require('./flexicart_status_parser');

/**
 * Get current status of Flexicart
 * @param {string} path - Serial port path
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Status result
 */
async function getFlexicartStatus(path, timeout = 2000, debug = false) {
    try {
        if (debug) console.log(`📊 Getting Flexicart status from ${path}...`);
        
        const response = await sendCommand(path, FLEXICART_COMMANDS.STATUS, timeout, debug);
        const status = parseFlexicartStatus(response);
        
        return {
            success: true,
            status: status,
            raw: response,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        if (debug) console.log(`❌ Status check failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Get current position of Flexicart
 * @param {string} path - Serial port path
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Position result
 */
async function getFlexicartPosition(path, timeout = 2000, debug = false) {
    try {
        if (debug) console.log(`📍 Getting Flexicart position from ${path}...`);
        
        const response = await sendCommand(path, FLEXICART_COMMANDS.GET_POSITION, timeout, debug);
        const position = parseFlexicartPosition(response);
        
        return {
            success: true,
            position: position,
            raw: response,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        if (debug) console.log(`❌ Position check failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Get inventory information from Flexicart
 * @param {string} path - Serial port path
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Inventory result
 */
async function getFlexicartInventory(path, timeout = 3000, debug = false) {
    try {
        if (debug) console.log(`📦 Getting Flexicart inventory from ${path}...`);
        
        const response = await sendCommand(path, FLEXICART_COMMANDS.GET_INVENTORY, timeout, debug);
        const inventory = parseFlexicartInventory(response);
        
        return {
            success: true,
            inventory: inventory,
            raw: response,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        if (debug) console.log(`❌ Inventory check failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Get error status from Flexicart
 * @param {string} path - Serial port path
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Error status result
 */
async function getFlexicartErrors(path, timeout = 2000, debug = false) {
    try {
        if (debug) console.log(`🚨 Getting Flexicart errors from ${path}...`);
        
        const response = await sendCommand(path, FLEXICART_COMMANDS.GET_ERRORS, timeout, debug);
        const errors = parseFlexicartErrors(response);
        
        return {
            success: true,
            errors: errors,
            raw: response,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        if (debug) console.log(`❌ Error status check failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Clear all errors on Flexicart
 * @param {string} path - Serial port path
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Clear errors result
 */
async function clearFlexicartErrors(path, timeout = 2000, debug = false) {
    try {
        if (debug) console.log(`🧹 Clearing Flexicart errors on ${path}...`);
        
        const response = await sendCommand(path, FLEXICART_COMMANDS.CLEAR_ERRORS, timeout, debug);
        const status = parseFlexicartStatus(response);
        
        return {
            success: true,
            status: status,
            raw: response,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        if (debug) console.log(`❌ Clear errors failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Test communication with Flexicart
 * @param {string} path - Serial port path
 * @param {number} timeout - Command timeout in milliseconds
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Object>} Communication test result
 */
async function testFlexicartCommunication(path, timeout = 2000, debug = false) {
    try {
        if (debug) console.log(`🔄 Testing communication with ${path}...`);
        
        const startTime = Date.now();
        const response = await sendCommand(path, FLEXICART_COMMANDS.STATUS, timeout, debug);
        const endTime = Date.now();
        
        const status = parseFlexicartStatus(response);
        const responseTime = endTime - startTime;
        
        return {
            success: true,
            status: status,
            responseTime: responseTime,
            raw: response,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        if (debug) console.log(`❌ Communication test failed: ${error.message}`);
        return {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

/**
 * Auto-scan multiple ports for Flexicart devices
 * @param {Array<string>} ports - Array of port paths to scan
 * @param {boolean} debug - Enable debug output
 * @returns {Promise<Array>} Array of found Flexicart devices
 */
async function autoScanFlexicarts(ports, debug = false) {
    const results = [];
    const scanStartTime = Date.now();
    let portStats = {
        total: ports.length,
        scanned: 0,
        responding: 0,
        errors: {}
    };

    console.log(`🔍 Scanning ${ports.length} ports for Flexicart devices...`);

    for (const port of ports) {
        portStats.scanned++;
        const portStartTime = Date.now();
        
        try {
            if (debug) {
                console.log(`\n📡 [${portStats.scanned}/${portStats.total}] Testing port: ${port}`);
            }

            // Quick communication test
            const result = await testFlexicartCommunication(port, 2000, debug);
            const portDuration = Date.now() - portStartTime;

            if (result.success) {
                portStats.responding++;
                
                const flexicart = {
                    port: port,
                    status: result.status,
                    responseTime: result.responseTime,
                    scanDuration: portDuration,
                    timestamp: result.timestamp
                };

                results.push(flexicart);
                
                if (debug) {
                    console.log(`    ✅ Flexicart found! Status: ${result.status.statusText} (${portDuration}ms)`);
                } else {
                    console.log(`📦 Found Flexicart at ${port} - ${result.status.statusText}`);
                }
            } else {
                if (debug) {
                    console.log(`    ❌ No response (${portDuration}ms): ${result.error}`);
                }
                
                // Track error types
                const errorType = result.error.includes('timeout') ? 'timeout' : 
                                result.error.includes('denied') ? 'permission' :
                                result.error.includes('ENOENT') ? 'not_found' : 'other';
                
                portStats.errors[errorType] = (portStats.errors[errorType] || 0) + 1;
            }

        } catch (error) {
            const portDuration = Date.now() - portStartTime;
            if (debug) {
                console.log(`    💥 Exception (${portDuration}ms): ${error.message}`);
            }
            
            portStats.errors.exception = (portStats.errors.exception || 0) + 1;
        }

        // Small delay between scans to prevent overwhelming the system
        if (portStats.scanned < portStats.total) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    const totalDuration = Date.now() - scanStartTime;

    if (debug) {
        console.log('\n🔍 [DEBUG] Detailed Scan Summary:');
        console.log('================================');
        console.log(`📁 Ports scanned: ${portStats.scanned}/${portStats.total}`);
        console.log(`📡 Ports responding: ${portStats.responding}/${portStats.total}`);
        console.log(`✅ Flexicarts found: ${results.length}`);
        console.log(`⏱️  Total scan time: ${totalDuration}ms`);
        console.log(`📊 Average per port: ${Math.round(totalDuration / portStats.total)}ms`);
        
        if (Object.keys(portStats.errors).length > 0) {
            console.log('\n🚨 Error breakdown:');
            Object.entries(portStats.errors).forEach(([type, count]) => {
                console.log(`   ${type}: ${count} port(s)`);
            });
        }
        
        if (results.length > 0) {
            console.log('\n📊 Response time analysis:');
            const responseTimes = results.map(r => r.responseTime);
            const avgResponse = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
            const minResponse = Math.min(...responseTimes);
            const maxResponse = Math.max(...responseTimes);
            
            console.log(`   Average: ${avgResponse}ms`);
            console.log(`   Fastest: ${minResponse}ms`);
            console.log(`   Slowest: ${maxResponse}ms`);
        }
    }

    console.log(`\n✅ Scan completed: Found ${results.length} Flexicart device(s) in ${totalDuration}ms`);
    
    return results;
}

// Flexicart command constants
const FLEXICART_COMMANDS = {
    STATUS: Buffer.from([0x02, 0x53, 0x03]),           // STX S ETX
    GET_POSITION: Buffer.from([0x02, 0x50, 0x03]),     // STX P ETX  
    GET_INVENTORY: Buffer.from([0x02, 0x49, 0x03]),    // STX I ETX
    GET_ERRORS: Buffer.from([0x02, 0x45, 0x03]),       // STX E ETX
    CLEAR_ERRORS: Buffer.from([0x02, 0x43, 0x03]),     // STX C ETX
    GET_VERSION: Buffer.from([0x02, 0x56, 0x03]),      // STX V ETX
    PING: Buffer.from([0x05]),                         // ENQ
    RESET: Buffer.from([0x02, 0x52, 0x03])             // STX R ETX
};

module.exports = {
    getFlexicartStatus,
    getFlexicartPosition, 
    getFlexicartInventory,
    getFlexicartErrors,
    clearFlexicartErrors,
    testFlexicartCommunication,
    autoScanFlexicarts,
    FLEXICART_COMMANDS
};