/**
 * Fixed FlexiCart Status Checker & Controller
 * Corrects command parsing issues
 */

const { SerialPort } = require('serialport');
const { execSync } = require('child_process');
const readline = require('readline');

class FlexiCartStatusFixed {
    
    /**
     * Show usage information
     */
    static showUsage() {
        console.log(`🎬 FlexiCart Status Checker & Controller (FIXED)`);
        console.log(`===============================================`);
        console.log(``);
        console.log(`Usage:`);
        console.log(`  node check_flexicart_status_fixed.js scan [--debug]           # Scan for FlexiCarts`);
        console.log(`  node check_flexicart_status_fixed.js status <port> [--debug]  # Check status`);
        console.log(`  node check_flexicart_status_fixed.js control <port>           # Interactive control`);
        console.log(`  node check_flexicart_status_fixed.js test <port>              # Test communication`);
        console.log(`  node check_flexicart_status_fixed.js move <port>              # Test movement`);
        console.log(``);
        console.log(`Examples:`);
        console.log(`  node check_flexicart_status_fixed.js scan`);
        console.log(`  node check_flexicart_status_fixed.js status /dev/ttyRP8`);
        console.log(`  node check_flexicart_status_fixed.js control /dev/ttyRP8`);
        console.log(`  node check_flexicart_status_fixed.js test /dev/ttyRP8 --debug`);
        console.log(``);
        console.log(`📋 Available FlexiCart ports:`);
        this.listAvailablePorts();
    }

    /**
     * List available serial ports
     */
    static listAvailablePorts() {
        const commonPorts = [
            '/dev/ttyRP8', '/dev/ttyRP6', '/dev/ttyUSB0', '/dev/ttyUSB1',
            'COM1', 'COM2', 'COM3', 'COM4'
        ];
        
        commonPorts.forEach(port => {
            console.log(`  📦 ${port}`);
        });
    }

    /**
     * Create FlexiCart command (38400 baud specification)
     */
    static createCommand(ua2, cmd, bt = 0x00, control = 0x00, data = 0x80) {
        const packet = Buffer.alloc(9);
        packet[0] = 0x02;        // STX
        packet[1] = 0x06;        // BC
        packet[2] = 0x01;        // UA1
        packet[3] = ua2;         // UA2
        packet[4] = bt;          // BT
        packet[5] = cmd;         // CMD
        packet[6] = control;     // Control
        packet[7] = data;        // Data
        
        // Calculate checksum
        let sum = 0;
        for (let i = 1; i < 8; i++) {
            sum += packet[i];
        }
        packet[8] = (0x100 - (sum & 0xFF)) & 0xFF;
        
        return packet;
    }

