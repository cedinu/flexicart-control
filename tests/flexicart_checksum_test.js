/**
 * FlexiCart Checksum Method Test - CORRECTED SETUP
 * Port: /dev/ttyRP0 (corrected cabling)
 * 
 * Critical Discovery: There are TWO checksum methods in the codebase!
 * This tests both to determine which FlexiCart actually expects.
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
 * Create FlexiCart command with XOR checksum (Method 1)
 */
function createCommandXOR(cmd, ctrl = 0x00, data = 0x80, cartAddress = 0x01) {
    const command = Buffer.alloc(9);
    command[0] = 0x02;          // STX
    command[1] = 0x06;          // BC
    command[2] = 0x01;          // UA1
    command[3] = cartAddress;   // UA2
    command[4] = 0x00;          // BT
    command[5] = cmd;           // CMD
    command[6] = ctrl;          // CTRL
    command[7] = data;          // DATA
    
    // Method 1: XOR checksum of bytes 1-7
    let checksum = 0;
    for (let i = 1; i < 8; i++) {
        checksum ^= command[i];
    }
    command[8] = checksum;      // CS
    
    return command;
}

/**
 * Create FlexiCart command with 2's complement checksum (Method 2)
 */
function createCommand2sComp(cmd, ctrl = 0x00, data = 0x80, cartAddress = 0x01) {
    const command = Buffer.alloc(9);
    command[0] = 0x02;          // STX
    command[1] = 0x06;          // BC
    command[2] = 0x01;          // UA1
    command[3] = cartAddress;   // UA2
    command[4] = 0x00;          // BT
    command[5] = cmd;           // CMD
    command[6] = ctrl;          // CTRL
    command[7] = data;          // DATA
    
    // Method 2: Sum + 2's complement checksum of bytes 1-7
    let sum = 0;
    for (let i = 1; i < 8; i++) {
        sum += command[i];
    }
    command[8] = (0x100 - (sum & 0xFF)) & 0xFF;  // CS
    
    return command;
}

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
                    
                    resolve({
                        success: response.length > 0,
                        commandName: commandName,
                        response: response,
                        hex: response.toString('hex').match(/.{2}/g)?.join(' ') || 'no response',
                        length: response.length,
                        firstByte: response.length > 0 ? response[0] : null,
                        isACK: response.length > 0 && response[0] === 0x04,
                        isNACK: response.length > 0 && response[0] === 0x05,
                        accepted: response.length > 0 && (response[0] === 0x04 || response[0] !== 0x05)
                    });
                    
                }, CONFIG.TIMEOUT);
            });
        });
    });
}

/**
 * Test both checksum methods
 */
