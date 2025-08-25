/**
 * FlexiCart Protocol Reality Check - CORRECTED SETUP
 * Port: /dev/ttyRP0 (corrected cabling)
 * 
 * This tests the ACTUAL working command formats found in the codebase
 * instead of the theoretical 9-byte format that's getting NACK
 */

const { SerialPort } = require('serialport');

// CORRECTED Configuration
const CONFIG = {
    PORT: '/dev/ttyRP0',
    BAUD_RATE: 38400,
    DATA_BITS: 8,
    PARITY: 'even',
    STOP_BITS: 1,
    TIMEOUT: 2000
};

/**
 * ACTUAL working command formats from existing codebase
 */
const WORKING_COMMANDS = {
    // Sony VTR-style commands (found in flexicart_sony_protocol.js)
    DEVICE_TYPE: Buffer.from([0x90, 0x11, 0x00, 0x00]),
    SENSE_STATUS: Buffer.from([0x90, 0x61, 0x00, 0x00]),
    POSITION_STATUS: Buffer.from([0x90, 0x10, 0x00, 0x00]),
    GENERAL_STATUS: Buffer.from([0x90, 0x60, 0x00, 0x00]),
    
    // Text-based commands (confirmed working in codebase)
    STATUS_QUERY: Buffer.from([0x53, 0x3F, 0x0D]),             // "S?" + CR
    ID_QUERY: Buffer.from([0x49, 0x44, 0x3F, 0x0D]),           // "ID?" + CR
    HOME_COMMAND: Buffer.from([0x48, 0x4F, 0x4D, 0x45, 0x0D]), // "HOME" + CR
    
    // Alternative status formats
    ID_REQUEST: Buffer.from([0x88, 0x01]),
    STATUS_REQUEST: Buffer.from([0x88, 0x20]),
    
    // Stop commands
    STOP_TEXT: Buffer.from([0x53, 0x54, 0x4F, 0x50, 0x0D]),    // "STOP" + CR
    SONY_STOP: Buffer.from([0x90, 0x20, 0x00, 0x00]),
    
    // Simple format tests
    SIMPLE_PING: Buffer.from([0x90, 0x00, 0x00, 0x00]),
    SIMPLE_STATUS: Buffer.from([0x90, 0x61, 0x00, 0x01])
};

/**
 * Send command and analyze response
 */
function sendCommandOnPort(serialPort, command, commandName) {
    return new Promise((resolve) => {
        const chunks = [];
        let timeoutHandle;
        
        const cleanup = () => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            serialPort.removeAllListeners('data');
        };
        
        serialPort.on('data', (chunk) => {
            chunks.push(chunk);
        });
        
        serialPort.write(command, (writeError) => {
            if (writeError) {
                cleanup();
                resolve({
                    success: false,
                    error: `Write failed: ${writeError.message || 'Unknown write error'}`,
                    commandName: commandName
                });
                return;
            }
            
            serialPort.drain(() => {
                timeoutHandle = setTimeout(() => {
                    cleanup();
                    
                    const response = Buffer.concat(chunks);
                    const analysis = analyzeResponse(response, commandName);
                    
                    resolve({
                        success: response.length > 0,
                        commandName: commandName,
                        response: response,
                        hex: response.toString('hex').match(/.{2}/g)?.join(' ') || 'no response',
                        ...analysis
                    });
                    
                }, CONFIG.TIMEOUT);
            });
        });
    });
}

/**
 * Analyze response with enhanced pattern recognition
 */