    /**
     * Send command using correct FlexiCart settings (38400 8E1)
     */
    static async sendCommand(portPath, command, timeout = 4000, debug = false) {
        // Add aggressive port cleanup before opening
        try {
            const { execSync } = require('child_process');
            execSync(`sudo fuser -k ${portPath}`, { stdio: 'ignore' });
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
            // Ignore cleanup errors
        }

        return new Promise((resolve) => {
            if (debug) console.log(`📤 Sending: ${command.toString('hex').toUpperCase()}`);
            
            let port;
            let responseBuffer = Buffer.alloc(0);
            let resolved = false;
            let timeoutHandle;

            const cleanup = (result) => {
                if (resolved) return;
                resolved = true;
                
                if (timeoutHandle) clearTimeout(timeoutHandle);
                
                if (port) {
                    try {
                        port.removeAllListeners();
                        if (port.isOpen) {
                            port.close(() => {
                                // Force additional cleanup
                                setTimeout(() => resolve(result), 500);
                            });
                        } else {
                            resolve(result);
                        }
                    } catch (e) {
                        resolve(result);
                    }
                } else {
                    resolve(result);
                }
            };

            try {
                port = new SerialPort({
                    path: portPath,
                    baudRate: 38400,        // CORRECT FlexiCart rate
                    dataBits: 8,
                    parity: 'even',
                    stopBits: 1,
                    autoOpen: false,
                    lock: false             // Disable locking
                });

                port.on('data', (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);
                    if (debug) console.log(`📥 Data: ${data.toString('hex').toUpperCase()}`);
                });

                port.on('error', (err) => {
                    if (debug) console.log(`❌ Error: ${err.message}`);
                    cleanup({ success: false, error: err.message });
                });

                port.open((openErr) => {
                    if (openErr) {
                        cleanup({ success: false, error: openErr.message });
                        return;
                    }

                    if (debug) console.log(`✅ Port opened (38400 8E1)`);

                    // Set response timeout
                    timeoutHandle = setTimeout(() => {
                        if (debug) console.log(`📊 Response: ${responseBuffer.length} bytes`);
                        
                        cleanup({
                            success: responseBuffer.length > 0,
                            response: responseBuffer,
                            hex: responseBuffer.toString('hex').toUpperCase(),
                            length: responseBuffer.length
                        });
                    }, timeout);

                    port.write(command, (writeErr) => {
                        if (writeErr) {
                            cleanup({ success: false, error: writeErr.message });
                            return;
                        }

                        if (debug) console.log(`✅ Command sent`);
                    });
                });

            } catch (error) {
                cleanup({ success: false, error: error.message });
            }
        });
    }

    /**
     * Scan for FlexiCart devices
     */
    static async scanForFlexiCarts(debug = false) {
        console.log(`🔍 Scanning for FlexiCart devices...`);
        console.log(`📡 Using: 38400 baud, 8E1 (FlexiCart specification)`);
        console.log(``);

        const ports = ['/dev/ttyRP8', '/dev/ttyRP6', '/dev/ttyUSB0', '/dev/ttyUSB1'];
        const cartAddresses = [0x01, 0x02, 0x04, 0x08];
        const foundDevices = [];

        for (const port of ports) {
            console.log(`📦 Testing port: ${port}`);
            
            for (const address of cartAddresses) {
                console.log(`   🎯 Testing cart address: 0x${address.toString(16).toUpperCase()}`);
                
                try {
                    const command = this.createCommand(address, 0x50); // Dummy command
                    const result = await this.sendCommand(port, command, 3000, debug);
                    
                    if (result.success) {
                        console.log(`   ✅ FlexiCart found! Address: 0x${address.toString(16).toUpperCase()}, Response: ${result.length} bytes`);
                        foundDevices.push({
                            port: port,
                            address: address,
                            response: result.hex
                        });
                    } else {
                        console.log(`   ❌ No response`);
                    }
                    
                } catch (error) {
                    console.log(`   ❌ Error: ${error.message}`);
                }
                
                // Brief delay between tests
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            console.log(``);
        }

        console.log(`📋 Scan Results:`);
        if (foundDevices.length > 0) {
            console.log(`✅ Found ${foundDevices.length} FlexiCart device(s):`);
            foundDevices.forEach((device, index) => {
                console.log(`   ${index + 1}. Port: ${device.port}, Address: 0x${device.address.toString(16).toUpperCase()}`);
            });
        } else {
            console.log(`❌ No FlexiCart devices found`);
        }

        return foundDevices;
    }

    /**
     * Check FlexiCart status
     */
    static async checkStatus(portPath, debug = false) {
        console.log(`📊 FlexiCart Status Check`);
        console.log(`========================`);
        console.log(`Port: ${portPath}`);
        console.log(`Settings: 38400 baud, 8E1`);
        console.log(``);

        const commands = [
            { name: 'Dummy Command', cmd: 0x50, desc: 'Basic communication test' },
            { name: 'Status Request', cmd: 0x61, desc: 'Request cart status' },
            { name: 'System Mode', cmd: 0x65, desc: 'Request system mode' },
            { name: 'Position Request', cmd: 0x60, desc: 'Request position' }
        ];

        for (const cmdInfo of commands) {
            console.log(`📤 ${cmdInfo.name}: ${cmdInfo.desc}`);
            
            try {
                const command = this.createCommand(0x01, cmdInfo.cmd);
                const result = await this.sendCommand(portPath, command, 3000, debug);
                
                if (result.success) {
                    console.log(`   ✅ Response: ${result.length} bytes - ${result.hex}`);
                } else {
                    console.log(`   ❌ No response: ${result.error || 'Unknown error'}`);
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
            
            // Longer delay between commands
            console.log(`   ⏳ Waiting 3 seconds for port cleanup...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    }

    /**
     * Test basic communication
     */
    static async testCommunication(portPath, debug = false) {
        console.log(`🔧 FlexiCart Communication Test`);
        console.log(`==============================`);
        console.log(`Port: ${portPath}`);
        console.log(`Testing with 38400 8E1 settings`);
        console.log(``);

        try {
            const command = this.createCommand(0x01, 0x50); // Dummy command
            console.log(`📤 Sending dummy command to Cart 1...`);
            
            const result = await this.sendCommand(portPath, command, 4000, debug);
            
            if (result.success) {
                console.log(`✅ Communication successful!`);
                console.log(`📊 Response: ${result.length} bytes`);
                console.log(`📊 Hex: ${result.hex}`);
                console.log(`📊 ASCII: "${result.response.toString().replace(/[^\x20-\x7E]/g, '.')}"`);
                return true;
            } else {
                console.log(`❌ Communication failed: ${result.error}`);
                return false;
            }
            
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Interactive control mode
     */
    static async interactiveControl(portPath) {
        console.log(`🎮 FlexiCart Interactive Control`);
        console.log(`===============================`);
        console.log(`Port: ${portPath}`);
        console.log(`Commands: dummy, status, stop, quit`);
        console.log(``);

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const askCommand = () => {
            rl.question('FlexiCart> ', async (input) => {
                const cmd = input.trim().toLowerCase();
                
                switch (cmd) {
                    case 'dummy':
                        console.log(`📤 Sending dummy command...`);
                        await this.testCommunication(portPath, true);
                        break;
                    case 'status':
                        console.log(`📤 Requesting status...`);
                        await this.checkStatus(portPath, true);
                        break;
                    case 'stop':
                        console.log(`📤 Sending stop command...`);
                        const stopCmd = this.createCommand(0x01, 0x20);
                        const result = await this.sendCommand(portPath, stopCmd, 3000, true);
                        console.log(result.success ? '✅ Stop sent' : '❌ Stop failed');
                        break;
                    case 'quit':
                    case 'exit':
                        console.log(`👋 Goodbye!`);
                        rl.close();
                        return;
                    default:
                        console.log(`❌ Unknown command: ${cmd}`);
                        console.log(`Available: dummy, status, stop, quit`);
                }
                
                askCommand();
            });
        };

        askCommand();
    }
}

/**
 * Main execution with fixed command parsing
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        FlexiCartStatusFixed.showUsage();
        return;
    }

    const command = args[0];
    const port = args[1];
    const debug = args.includes('--debug') || args.includes('-d');

    console.log(`🎬 FlexiCart Status Checker & Controller (FIXED)`);
    console.log(`===============================================`);
    console.log(`📋 Command: ${command}`);
    if (port) console.log(`📦 Port: ${port}`);
    if (debug) console.log(`🐛 Debug: enabled`);
    console.log(``);

    try {
        switch (command) {
            case 'scan':
                await FlexiCartStatusFixed.scanForFlexiCarts(debug);
                break;
                
            case 'status':
                if (!port) {
                    console.log(`❌ Port required for status command`);
                    console.log(`Example: node check_flexicart_status_fixed.js status /dev/ttyRP8`);
                    return;
                }
                await FlexiCartStatusFixed.checkStatus(port, debug);
                break;
                
            case 'test':
                if (!port) {
                    console.log(`❌ Port required for test command`);
                    console.log(`Example: node check_flexicart_status_fixed.js test /dev/ttyRP8`);
                    return;
                }
                await FlexiCartStatusFixed.testCommunication(port, debug);
                break;
                
            case 'control':
                if (!port) {
                    console.log(`❌ Port required for control command`);
                    console.log(`Example: node check_flexicart_status_fixed.js control /dev/ttyRP8`);
                    return;
                }
                await FlexiCartStatusFixed.interactiveControl(port);
                break;
                
            default:
                console.log(`❌ Unknown command: ${command}`);
                console.log(``);
                FlexiCartStatusFixed.showUsage();
        }
        
    } catch (error) {
        console.error(`💥 Error: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { FlexiCartStatusFixed };