async function testChecksumMethods(port = CONFIG.PORT, cartAddress = 0x01) {
    console.log(`\n🔬 FlexiCart Checksum Method Test`);
    console.log(`=================================`);
    console.log(`Port: ${port}`);
    console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
    console.log(`Config: ${CONFIG.BAUD_RATE} baud, 8E1`);
    console.log(`\nCRITICAL: Testing both checksum methods found in codebase!\n`);
    
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
        const workingMethods = [];
        let testIndex = 0;
        
        // Test commands with both checksum methods
        const testCases = [
            // Method 1: XOR Checksum
            { name: 'Status Request (XOR)', method: 'XOR', cmd: 0x61, ctrl: 0x10, createFn: createCommandXOR },
            { name: 'Device ID (XOR)', method: 'XOR', cmd: 0x01, ctrl: 0x00, createFn: createCommandXOR },
            { name: 'Simple Status (XOR)', method: 'XOR', cmd: 0x00, ctrl: 0x00, createFn: createCommandXOR },
            { name: 'Tally OFF (XOR)', method: 'XOR', cmd: 0x71, ctrl: 0x00, createFn: createCommandXOR },
            
            // Method 2: 2's Complement Checksum
            { name: 'Status Request (2sComp)', method: '2sComp', cmd: 0x61, ctrl: 0x10, createFn: createCommand2sComp },
            { name: 'Device ID (2sComp)', method: '2sComp', cmd: 0x01, ctrl: 0x00, createFn: createCommand2sComp },
            { name: 'Simple Status (2sComp)', method: '2sComp', cmd: 0x00, ctrl: 0x00, createFn: createCommand2sComp },
            { name: 'Tally OFF (2sComp)', method: '2sComp', cmd: 0x71, ctrl: 0x00, createFn: createCommand2sComp }
        ];
        
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
            // Analyze results
            const xorResults = results.filter(r => r.method === 'XOR');
            const compResults = results.filter(r => r.method === '2sComp');
            
            const xorAccepted = xorResults.filter(r => r.success && r.accepted).length;
            const xorNACKs = xorResults.filter(r => r.success && r.isNACK).length;
            const compAccepted = compResults.filter(r => r.success && r.accepted).length;
            const compNACKs = compResults.filter(r => r.success && r.isNACK).length;
            
            console.log(`📊 CHECKSUM METHOD ANALYSIS`);
            console.log(`============================`);
            console.log(`XOR Method (newer tests):`);
            console.log(`  Tests: ${xorResults.length}`);
            console.log(`  Accepted: ${xorAccepted}`);
            console.log(`  NACKs: ${xorNACKs}`);
            console.log(`  Success Rate: ${xorResults.length > 0 ? ((xorAccepted / xorResults.length) * 100).toFixed(1) : 0}%`);
            
            console.log(`\n2's Complement Method (serial_utils):`);
            console.log(`  Tests: ${compResults.length}`);
            console.log(`  Accepted: ${compAccepted}`);
            console.log(`  NACKs: ${compNACKs}`);
            console.log(`  Success Rate: ${compResults.length > 0 ? ((compAccepted / compResults.length) * 100).toFixed(1) : 0}%`);
            
            // Determine the correct method
            if (xorAccepted > compAccepted) {
                console.log(`\n✅ RESULT: XOR checksum method is CORRECT!`);
                console.log(`Update all command creation to use XOR checksum.`);
                workingMethods.push({ method: 'XOR', accepted: xorAccepted, rate: (xorAccepted / xorResults.length) * 100 });
            } else if (compAccepted > xorAccepted) {
                console.log(`\n✅ RESULT: 2's Complement checksum method is CORRECT!`);
                console.log(`Update newer tests to use 2's complement checksum.`);
                workingMethods.push({ method: '2sComp', accepted: compAccepted, rate: (compAccepted / compResults.length) * 100 });
            } else if (xorAccepted === 0 && compAccepted === 0) {
                console.log(`\n❌ RESULT: Both checksum methods getting NACK!`);
                console.log(`This suggests a different issue:`);
                console.log(`- Wrong command format entirely`);
                console.log(`- FlexiCart expects different protocol`);
                console.log(`- Hardware/addressing issue`);
            } else {
                console.log(`\n🤔 RESULT: Both methods partially working`);
                console.log(`Need more testing to determine correct method.`);
            }
            
            // Show working examples
            const workingCommands = results.filter(r => r.success && r.accepted);
            if (workingCommands.length > 0) {
                console.log(`\n✅ WORKING COMMANDS FOUND:`);
                workingCommands.forEach(cmd => {
                    console.log(`   ${cmd.commandName}: ${cmd.hex} (${cmd.method})`);
                });
            }
            
            resolve({
                xorMethod: { tested: xorResults.length, accepted: xorAccepted, nacks: xorNACKs },
                compMethod: { tested: compResults.length, accepted: compAccepted, nacks: compNACKs },
                workingMethods: workingMethods,
                workingCommands: workingCommands,
                allResults: results,
                recommendedMethod: xorAccepted > compAccepted ? 'XOR' : compAccepted > xorAccepted ? '2sComp' : 'unknown'
            });
        };
        
        const processNextTest = async () => {
            if (testIndex >= testCases.length) {
                cleanup();
                return;
            }
            
            const test = testCases[testIndex];
            const command = test.createFn(test.cmd, test.ctrl, 0x80, cartAddress);
            
            console.log(`📤 Testing: ${test.name}`);
            console.log(`   Method: ${test.method}`);
            console.log(`   Command: ${command.toString('hex').match(/.{2}/g)?.join(' ')}`);
            
            // Show checksum calculation
            if (test.method === 'XOR') {
                let xorCheck = 0;
                for (let i = 1; i < 8; i++) xorCheck ^= command[i];
                console.log(`   XOR Checksum: 0x${xorCheck.toString(16).toUpperCase().padStart(2, '0')}`);
            } else {
                let sum = 0;
                for (let i = 1; i < 8; i++) sum += command[i];
                const comp = (0x100 - (sum & 0xFF)) & 0xFF;
                console.log(`   2's Comp Checksum: 0x${comp.toString(16).toUpperCase().padStart(2, '0')}`);
            }
            
            try {
                const result = await sendCommandOnPort(serialPort, command, test.name);
                result.method = test.method;
                results.push(result);
                
                if (result.success) {
                    console.log(`   📥 Response: ${result.hex}`);
                    
                    if (result.isACK) {
                        console.log(`   ✅ ACK RECEIVED! This checksum method works!`);
                    } else if (result.isNACK) {
                        console.log(`   ❌ NACK - checksum method rejected`);
                    } else {
                        console.log(`   📊 Data response - method may work`);
                    }
                } else {
                    console.log(`   💥 ERROR: ${result.error || 'Unknown error'}`);
                }
                
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message || 'Unknown exception',
                    commandName: test.name,
                    method: test.method
                });
                console.log(`   💥 Exception: ${error.message || 'Unknown exception'}`);
            }
            
            console.log('');
            testIndex++;
            
            // Delay between tests
            setTimeout(processNextTest, 400);
        };
        
        serialPort.on('error', (error) => {
            console.error(`Serial port error: ${error.message}`);
            cleanup();
        });
        
        serialPort.open((error) => {
            if (error) {
                console.error(`Failed to open port: ${error.message}`);
                resolve({
                    xorMethod: { tested: 0, accepted: 0, nacks: 0 },
                    compMethod: { tested: 0, accepted: 0, nacks: 0 },
                    workingMethods: [],
                    workingCommands: [],
                    allResults: [],
                    recommendedMethod: 'unknown',
                    error: `Port open failed: ${error.message}`
                });
                return;
            }
            
            console.log(`✅ Port ${port} opened successfully`);
            processNextTest();
        });
    });
}

// Export for use in other modules
module.exports = {
    CONFIG,
    createCommandXOR,
    createCommand2sComp,
    testChecksumMethods
};

// Run test if called directly
if (require.main === module) {
    const port = process.argv[2] || CONFIG.PORT;
    const cartAddress = process.argv[3] ? parseInt(process.argv[3], 16) : 0x01;
    
    console.log(`🔬 Starting FlexiCart checksum method test...`);
    
    testChecksumMethods(port, cartAddress)
        .then(results => {
            if (results.workingMethods.length > 0) {
                console.log(`\n🎯 SUCCESS! Found working checksum method: ${results.recommendedMethod}`);
                console.log(`Use this method for all future FlexiCart commands.`);
                process.exit(0);
            } else {
                console.log(`\n💥 No working checksum methods found`);
                console.log(`Both XOR and 2's complement checksums rejected by FlexiCart`);
                console.log(`This suggests the 9-byte format itself may be wrong.`);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error(`\n💥 Test error: ${error.message}`);
            console.error(error.stack);
            process.exit(1);
        });
}
