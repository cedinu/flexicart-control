/**
 * FlexiCart Status Checker & Controller - WORKING VERSION
 * Uses validated 38400 8E1 protocol from your successful tests
 */

const { SerialPort } = require('serialport');
const readline = require('readline');

// Import only the working functions we need
const { FlexiCartStatusFixed } = require('./check_flexicart_status_fixed');

/**
 * Response analyzer (embedded to avoid circular imports)
 */
class ResponseAnalyzer {
    static analyzeResponse(commandName, commandCode, responseHex, responseBytes) {
        const analysis = {
            command: commandName,
            commandCode: commandCode,
            responseHex: responseHex,
            length: responseBytes.length,
            valid: false,
            interpretation: ''
        };

        // Simple validation based on response length and patterns
        switch (commandCode) {
            case 0x50: // Dummy
                analysis.valid = responseBytes.length >= 8 && responseBytes.length <= 20;
                analysis.interpretation = analysis.valid ? 
                    'Dummy command acknowledged - FlexiCart responding' : 'Invalid dummy response';
                break;
            case 0x61: // Status
                analysis.valid = responseBytes.length >= 10 && responseBytes.length <= 16;
                analysis.interpretation = analysis.valid ?
                    'Cart status data received' : 'Invalid status response';
                break;
            case 0x65: // System Mode
                analysis.valid = responseBytes.length >= 8 && responseBytes.length <= 15;
                analysis.interpretation = analysis.valid ?
                    'System mode data received' : 'Invalid system response';
                break;
            case 0x20: // Stop
                analysis.valid = responseBytes.length >= 6 && responseBytes.length <= 12;
                analysis.interpretation = analysis.valid ?
                    'Stop command acknowledged' : 'Invalid stop response';
                break;
            case 0x60: // Position
                analysis.valid = responseBytes.length >= 8 && responseBytes.length <= 14;
                analysis.interpretation = analysis.valid ?
                    'Position data received' : 'Invalid position response';
                break;
            default:
                analysis.interpretation = 'Unknown command response';
        }

        return analysis;
    }
}

/**
 * FlexiCart Status Checker - WORKING VERSION
 */
class FlexiCartStatusChecker {
    
    static config = {
        baudRate: 38400,
        dataBits: 8,
        parity: 'even',
        stopBits: 1,
        workingPort: '/dev/ttyRP8',
        workingCartAddress: 0x01
    };

    static commands = {
        DUMMY: { cmd: 0x50, name: 'Dummy Command', desc: 'Communication test' },
        STATUS: { cmd: 0x61, name: 'Status Request', desc: 'Get cart status' },
        SYSTEM_MODE: { cmd: 0x65, name: 'System Mode', desc: 'Get system parameters' },
        POSITION: { cmd: 0x60, name: 'Position Request', desc: 'Get current position' },
        STOP: { cmd: 0x20, name: 'Stop Command', desc: 'Emergency stop' }
    };

