const { SerialPort } = require('serialport');
const readline = require('readline');

// Import the working FlexiCart functions
const { FlexiCartStatusFixed } = require('./check_flexicart_status_fixed');
const { FlexiCartResponseAnalyzer } = require('./flexicart_response_analyzer');

/**
 * Enhanced FlexiCart Status Checker
 * Uses proven working commands from your successful tests
 */
class FlexiCartStatusChecker {
    
    // Working configuration from your tests
    static config = {
        baudRate: 38400,
        dataBits: 8,
        parity: 'even',
        stopBits: 1,
        workingPort: '/dev/ttyRP8',
        workingCartAddress: 0x01
    };

    // Validated command set from your working tests
    static commands = {
        DUMMY: { cmd: 0x50, name: 'Dummy Command', desc: 'Communication test' },
        STATUS: { cmd: 0x61, name: 'Status Request', desc: 'Get cart status' },
        SYSTEM_MODE: { cmd: 0x65, name: 'System Mode', desc: 'Get system parameters' },
        POSITION: { cmd: 0x60, name: 'Position Request', desc: 'Get current position' },
        STOP: { cmd: 0x20, name: 'Stop Command', desc: 'Emergency stop' }
    };

    /**
     * Comprehensive FlexiCart scan across all ports
     */
    static async scanAllFlexiCarts(debug = false) {
        console.log('🎬 FlexiCart System Scanner');
        console.log('==========================');
        console.log('Scanning for FlexiCart devices using validated protocol\n');

        const testPorts = [
            '/dev/ttyRP8',   // Known working port
            '/dev/ttyRP6', 
            '/dev/ttyRP0', '/dev/ttyRP1', '/dev/ttyRP2', '/dev/ttyRP3', 
            '/dev/ttyRP4', '/dev/ttyRP5', '/dev/ttyRP7', '/dev/ttyRP9',
            '/dev/ttyUSB0', '/dev/ttyUSB1'
        ];

        const cartAddresses = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80];
        const foundDevices = [];

        for (const port of testPorts) {
            console.log(`\n📦 Testing port: ${port}`);
            
            for (const address of cartAddresses) {
                console.log(`   🎯 Cart address: 0x${address.toString(16).toUpperCase()}`);
                
                try {
                    // Use dummy command first (fastest test)
                    const command = FlexiCartStatusFixed.createCommand(address, this.commands.DUMMY.cmd);
                    const result = await FlexiCartStatusFixed.sendCommand(port, command, 3000, debug);
                    
                    if (result.success && result.length > 0) {
                        console.log(`   ✅ FlexiCart found! Response: ${result.length} bytes`);
                        
                        // Analyze the response using your working analyzer
                        const analysis = FlexiCartResponseAnalyzer.analyzeResponse(
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
                                analysis: analysis,
                                lastSeen: new Date().toISOString()
                            });
                            
                            console.log(`   🎯 Valid FlexiCart protocol detected!`);
                        } else {
                            console.log(`   ⚠️ Response received but protocol validation failed`);
                        }
                    } else {
                        console.log(`   ❌ No response`);
                    }
                    
                } catch (error) {
                    console.log(`   ❌ Error: ${error.message}`);
                }
                
                // Delay between tests
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Summary
        console.log(`\n📊 SCAN RESULTS`);
        console.log(`===============`);
        
        if (foundDevices.length === 0) {
            console.log('❌ No FlexiCart devices found');
            console.log('\n💡 Troubleshooting:');
            console.log('   1. Verify FlexiCart power and ready status');
            console.log('   2. Check RS-422 cable connections');
            console.log('   3. Confirm baud rate: 38400, 8E1');
            console.log('   4. Test with known working port: /dev/ttyRP8');
        } else {
            console.log(`✅ Found ${foundDevices.length} FlexiCart device(s):`);
            foundDevices.forEach((device, index) => {
                console.log(`\n📦 Device ${index + 1}:`);
                console.log(`   Port: ${device.port}`);
                console.log(`   Address: 0x${device.address.toString(16).toUpperCase()}`);
                console.log(`   Response: ${device.responseLength} bytes`);
                console.log(`   Protocol: ${device.analysis.interpretation}`);
                console.log(`   Status: ${device.analysis.valid ? '✅ Valid' : '⚠️ Needs verification'}`);
            });
        }