function analyzeResponse(response, commandName) {
    if (response.length === 0) {
        return {
            type: 'NO_RESPONSE',
            accepted: false,
            message: 'Device did not respond',
            pattern: 'none'
        };
    }
    
    const firstByte = response[0];
    const analysis = {
        length: response.length,
        firstByte: firstByte,
        firstByteHex: '0x' + firstByte.toString(16).toUpperCase().padStart(2, '0'),
        bytes: Array.from(response).map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0'))
    };
    
    // Check for known response patterns
    if (firstByte === 0x04) {
        analysis.type = 'ACK';
        analysis.accepted = true;
        analysis.message = 'Command accepted (ACK)';
        analysis.pattern = 'ack';
    } else if (firstByte === 0x05) {
        analysis.type = 'NACK';
        analysis.accepted = false;
        analysis.message = 'Command rejected (NACK)';
        analysis.pattern = 'nack';
    } else if (firstByte === 0x06) {
        analysis.type = 'BUSY';
        analysis.accepted = true;
        analysis.message = 'Device busy';
        analysis.pattern = 'busy';
    } else if (firstByte === 0xFF) {
        // Sync pattern - common in Sony VTR responses
        analysis.type = 'SYNC_DATA';
        analysis.accepted = true;
        analysis.message = 'Sync pattern response (Sony VTR style)';
        analysis.pattern = 'sync';
        
        // Count sync bytes
        let syncCount = 0;
        let dataBytes = [];
        for (let i = 0; i < response.length; i++) {
            if (response[i] === 0xFF) {
                syncCount++;
            } else {
                dataBytes.push(response[i]);
            }
        }
        analysis.syncCount = syncCount;
        analysis.dataBytes = dataBytes;
        analysis.nonSyncHex = dataBytes.map(b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
        
    } else if (response.length >= 3 && response[0] >= 0x20 && response[0] <= 0x7E) {
        // Possible text response
        analysis.type = 'TEXT_DATA';
        analysis.accepted = true;
        analysis.message = 'Text response received';
        analysis.pattern = 'text';
        analysis.textContent = response.toString('ascii').replace(/\r?\n/g, '\\n');
        
    } else {
        // Binary data response
        analysis.type = 'BINARY_DATA';
        analysis.accepted = true;
        analysis.message = 'Binary data response';
        analysis.pattern = 'binary';
        
        // Check if it looks like status data
        if (response.length >= 3) {
            analysis.possibleStatus = true;
            analysis.interpretation = interpretBinaryStatus(response);
        }
    }
    
    return analysis;
}

/**
 * Interpret binary status data
 */
function interpretBinaryStatus(response) {
    const interpretations = [];
    
    if (response.length >= 1) {
        const status1 = response[0];
        interpretations.push(`Status1: 0x${status1.toString(16).padStart(2, '0')}`);
        
        if (status1 & 0x01) interpretations.push('Ready');
        if (status1 & 0x02) interpretations.push('Moving');
        if (status1 & 0x04) interpretations.push('Home position');
        if (status1 & 0x08) interpretations.push('Error');
        if (status1 & 0x10) interpretations.push('Cart present');
        if (status1 & 0x20) interpretations.push('On-air');
    }
    
    if (response.length >= 2) {
        const status2 = response[1];
        interpretations.push(`Status2: 0x${status2.toString(16).padStart(2, '0')}`);
        
        if (status2 === 0x00) interpretations.push('Operation complete');
        else if (status2 === 0x01) interpretations.push('Operation in progress');
        else if (status2 === 0x80) interpretations.push('Position reached');
    }
    
    return interpretations.join(', ');
}

/**
 * Test all working command formats
 */
async function testWorkingCommands(port = CONFIG.PORT) {
    console.log(`\n🔍 FlexiCart Protocol Reality Check`);
    console.log(`===================================`);
    console.log(`Port: ${port}`);
    console.log(`Config: ${CONFIG.BAUD_RATE} baud, 8E1`);
    console.log(`Testing ACTUAL working formats from codebase\n`);
    
    return new Promise((resolve) => {
        const serialPort = new SerialPort({
            path: port,
            baudRate: CONFIG.BAUD_RATE,
            dataBits: CONFIG.DATA_BITS,
            parity: CONFIG.PARITY,
            stopBits: CONFIG.STOP_BITS,
            autoOpen: false
        });
        
        const results = [];
        const workingCommands = [];
        const commandEntries = Object.entries(WORKING_COMMANDS);
        let commandIndex = 0;
        
        const cleanup = () => {
            if (serialPort.isOpen) {
                serialPort.close(() => {
                    finishTest();
                });
            } else {
                finishTest();
            }
        };
        
        const finishTest = () => {
            // Analysis
            const summary = {
                totalTested: results.length,
                responses: results.filter(r => r.success).length,
                accepted: workingCommands.length,
                nacks: results.filter(r => r.success && r.type === 'NACK').length,
                dataResponses: results.filter(r => r.success && (r.type === 'SYNC_DATA' || r.type === 'BINARY_DATA' || r.type === 'TEXT_DATA')).length,
                acks: results.filter(r => r.success && r.type === 'ACK').length,
                errors: results.filter(r => !r.success).length
            };
            
            console.log(`📊 REALITY CHECK SUMMARY`);
            console.log(`========================`);
            console.log(`Commands Tested: ${summary.totalTested}`);
            console.log(`Got Responses: ${summary.responses}`);
            console.log(`Working Commands: ${summary.accepted}`);
            console.log(`NACK Rejections: ${summary.nacks}`);
            console.log(`Data Responses: ${summary.dataResponses}`);
            console.log(`ACK Responses: ${summary.acks}`);
            console.log(`Errors: ${summary.errors}`);
            
            if (workingCommands.length > 0) {
                console.log(`\n✅ WORKING COMMANDS FOUND:`);
                workingCommands.forEach(cmd => {
                    console.log(`   ${cmd.commandName}:`);
                    console.log(`     Format: ${cmd.hex}`);
                    console.log(`     Response: ${cmd.type} - ${cmd.message}`);
                    if (cmd.type === 'SYNC_DATA') {
                        console.log(`     Data: ${cmd.nonSyncHex || 'sync only'}`);
                    } else if (cmd.type === 'TEXT_DATA') {
                        console.log(`     Text: "${cmd.textContent}"`);
                    } else if (cmd.type === 'BINARY_DATA' && cmd.interpretation) {
                        console.log(`     Status: ${cmd.interpretation}`);
                    }
                    console.log('');
                });
                
                console.log(`🎯 PROTOCOL CONCLUSION:`);
                const patterns = [...new Set(workingCommands.map(cmd => cmd.pattern))];
                console.log(`Working patterns: ${patterns.join(', ')}`);
                
                if (patterns.includes('sync')) {
                    console.log(`✅ Sony VTR protocol working - use 4-byte commands starting with 0x90`);
                }
                if (patterns.includes('text')) {
                    console.log(`✅ Text protocol working - use ASCII commands with CR termination`);
                }
                if (patterns.includes('ack')) {
                    console.log(`✅ ACK protocol working - commands return 0x04 for acceptance`);
                }
                
            } else {
                console.log(`\n❌ NO WORKING COMMANDS FOUND`);
                
                if (summary.nacks === summary.responses) {
                    console.log(`All commands got NACK - FlexiCart may be in wrong mode or expecting different protocol`);
                } else if (summary.responses === 0) {
                    console.log(`No responses - check hardware connection and power`);
                }
            }
            
            resolve({
                summary: summary,
                workingCommands: workingCommands,
                allResults: results,
                protocolWorking: workingCommands.length > 0
            });
        };
        
        const processNextCommand = async () => {
            if (commandIndex >= commandEntries.length) {
                cleanup();
                return;
            }
            
            const [commandName, commandBuffer] = commandEntries[commandIndex];
            
            console.log(`📤 Testing: ${commandName}`);
            console.log(`   Command: ${commandBuffer.toString('hex').match(/.{2}/g)?.join(' ')}`);
            console.log(`   Format: ${getCommandFormat(commandBuffer)}`);
            
            try {
                const result = await sendCommandOnPort(serialPort, commandBuffer, commandName);
                results.push(result);
                
                if (result.success) {
                    console.log(`   📥 Response: ${result.hex}`);
                    console.log(`   📊 Analysis: ${result.type} - ${result.message}`);
                    
                    if (result.accepted) {
                        console.log(`   ✅ WORKING COMMAND!`);
                        workingCommands.push(result);
                    } else {
                        console.log(`   ❌ Rejected`);
                    }
                    
                } else {
                    console.log(`   💥 ERROR: ${result.error || 'Unknown error'}`);
                }
                
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message || 'Unknown exception',
                    commandName: commandName
                });
                console.log(`   💥 Exception: ${error.message || 'Unknown exception'}`);
            }
            
            console.log('');
            commandIndex++;
            
            // Delay between commands
            setTimeout(processNextCommand, 300);
        };
        
        serialPort.on('error', (error) => {
            console.error(`Serial port error: ${error.message}`);
            cleanup();
        });
        
        serialPort.open((error) => {
            if (error) {
                console.error(`Failed to open port: ${error.message}`);
                resolve({
                    summary: { totalTested: 0, responses: 0, accepted: 0, protocolWorking: false },
                    workingCommands: [],
                    allResults: [{
                        success: false,
                        error: `Port open failed: ${error.message}`,
                        commandName: 'PORT_OPEN'
                    }]
                });
                return;
            }
            
            console.log(`✅ Port ${port} opened successfully`);
            processNextCommand();
        });
    });
}

