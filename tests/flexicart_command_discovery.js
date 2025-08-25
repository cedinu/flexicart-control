/**
 * FlexiCart Command Discovery - CORRECTED SETUP
 * Port: /dev/ttyRP0 (corrected cabling)
 * 
 * Simple diagnostic tool to discover which commands FlexiCart accepts
 * This will help us identify the correct command format by testing basic commands
 */

const { SerialPort } = require('serialport');

// CORRECTED Configuration
const CONFIG = {
    PORT: '/dev/ttyRP0',
    BAUD_RATE: 38400,
    DATA_BITS: 8,
    PARITY: 'even',
    STOP_BITS: 1,
    TIMEOUT: 1500
};

/**
 * Create FlexiCart command with different formats
 */
function createCommand(cmd, ctrl = 0x00, data = 0x80, cartAddress = 0x01, format = 'standard') {
    let command;
    
    switch (format) {
        case 'standard':
            // Standard 9-byte format we've been using
            command = Buffer.alloc(9);
            command[0] = 0x02;          // STX
            command[1] = 0x06;          // BC
            command[2] = 0x01;          // UA1
            command[3] = cartAddress;   // UA2
            command[4] = 0x00;          // BT
            command[5] = cmd;           // CMD
            command[6] = ctrl;          // CTRL
            command[7] = data;          // DATA
            
            // Calculate checksum (XOR of bytes 1-7)
            let checksum = 0;
            for (let i = 1; i < 8; i++) {
                checksum ^= command[i];
            }
            command[8] = checksum;      // CS
            break;
            
        case 'simple':
            // Simple 4-byte format (like Sony VTR)
            command = Buffer.alloc(4);
            command[0] = 0x90;          // Sony-style header
            command[1] = cmd;           // Command
            command[2] = ctrl;          // Parameter
            command[3] = data;          // Data/checksum
            break;
            
        case 'minimal':
            // Minimal format
            command = Buffer.alloc(2);
            command[0] = cmd;           // Command
            command[1] = ctrl;          // Parameter
            break;
    }
    
    return command;
}

/**
 * Send single command on open port (prevents port locking)
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
                resolve({ success: false, error: `Write failed: ${writeError.message}`, command: commandName });
                return;
            }
            
            serialPort.drain(() => {
                timeoutHandle = setTimeout(() => {
                    cleanup();
                    
                    const response = Buffer.concat(chunks);
                    const hex = response.toString('hex').match(/.{2}/g)?.join(' ') || 'no response';
                    
                    let responseType = 'none';
                    let isAccepted = false;
                    
                    if (response.length > 0) {
                        const firstByte = response[0];
                        
                        if (firstByte === 0x04) {
                            responseType = 'ACK';
                            isAccepted = true;
                        } else if (firstByte === 0x05) {
                            responseType = 'NACK';
                            isAccepted = false;
                        } else if (firstByte === 0x06) {
                            responseType = 'BUSY';
                            isAccepted = true; // Device is responding
                        } else {
                            responseType = 'DATA';
                            isAccepted = true;
                        }
                    }
                    
                    resolve({
                        success: response.length > 0,
                        command: commandName,
                        hex: hex,
                        length: response.length,
                        responseType: responseType,
                        isAccepted: isAccepted,
                        firstByte: response.length > 0 ? response[0] : null
                    });
                    
                }, CONFIG.TIMEOUT);
            });
        });
    });
}

/**
 * Discover working commands using single connection (prevents port locking)
 */