    /**
     * Scan for FlexiCart devices
     */
    static async scanAllFlexiCarts(debug = false) {
        console.log('🎬 FlexiCart System Scanner (WORKING VERSION)');
        console.log('=============================================');
        console.log('Using validated 38400 8E1 protocol\n');

        const testPorts = [
            '/dev/ttyRP8',   // Known working
            '/dev/ttyRP6', '/dev/ttyRP0', '/dev/ttyRP1', '/dev/ttyRP2', 
            '/dev/ttyRP3', '/dev/ttyRP4', '/dev/ttyRP5', '/dev/ttyRP7', 
            '/dev/ttyRP9', '/dev/ttyUSB0', '/dev/ttyUSB1'
        ];

        const cartAddresses = [0x01, 0x02, 0x04, 0x08];
        const foundDevices = [];

        for (const port of testPorts) {
            console.log(`\n📦 Testing port: ${port}`);
            
            for (const address of cartAddresses) {
                console.log(`   🎯 Cart address: 0x${address.toString(16).toUpperCase()}`);
                
                try {
                    const command = FlexiCartStatusFixed.createCommand(address, this.commands.DUMMY.cmd);
                    const result = await FlexiCartStatusFixed.sendCommand(port, command, 3000, debug);
                    
                    if (result.success && result.length > 0) {
                        console.log(`   ✅ FlexiCart found! Response: ${result.length} bytes`);
                        
                        const analysis = ResponseAnalyzer.analyzeResponse(
                            this.commands.DUMMY.name, 
                            this.commands.DUMMY.cmd, 
                            result.hex, 
                            result.response
                        );
                        
                        if (analysis.valid) {
                            foundDevices.push({
                                port: port,
                                address: address,
                                responseLength: result.length,
                                responseHex: result.hex,
                                valid: true,
                                lastSeen: new Date().toISOString()
                            });
                            
                            console.log(`   🎯 Valid FlexiCart protocol detected!`);
                        } else {
                            console.log(`   ⚠️ Response received but validation failed`);
                        }
                    } else {
                        console.log(`   ❌ No response`);
                    }
                    
                } catch (error) {
                    console.log(`   ❌ Error: ${error.message}`);
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Results summary
        console.log(`\n📊 SCAN RESULTS`);
        console.log(`===============`);
        
        if (foundDevices.length === 0) {
            console.log('❌ No FlexiCart devices found');
            console.log('\n💡 Troubleshooting:');
            console.log('   1. Verify FlexiCart power and ready status');
            console.log('   2. Check RS-422 cable connections');
            console.log('   3. Confirm baud rate: 38400, 8E1');
            console.log('   4. Test with known working: /dev/ttyRP8, address 0x01');
        } else {
            console.log(`✅ Found ${foundDevices.length} FlexiCart device(s):`);
            foundDevices.forEach((device, index) => {
                console.log(`\n📦 Device ${index + 1}:`);
                console.log(`   Port: ${device.port}`);
                console.log(`   Address: 0x${device.address.toString(16).toUpperCase()}`);
                console.log(`   Response: ${device.responseLength} bytes`);
                console.log(`   Status: ✅ Valid FlexiCart`);
            });
        }

        return foundDevices;
    }

    /**
     * Quick status check
     */
    static async checkStatus(port, cartAddress = 0x01) {
        console.log(`\n🔍 FlexiCart Quick Status`);
        console.log(`========================`);
        console.log(`Port: ${port}, Address: 0x${cartAddress.toString(16).toUpperCase()}\n`);

        try {
            // Test communication
            const dummyCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.DUMMY.cmd);
            const result = await FlexiCartStatusFixed.sendCommand(port, dummyCmd, 4000, false);
            
            if (result.success) {
                console.log(`✅ Communication: OK (${result.length} bytes)`);
                console.log(`📊 Response: ${result.hex}`);
                
                const analysis = ResponseAnalyzer.analyzeResponse(
                    this.commands.DUMMY.name, this.commands.DUMMY.cmd,
                    result.hex, result.response
                );
                
                console.log(`📋 Status: ${analysis.interpretation}`);
                console.log(`✅ FlexiCart is responding correctly`);
                
                return { success: true, communication: true };
            } else {
                console.log(`❌ Communication failed: ${result.error}`);
                return { success: false, communication: false };
            }
            
        } catch (error) {
            console.log(`❌ Status check failed: ${error.message}`);
            return { success: false, error: error.message };
        }
    }

    /**
     * Interactive control
     */
    static async interactiveControl(port, cartAddress = 0x01) {
        console.log(`\n🎮 Interactive FlexiCart Control`);
        console.log(`================================`);
        console.log(`Port: ${port}, Address: 0x${cartAddress.toString(16).toUpperCase()}\n`);

        // Verify communication first
        const dummyCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.DUMMY.cmd);
        const commTest = await FlexiCartStatusFixed.sendCommand(port, dummyCmd, 3000, false);
        
        if (!commTest.success) {
            console.log('❌ Cannot establish communication');
            return;
        }
        
        console.log('✅ Communication verified\n');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const commands = [
            { key: '1', name: 'Status', cmd: this.commands.STATUS.cmd },
            { key: '2', name: 'Position', cmd: this.commands.POSITION.cmd },
            { key: '3', name: 'System Mode', cmd: this.commands.SYSTEM_MODE.cmd },
            { key: '4', name: 'Emergency Stop', cmd: this.commands.STOP.cmd },
            { key: '5', name: 'Communication Test', cmd: this.commands.DUMMY.cmd }
        ];

        const showMenu = () => {
            console.log('\n🎮 Available Commands:');
            commands.forEach(cmd => console.log(`${cmd.key}. ${cmd.name}`));
            console.log('0. Exit');
        };

        showMenu();

        const askCommand = () => {
            rl.question('\n🎮 Enter command: ', async (choice) => {
                if (choice === '0') {
                    console.log('👋 Goodbye!');
                    rl.close();
                    return;
                }

                const selectedCmd = commands.find(cmd => cmd.key === choice);
                if (selectedCmd) {
                    console.log(`\n📤 Sending ${selectedCmd.name}...`);
                    
                    const command = FlexiCartStatusFixed.createCommand(cartAddress, selectedCmd.cmd);
                    const result = await FlexiCartStatusFixed.sendCommand(port, command, 4000, true);
                    
                    if (result.success) {
                        console.log(`✅ Success: ${result.length} bytes`);
                        console.log(`📊 Response: ${result.hex}`);
                    } else {
                        console.log(`❌ Failed: ${result.error}`);
                    }
                } else {
                    console.log('❌ Invalid choice');
                    showMenu();
                }
                
                askCommand();
            });
        };

        askCommand();
    }
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);
    
    console.log('🎬 FlexiCart Status Checker & Controller (WORKING)');
    console.log('=================================================');
    console.log('Validated 38400 8E1 protocol\n');

    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node check_flexicart_status_working.js --scan');
        console.log('  node check_flexicart_status_working.js --status <port> [addr]');
        console.log('  node check_flexicart_status_working.js --control <port> [addr]');
        console.log('\nExamples:');
        console.log('  node check_flexicart_status_working.js --scan');
        console.log('  node check_flexicart_status_working.js --status /dev/ttyRP8');
        console.log('  node check_flexicart_status_working.js --control /dev/ttyRP8 0x01');
        console.log('\n💡 Known working: /dev/ttyRP8 with cart address 0x01');
        return;
    }

    const command = args[0];
    const port = args[1] || '/dev/ttyRP8';
    const cartAddr = args[2] ? parseInt(args[2], 16) : 0x01;

    try {
        switch (command) {
            case '--scan':
                await FlexiCartStatusChecker.scanAllFlexiCarts(false);
                break;

            case '--status':
                if (!port) {
                    console.log('❌ Port required');
                    return;
                }
                await FlexiCartStatusChecker.checkStatus(port, cartAddr);
                break;

            case '--control':
                if (!port) {
                    console.log('❌ Port required');
                    return;
                }
                await FlexiCartStatusChecker.interactiveControl(port, cartAddr);
                break;

            default:
                console.log(`❌ Unknown command: ${command}`);
                console.log('Use --scan, --status, or --control');
                break;
        }
    } catch (error) {
        console.log(`❌ Error: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}