        return foundDevices;
    }

    /**
     * Comprehensive status check for a specific FlexiCart
     */
    static async checkFlexiCartStatus(port, cartAddress = 0x01, debug = false) {
        console.log(`\n🔍 FlexiCart Status Check`);
        console.log(`========================`);
        console.log(`Port: ${port}`);
        console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);
        console.log(`Configuration: ${this.config.baudRate} baud, 8E1\n`);

        const statusData = {
            port: port,
            cartAddress: cartAddress,
            communication: false,
            status: {},
            position: {},
            systemMode: {},
            errors: [],
            timestamp: new Date().toISOString()
        };

        try {
            // Test 1: Communication Test (Dummy Command)
            console.log('📡 Step 1: Communication Test');
            console.log('-----------------------------');
            
            const dummyCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.DUMMY.cmd);
            const commResult = await FlexiCartStatusFixed.sendCommand(port, dummyCmd, 4000, debug);
            
            if (commResult.success) {
                console.log(`   ✅ Communication: OK (${commResult.length} bytes)`);
                statusData.communication = true;
                
                const commAnalysis = FlexiCartResponseAnalyzer.analyzeResponse(
                    this.commands.DUMMY.name, this.commands.DUMMY.cmd, 
                    commResult.hex, commResult.response
                );
                statusData.communicationAnalysis = commAnalysis;
            } else {
                console.log(`   ❌ Communication: FAILED - ${commResult.error}`);
                return statusData;
            }

            // Test 2: Status Request
            console.log('\n📊 Step 2: Status Request');
            console.log('--------------------------');
            
            const statusCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.STATUS.cmd);
            const statusResult = await FlexiCartStatusFixed.sendCommand(port, statusCmd, 4000, debug);
            
            if (statusResult.success) {
                console.log(`   ✅ Status: OK (${statusResult.length} bytes)`);
                
                const statusAnalysis = FlexiCartResponseAnalyzer.analyzeResponse(
                    this.commands.STATUS.name, this.commands.STATUS.cmd,
                    statusResult.hex, statusResult.response
                );
                
                statusData.status = {
                    raw: statusResult.hex,
                    length: statusResult.length,
                    analysis: statusAnalysis,
                    interpretation: statusAnalysis.interpretation,
                    valid: statusAnalysis.valid
                };
                
                console.log(`   📋 Status: ${statusAnalysis.interpretation}`);
            } else {
                console.log(`   ❌ Status request failed: ${statusResult.error}`);
                statusData.errors.push(`Status request failed: ${statusResult.error}`);
            }

            // Test 3: Position Request  
            console.log('\n📍 Step 3: Position Request');
            console.log('----------------------------');
            
            const positionCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.POSITION.cmd);
            const positionResult = await FlexiCartStatusFixed.sendCommand(port, positionCmd, 4000, debug);
            
            if (positionResult.success) {
                console.log(`   ✅ Position: OK (${positionResult.length} bytes)`);
                
                const positionAnalysis = FlexiCartResponseAnalyzer.analyzeResponse(
                    this.commands.POSITION.name, this.commands.POSITION.cmd,
                    positionResult.hex, positionResult.response
                );
                
                statusData.position = {
                    raw: positionResult.hex,
                    length: positionResult.length,
                    analysis: positionAnalysis,
                    interpretation: positionAnalysis.interpretation,
                    valid: positionAnalysis.valid
                };
                
                console.log(`   📋 Position: ${positionAnalysis.interpretation}`);
            } else {
                console.log(`   ❌ Position request failed: ${positionResult.error}`);
                statusData.errors.push(`Position request failed: ${positionResult.error}`);
            }

            // Test 4: System Mode
            console.log('\n🔧 Step 4: System Mode Request');
            console.log('-------------------------------');
            
            const systemCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.SYSTEM_MODE.cmd);
            const systemResult = await FlexiCartStatusFixed.sendCommand(port, systemCmd, 4000, debug);
            
            if (systemResult.success) {
                console.log(`   ✅ System Mode: OK (${systemResult.length} bytes)`);
                
                const systemAnalysis = FlexiCartResponseAnalyzer.analyzeResponse(
                    this.commands.SYSTEM_MODE.name, this.commands.SYSTEM_MODE.cmd,
                    systemResult.hex, systemResult.response
                );
                
                statusData.systemMode = {
                    raw: systemResult.hex,
                    length: systemResult.length,
                    analysis: systemAnalysis,
                    interpretation: systemAnalysis.interpretation,
                    valid: systemAnalysis.valid
                };
                
                console.log(`   📋 System: ${systemAnalysis.interpretation}`);
            } else {
                console.log(`   ❌ System mode request failed: ${systemResult.error}`);
                statusData.errors.push(`System mode request failed: ${systemResult.error}`);
            }

            // Summary
            console.log(`\n📋 STATUS SUMMARY`);
            console.log(`=================`);
            console.log(`Communication: ${statusData.communication ? '✅ Working' : '❌ Failed'}`);
            console.log(`Status Data: ${statusData.status.valid ? '✅ Valid' : statusData.status.raw ? '⚠️ Received' : '❌ None'}`);
            console.log(`Position Data: ${statusData.position.valid ? '✅ Valid' : statusData.position.raw ? '⚠️ Received' : '❌ None'}`);
            console.log(`System Data: ${statusData.systemMode.valid ? '✅ Valid' : statusData.systemMode.raw ? '⚠️ Received' : '❌ None'}`);
            
            if (statusData.errors.length > 0) {
                console.log(`Errors: ${statusData.errors.length}`);
                statusData.errors.forEach(error => console.log(`   ❌ ${error}`));
            } else {
                console.log(`Errors: None`);
            }

            return statusData;

        } catch (error) {
            console.log(`❌ Status check failed: ${error.message}`);
            statusData.errors.push(`Status check failed: ${error.message}`);
            return statusData;
        }
    }

    /**
     * Interactive FlexiCart control
     */
    static async interactiveControl(port, cartAddress = 0x01) {
        console.log(`\n🎮 Interactive FlexiCart Control`);
        console.log(`================================`);
        console.log(`Port: ${port}`);
        console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}`);

        // First verify communication
        console.log('\n🔍 Verifying communication...');
        const dummyCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.DUMMY.cmd);
        const commTest = await FlexiCartStatusFixed.sendCommand(port, dummyCmd, 3000, false);
        
        if (!commTest.success) {
            console.log('❌ Cannot establish communication with FlexiCart');
            return;
        }
        
        console.log('✅ Communication established');

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const showMenu = () => {
            console.log('\n🎮 Available Commands:');
            console.log('=====================');
            console.log('1. Check Status');
            console.log('2. Get Position');
            console.log('3. System Mode');
            console.log('4. Emergency Stop');
            console.log('5. Communication Test');
            console.log('6. Full Status Report');
            console.log('0. Exit');
        };

        const getUserInput = () => {
            return new Promise((resolve) => {
                rl.question('\n🎮 Enter command (1-6, 0 to exit): ', (answer) => {
                    resolve(answer.trim());
                });
            });
        };

        showMenu();
        let running = true;

        while (running) {
            const choice = await getUserInput();

            switch (choice) {
                case '1':
                    console.log('\n📊 Checking status...');
                    const statusCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.STATUS.cmd);
                    const statusResult = await FlexiCartStatusFixed.sendCommand(port, statusCmd, 4000, true);
                    if (statusResult.success) {
                        const analysis = FlexiCartResponseAnalyzer.analyzeResponse(
                            this.commands.STATUS.name, this.commands.STATUS.cmd,
                            statusResult.hex, statusResult.response
                        );
                        console.log(`   Status: ${analysis.interpretation}`);
                    } else {
                        console.log(`   ❌ Failed: ${statusResult.error}`);
                    }
                    break;

                case '2':
                    console.log('\n📍 Getting position...');
                    const posCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.POSITION.cmd);
                    const posResult = await FlexiCartStatusFixed.sendCommand(port, posCmd, 4000, true);
                    if (posResult.success) {
                        const analysis = FlexiCartResponseAnalyzer.analyzeResponse(
                            this.commands.POSITION.name, this.commands.POSITION.cmd,
                            posResult.hex, posResult.response
                        );
                        console.log(`   Position: ${analysis.interpretation}`);
                    } else {
                        console.log(`   ❌ Failed: ${posResult.error}`);
                    }
                    break;

                case '3':
                    console.log('\n🔧 Getting system mode...');
                    const sysCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.SYSTEM_MODE.cmd);
                    const sysResult = await FlexiCartStatusFixed.sendCommand(port, sysCmd, 4000, true);
                    if (sysResult.success) {
                        const analysis = FlexiCartResponseAnalyzer.analyzeResponse(
                            this.commands.SYSTEM_MODE.name, this.commands.SYSTEM_MODE.cmd,
                            sysResult.hex, sysResult.response
                        );
                        console.log(`   System: ${analysis.interpretation}`);
                    } else {
                        console.log(`   ❌ Failed: ${sysResult.error}`);
                    }
                    break;

                case '4':
                    console.log('\n🛑 Emergency stop...');
                    const stopCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.STOP.cmd);
                    const stopResult = await FlexiCartStatusFixed.sendCommand(port, stopCmd, 4000, true);
                    if (stopResult.success) {
                        console.log(`   ✅ Stop command sent (${stopResult.length} bytes)`);
                    } else {
                        console.log(`   ❌ Failed: ${stopResult.error}`);
                    }
                    break;

                case '5':
                    console.log('\n📡 Communication test...');
                    const testCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.DUMMY.cmd);
                    const testResult = await FlexiCartStatusFixed.sendCommand(port, testCmd, 4000, true);
                    if (testResult.success) {
                        console.log(`   ✅ Communication OK (${testResult.length} bytes)`);
                    } else {
                        console.log(`   ❌ Failed: ${testResult.error}`);
                    }
                    break;

                case '6':
                    console.log('\n📋 Full status report...');
                    await this.checkFlexiCartStatus(port, cartAddress, false);
                    break;

                case '0':
                    console.log('\n👋 Exiting interactive control...');
                    running = false;
                    break;

                default:
                    console.log('❌ Invalid choice. Please enter 1-6 or 0 to exit.');
                    showMenu();
                    break;
            }
        }

        rl.close();
        console.log('👋 Interactive control session ended');
    }

    /**
     * Test movement detection
     */
    static async testMovementDetection(port, cartAddress = 0x01) {
        console.log(`\n🏃 FlexiCart Movement Detection Test`);
        console.log(`====================================`);
        console.log(`Port: ${port}`);
        console.log(`Cart Address: 0x${cartAddress.toString(16).toUpperCase()}\n`);

        const samples = 5;
        const interval = 2000; // 2 seconds between samples

        console.log(`Taking ${samples} position samples with ${interval/1000}s intervals...`);

        const positionSamples = [];

        for (let i = 0; i < samples; i++) {
            console.log(`\n📍 Sample ${i + 1}/${samples}:`);
            
            const posCmd = FlexiCartStatusFixed.createCommand(cartAddress, this.commands.POSITION.cmd);
            const result = await FlexiCartStatusFixed.sendCommand(port, posCmd, 4000, false);
            
            if (result.success) {
                positionSamples.push({
                    timestamp: new Date().toISOString(),
                    hex: result.hex,
                    length: result.length,
                    sample: i + 1
                });
                
                console.log(`   Response: ${result.hex.substring(0, 20)}${result.hex.length > 20 ? '...' : ''}`);
                console.log(`   Length: ${result.length} bytes`);
            } else {
                console.log(`   ❌ Failed: ${result.error}`);
            }

            if (i < samples - 1) {
                console.log(`   ⏳ Waiting ${interval/1000}s for next sample...`);
                await new Promise(resolve => setTimeout(resolve, interval));
            }
        }

        // Analyze movement
        console.log(`\n📊 MOVEMENT ANALYSIS`);
        console.log(`====================`);

        if (positionSamples.length < 2) {
            console.log('❌ Insufficient data for movement analysis');
            return;
        }

        let movementDetected = false;
        const changes = [];

        for (let i = 1; i < positionSamples.length; i++) {
            const prev = positionSamples[i - 1];
            const curr = positionSamples[i];
            
            if (prev.hex !== curr.hex) {
                movementDetected = true;
                changes.push({
                    from: i,
                    to: i + 1,
                    prevHex: prev.hex,
                    currHex: curr.hex,
                    different: true
                });
                console.log(`🔄 Change detected between sample ${i} and ${i + 1}`);
            } else {
                console.log(`📍 No change between sample ${i} and ${i + 1}`);
            }
        }

        console.log(`\n📋 RESULTS:`);
        console.log(`Movement detected: ${movementDetected ? '✅ YES' : '❌ NO'}`);
        console.log(`Total changes: ${changes.length}`);
        
        if (changes.length > 0) {
            console.log('\n🔄 Position changes:');
            changes.forEach((change, index) => {
                console.log(`   Change ${index + 1}: Sample ${change.from} → ${change.to}`);
                console.log(`     Before: ${change.prevHex.substring(0, 16)}...`);
                console.log(`     After:  ${change.currHex.substring(0, 16)}...`);
            });
        }

        return {
            movementDetected,
            samples: positionSamples,
            changes: changes
        };
    }
}

/**
 * Main execution function
 */
async function main() {
    const args = process.argv.slice(2);
    
    console.log('🎬 FlexiCart Status Checker & Controller');
    console.log('=======================================');
    console.log('Using validated protocol and proven working commands\n');

    if (args.length === 0) {
        console.log('Usage:');
        console.log('  node check_flexicart_status.js --scan                    # Scan all ports');
        console.log('  node check_flexicart_status.js --status <port> [addr]    # Check specific cart');
        console.log('  node check_flexicart_status.js --control <port> [addr]   # Interactive control');
        console.log('  node check_flexicart_status.js --movement <port> [addr]  # Test movement detection');
        console.log('\nExamples:');
        console.log('  node check_flexicart_status.js --scan');
        console.log('  node check_flexicart_status.js --status /dev/ttyRP8');
        console.log('  node check_flexicart_status.js --control /dev/ttyRP8 0x01');
        console.log('  node check_flexicart_status.js --movement /dev/ttyRP8');
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
                    console.log('❌ Port required for status check');
                    return;
                }
                await FlexiCartStatusChecker.checkFlexiCartStatus(port, cartAddr, false);
                break;

            case '--control':
                if (!port) {
                    console.log('❌ Port required for interactive control');
                    return;
                }
                await FlexiCartStatusChecker.interactiveControl(port, cartAddr);
                break;

            case '--movement':
                if (!port) {
                    console.log('❌ Port required for movement detection');
                    return;
                }
                await FlexiCartStatusChecker.testMovementDetection(port, cartAddr);
                break;

            default:
                console.log(`❌ Unknown command: ${command}`);
                console.log('Use --scan, --status, --control, or --movement');
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

module.exports = {
    FlexiCartStatusChecker
};