async function discoverCommands(port = CONFIG.PORT, cartAddress = 0x01) {
    console.log(`\n🔍 FlexiCart Command Discovery`);
    console.log(`==============================`);
    console.log(`Port: ${port}`);
    console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
    console.log(`Config: ${CONFIG.BAUD_RATE} baud, 8E1\n`);
    
    const basicCommands = [
        // Try very basic commands that should work on most devices
        { name: 'Simple Status', cmd: 0x00, ctrl: 0x00, format: 'standard' },
        { name: 'Device ID', cmd: 0x01, ctrl: 0x00, format: 'standard' },
        { name: 'Reset', cmd: 0x02, ctrl: 0x00, format: 'standard' },
        { name: 'Stop', cmd: 0x20, ctrl: 0x00, format: 'standard' },
        { name: 'Status Alt 1', cmd: 0x60, ctrl: 0x00, format: 'standard' },
        { name: 'Status Alt 2', cmd: 0x61, ctrl: 0x00, format: 'standard' },
        { name: 'Status Alt 3', cmd: 0x61, ctrl: 0x10, format: 'standard' },
        
        // Sony-style commands  
        { name: 'Sony Status', cmd: 0x61, ctrl: 0x00, format: 'simple' },
        { name: 'Sony Device', cmd: 0x11, ctrl: 0x00, format: 'simple' },
        
        // Try minimal format
        { name: 'Minimal Ping', cmd: 0x00, ctrl: 0x00, format: 'minimal' }
    ];
    
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
        const acceptedCommands = [];
        let commandIndex = 0;
        
        const cleanup = () => {
            if (serialPort.isOpen) {
                serialPort.close(() => {
                    finishDiscovery();
                });
            } else {
                finishDiscovery();
            }
        };
        
        const finishDiscovery = () => {
            // Summary
            console.log(`\n📊 DISCOVERY SUMMARY`);
            console.log(`====================`);
            console.log(`Total Commands Tested: ${results.length}`);
            console.log(`Commands with Responses: ${results.filter(r => r.success).length}`);
            console.log(`Commands ACCEPTED: ${acceptedCommands.length}`);
            console.log(`Commands REJECTED: ${results.filter(r => r.success && !r.isAccepted).length}`);
            
            if (acceptedCommands.length > 0) {
                console.log(`\n✅ ACCEPTED COMMANDS:`);
                acceptedCommands.forEach(cmd => {
                    console.log(`   ${cmd.command}: ${cmd.hex} → ${cmd.responseType}`);
                });
                
                console.log(`\n🎯 RECOMMENDATIONS:`);
                console.log(`Use these accepted commands as basis for further testing`);
                
                // Find the simplest working command format
                const formats = [...new Set(acceptedCommands.map(cmd => {
                    // Determine format from command length
                    if (cmd.hex.split(' ').length === 9) return 'standard';
                    if (cmd.hex.split(' ').length === 4) return 'simple';
                    if (cmd.hex.split(' ').length === 2) return 'minimal';
                    return 'unknown';
                }))];
                
                console.log(`Working formats: ${formats.join(', ')}`);
            } else {
                console.log(`\n❌ NO COMMANDS ACCEPTED`);
                console.log(`This suggests:`);
                console.log(`   - FlexiCart may not be responding`);
                console.log(`   - Different protocol required`);
                console.log(`   - Different cart address needed`);
                console.log(`   - Hardware/connection issues`);
            }
            
            resolve({
                totalTested: results.length,
                acceptedCount: acceptedCommands.length,
                acceptedCommands: acceptedCommands,
                allResults: results
            });
        };
        
        const processNextCommand = async () => {
            if (commandIndex >= basicCommands.length) {
                cleanup();
                return;
            }
            
            const cmdTest = basicCommands[commandIndex];
            const command = createCommand(cmdTest.cmd, cmdTest.ctrl, 0x80, cartAddress, cmdTest.format);
            
            console.log(`📤 Testing: ${cmdTest.name} (${cmdTest.format} format)`);
            console.log(`   Command: ${command.toString('hex').match(/.{2}/g)?.join(' ')}`);
            
            try {
                const result = await sendCommandOnPort(serialPort, command, cmdTest.name);
                results.push(result);
                
                if (result.success) {
                    console.log(`   📥 Response: ${result.hex} (${result.responseType})`);
                    
                    if (result.isAccepted) {
                        console.log(`   ✅ ACCEPTED by FlexiCart`);
                        acceptedCommands.push(result);
                    } else {
                        console.log(`   ❌ REJECTED (NACK)`);
                    }
                } else {
                    console.log(`   💥 ERROR: ${result.error || 'Unknown error'}`);
                }
                
            } catch (error) {
                results.push({
                    success: false,
                    error: error.message || 'Unknown exception',
                    command: cmdTest.name
                });
                console.log(`   💥 Exception: ${error.message || 'Unknown exception'}`);
            }
            
            console.log('');
            commandIndex++;
            
            // Short delay between commands
            setTimeout(processNextCommand, 200);
        };
        
        serialPort.on('error', (error) => {
            console.error(`Serial port error: ${error.message}`);
            cleanup();
        });
        
        serialPort.open((error) => {
            if (error) {
                console.error(`Failed to open port: ${error.message}`);
                resolve([{
                    success: false,
                    error: `Port open failed: ${error.message}`,
                    commandName: 'PORT_OPEN'
                }]);
                return;
            }
            
            console.log(`✅ Port ${port} opened successfully`);
            processNextCommand();
        });
    });
}

// Export for use in other modules
module.exports = {
    CONFIG,
    createCommand,
    sendCommandOnPort,
    discoverCommands
};

// Run discovery if called directly
if (require.main === module) {
    const port = process.argv[2] || CONFIG.PORT;
    const cartAddress = process.argv[3] ? parseInt(process.argv[3], 16) : 0x01;
    
    console.log(`🔍 Starting FlexiCart command discovery...`);
    console.log(`Port: ${port}`);
    console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
    
    discoverCommands(port, cartAddress)
        .then(results => {
            if (results.acceptedCount > 0) {
                console.log(`\n✅ Discovery successful - ${results.acceptedCount} commands accepted!`);
                process.exit(0);
            } else {
                console.log(`\n❌ No commands accepted - check setup`);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error(`\n💥 Discovery failed: ${error.message}`);
            process.exit(1);
        });
}