/**
 * Identify command format
 */
function getCommandFormat(buffer) {
    if (buffer.length === 4 && buffer[0] === 0x90) {
        return 'Sony VTR (4-byte)';
    } else if (buffer.length === 2 && buffer[0] === 0x88) {
        return 'Sony Short (2-byte)';
    } else if (buffer[buffer.length - 1] === 0x0D) {
        return 'Text + CR';
    } else if (buffer.length === 9 && buffer[0] === 0x02) {
        return 'FlexiCart 9-byte';
    } else {
        return `Custom (${buffer.length}-byte)`;
    }
}

// Export for use in other modules
module.exports = {
    CONFIG,
    WORKING_COMMANDS,
    testWorkingCommands,
    analyzeResponse
};

// Run test if called directly
if (require.main === module) {
    const port = process.argv[2] || CONFIG.PORT;
    
    console.log(`🔍 Starting FlexiCart protocol reality check...`);
    
    testWorkingCommands(port)
        .then(results => {
            if (results.protocolWorking) {
                console.log(`\n🎯 SUCCESS! Found ${results.workingCommands.length} working commands!`);
                console.log(`Use these formats for further FlexiCart communication.`);
                process.exit(0);
            } else {
                console.log(`\n💥 No working protocols found - check setup`);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error(`\n💥 Test error: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        });
}
