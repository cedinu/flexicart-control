/**
 * FlexiCart Serial Diagnostic Tool
 * Comprehensive testing of serial configurations and basic connectivity
 */

const { SerialPort } = require('serialport');

class FlexiCartSerialDiagnostic {
    
    /**
     * Test configurations - covering common industrial serial settings
     */
    static TEST_CONFIGS = [
        // Standard FlexiCart configurations
        { baudRate: 38400, dataBits: 8, parity: 'even', stopBits: 1, name: 'FlexiCart Standard' },
        { baudRate: 9600, dataBits: 8, parity: 'even', stopBits: 1, name: 'FlexiCart Alt 9600' },
        
        // Common industrial configurations
        { baudRate: 19200, dataBits: 8, parity: 'even', stopBits: 1, name: 'Industrial 19200' },
        { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, name: 'Standard 9600 8N1' },
        { baudRate: 38400, dataBits: 8, parity: 'none', stopBits: 1, name: 'High Speed 8N1' },
        { baudRate: 4800, dataBits: 8, parity: 'even', stopBits: 1, name: 'Slow Industrial' },
        { baudRate: 57600, dataBits: 8, parity: 'none', stopBits: 1, name: 'High Speed Alt' },
        
        // Sony specific alternatives
        { baudRate: 9600, dataBits: 7, parity: 'even', stopBits: 1, name: 'Sony 7E1' },
        { baudRate: 38400, dataBits: 7, parity: 'even', stopBits: 1, name: 'Sony Alt 7E1' },
        { baudRate: 9600, dataBits: 8, parity: 'odd', stopBits: 1, name: 'Sony 8O1' }
    ];

    /**
     * Test commands - from basic to complex
     */
    static TEST_COMMANDS = [
        // Basic connectivity tests
        { name: 'NULL_BYTE', data: Buffer.from([0x00]), desc: 'Single null byte' },
        { name: 'SIMPLE_STX', data: Buffer.from([0x02]), desc: 'Just STX marker' },
        { name: 'CR_LF', data: Buffer.from([0x0D, 0x0A]), desc: 'Carriage return + line feed' },
        
        // Simple protocol tests
        { name: 'MINIMAL_FRAME', data: Buffer.from([0x02, 0x04, 0x01, 0x01, 0x00, 0x50, 0x00, 0x80, 0x28]), desc: 'Minimal FlexiCart frame' },
        { name: 'DUMMY_CMD', data: Buffer.from([0x02, 0x06, 0x01, 0x01, 0x00, 0x50, 0x00, 0x80, 0x28]), desc: 'FlexiCart Dummy command' },
        
        // ASCII test patterns
        { name: 'ASCII_HELLO', data: Buffer.from('HELLO\r\n'), desc: 'ASCII hello with CRLF' },
        { name: 'ASCII_AT', data: Buffer.from('AT\r'), desc: 'AT command style' },
        
        // Binary patterns
        { name: 'PATTERN_55', data: Buffer.from([0x55, 0x55, 0x55, 0x55]), desc: 'Alternating bit pattern' },
        { name: 'PATTERN_AA', data: Buffer.from([0xAA, 0xAA, 0xAA, 0xAA]), desc: 'Inverse bit pattern' }
    ];

    /**
     * Test serial port with specific configuration
     */
    static async testSerialConfig(portPath, config, commands) {
        return new Promise((resolve) => {
            console.log(`\n🔧 Testing: ${config.name}`);
            console.log(`   📡 Settings: ${config.baudRate} baud, ${config.dataBits}${config.parity[0].toUpperCase()}${config.stopBits}`);
            
            const results = {
                config: config,
                portOpened: false,
                responses: [],
                totalBytesReceived: 0,
                errors: []
            };

            let port;
            
            try {
                port = new SerialPort({
                    path: portPath,
                    baudRate: config.baudRate,
                    dataBits: config.dataBits,
                    parity: config.parity,
                    stopBits: config.stopBits,
                    flowControl: false,
                    autoOpen: false
                });

                // Set up error handler
                port.on('error', (err) => {
                    console.log(`   ❌ Port error: ${err.message}`);
                    results.errors.push(`Port error: ${err.message}`);
                });

                // Try to open port
                port.open((err) => {
                    if (err) {
                        console.log(`   ❌ Failed to open: ${err.message}`);
                        results.errors.push(`Open failed: ${err.message}`);
                        resolve(results);
                        return;
                    }

                    console.log(`   ✅ Port opened successfully`);
                    results.portOpened = true;

                    let commandIndex = 0;
                    let testTimeout;

                    // Data handler
                    port.on('data', (data) => {
                        results.totalBytesReceived += data.length;
                        const response = {
                            command: commandIndex > 0 ? commands[commandIndex - 1].name : 'INITIAL',
                            length: data.length,
                            hex: data.toString('hex').toUpperCase(),
                            ascii: data.toString('ascii').replace(/[^\x20-\x7E]/g, '.'),
                            timestamp: Date.now()
                        };
                        results.responses.push(response);
                        
                        console.log(`   📥 RX[${response.command}]: ${data.length}B ${response.hex}`);
                        if (response.ascii.trim()) {
                            console.log(`   📝 ASCII: "${response.ascii}"`);
                        }
                    });

                    // Function to send next command
                    function sendNextCommand() {
                        if (commandIndex >= commands.length) {
                            // All commands sent, wait a bit then close
                            setTimeout(() => {
                                port.close(() => {
                                    console.log(`   📊 Test complete: ${results.totalBytesReceived} total bytes received`);
                                    resolve(results);
                                });
                            }, 1000);
                            return;
                        }

                        const cmd = commands[commandIndex];
                        console.log(`   📤 TX[${cmd.name}]: ${cmd.data.toString('hex').toUpperCase()} (${cmd.desc})`);
                        
                        port.write(cmd.data, (err) => {
                            if (err) {
                                console.log(`   ❌ Write error: ${err.message}`);
                                results.errors.push(`Write error: ${err.message}`);
                            }
                            commandIndex++;
                            
                            // Wait before sending next command
                            setTimeout(sendNextCommand, 500);
                        });
                    }

                    // Start sending commands after brief delay
                    setTimeout(sendNextCommand, 500);

                    // Overall timeout
                    testTimeout = setTimeout(() => {
                        console.log(`   ⏰ Test timeout reached`);
                        port.close(() => {
                            resolve(results);
                        });
                    }, 15000);
                });

            } catch (error) {
                console.log(`   ❌ Exception: ${error.message}`);
                results.errors.push(`Exception: ${error.message}`);
                resolve(results);
            }
        });
    }

    /**
     * Check basic port accessibility - modified to handle custom devices
     */
    static async checkPortAccess(portPath) {
        console.log(`🔍 Checking port accessibility: ${portPath}`);
        
        try {
            // Check if port exists in filesystem
            const fs = require('fs');
            if (!fs.existsSync(portPath)) {
                console.log(`❌ Port ${portPath} does not exist in filesystem`);
                return false;
            }
            
            console.log(`✅ Port ${portPath} exists in filesystem`);
            
            // List available ports (for reference)
            const ports = await SerialPort.list();
            console.log(`📋 Available serial ports (${ports.length} found):`);
            
            let targetPortFound = false;
            ports.forEach(port => {
                const isTarget = port.path === portPath;
                if (isTarget) targetPortFound = true;
                
                console.log(`   ${isTarget ? '🎯' : '📍'} ${port.path}${port.manufacturer ? ` (${port.manufacturer})` : ''}${port.serialNumber ? ` SN:${port.serialNumber}` : ''}`);
            });

            if (!targetPortFound) {
                console.log(`⚠️  Target port ${portPath} not found in system enumeration`);
                console.log(`   This is common for custom device drivers (like ttyRP*)`);
                console.log(`   Will attempt direct connection...`);
            } else {
                console.log(`✅ Target port ${portPath} found in system enumeration`);
            }

            // Test direct port access
            console.log(`🔧 Testing direct port access...`);
            
            return new Promise((resolve) => {
                const testPort = new SerialPort({
                    path: portPath,
                    baudRate: 9600,
                    dataBits: 8,
                    parity: 'none',
                    stopBits: 1,
                    autoOpen: false
                });

                testPort.open((err) => {
                    if (err) {
                        console.log(`❌ Direct access failed: ${err.message}`);
                        resolve(false);
                    } else {
                        console.log(`✅ Direct access successful!`);
                        testPort.close(() => {
                            resolve(true);
                        });
                    }
                });

                // Timeout for the test
                setTimeout(() => {
                    console.log(`⏰ Direct access test timeout`);
                    resolve(false);
                }, 3000);
            });

        } catch (error) {
            console.log(`❌ Port access check failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Test if anything is connected and responding
     */
    static async testBasicConnectivity(portPath) {
        console.log(`\n🔌 Basic Connectivity Test`);
        console.log(`==========================`);
        
        const basicConfig = { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, name: 'Basic 9600 8N1' };
        const basicCommands = [
            { name: 'PING', data: Buffer.from([0x55]), desc: 'Simple ping byte' },
            { name: 'PATTERN', data: Buffer.from([0xAA, 0x55, 0xAA, 0x55]), desc: 'Bit pattern' }
        ];

        return await this.testSerialConfig(portPath, basicConfig, basicCommands);
    }

    /**
     * Main diagnostic routine
     */
    static async runDiagnostic(portPath) {
        console.log(`🔬 FlexiCart Serial Diagnostic Tool`);
        console.log(`===================================`);
        console.log(`Port: ${portPath}`);
        console.log(`Time: ${new Date().toISOString()}\n`);

        // Step 1: Check port access
        const portAccessible = await this.checkPortAccess(portPath);
        if (!portAccessible) {
            console.log(`\n❌ CRITICAL: Cannot access port ${portPath}`);
            console.log(`   Check that:`);
            console.log(`   1. Device is connected`);
            console.log(`   2. Correct port path`);
            console.log(`   3. Port permissions (try: sudo chmod 666 ${portPath})`);
            console.log(`   4. No other applications using the port`);
            return { success: false, reason: 'Port not accessible' };
        }

        // Step 2: Basic connectivity test
        console.log(`\n🔌 Running basic connectivity test...`);
        const connectivityResult = await this.testBasicConnectivity(portPath);
        
        if (connectivityResult.totalBytesReceived > 0) {
            console.log(`✅ DEVICE RESPONDING! Received ${connectivityResult.totalBytesReceived} bytes`);
            console.log(`   This confirms something is connected and communicating`);
        } else {
            console.log(`⚠️  No response to basic connectivity test`);
        }

        // Step 3: Test all configurations
        console.log(`\n📡 Testing Serial Configurations`);
        console.log(`=================================`);
        
        const allResults = [];
        
        for (const config of this.TEST_CONFIGS) {
            const result = await this.testSerialConfig(portPath, config, this.TEST_COMMANDS);
            allResults.push(result);
            
            // Brief pause between tests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Analysis
        console.log(`\n📊 DIAGNOSTIC RESULTS ANALYSIS`);
        console.log(`===============================`);
        
        const workingConfigs = allResults.filter(r => r.portOpened && r.totalBytesReceived > 0);
        const responsiveConfigs = allResults.filter(r => r.totalBytesReceived > 0);
        
        console.log(`Configurations tested: ${allResults.length}`);
        console.log(`Ports opened successfully: ${allResults.filter(r => r.portOpened).length}`);
        console.log(`Configurations with responses: ${responsiveConfigs.length}`);
        console.log(`Total responses received: ${allResults.reduce((sum, r) => sum + r.responses.length, 0)}`);
        console.log(`Total bytes received: ${allResults.reduce((sum, r) => sum + r.totalBytesReceived, 0)}`);

        if (responsiveConfigs.length > 0) {
            console.log(`\n✅ COMMUNICATION DETECTED!`);
            console.log(`==========================`);
            
            responsiveConfigs.forEach(config => {
                console.log(`\n🎯 ${config.config.name}:`);
                console.log(`   📡 ${config.config.baudRate} baud, ${config.config.dataBits}${config.config.parity[0].toUpperCase()}${config.config.stopBits}`);
                console.log(`   📊 ${config.totalBytesReceived} bytes received in ${config.responses.length} responses`);
                
                // Show sample responses
                config.responses.slice(0, 3).forEach((resp, idx) => {
                    console.log(`   📥 [${resp.command}]: ${resp.hex}${resp.ascii.trim() ? ` ("${resp.ascii}")` : ''}`);
                });
                
                if (config.responses.length > 3) {
                    console.log(`   📥 ... and ${config.responses.length - 3} more responses`);
                }
            });

            // Recommendations
            const bestConfig = responsiveConfigs.reduce((best, current) => 
                current.totalBytesReceived > best.totalBytesReceived ? current : best
            );

            console.log(`\n🎯 RECOMMENDED CONFIGURATION:`);
            console.log(`============================`);
            console.log(`Configuration: ${bestConfig.config.name}`);
            console.log(`Settings: ${bestConfig.config.baudRate} baud, ${bestConfig.config.dataBits}${bestConfig.config.parity[0].toUpperCase()}${bestConfig.config.stopBits}`);
            console.log(`Response rate: ${bestConfig.totalBytesReceived} bytes`);

            console.log(`\n🔧 Update your flexicart_serial_utils.js with:`);
            console.log(`baudRate: ${bestConfig.config.baudRate},`);
            console.log(`dataBits: ${bestConfig.config.dataBits},`);
            console.log(`parity: '${bestConfig.config.parity}',`);
            console.log(`stopBits: ${bestConfig.config.stopBits}`);

            return { 
                success: true, 
                bestConfig: bestConfig.config,
                responsiveConfigs: responsiveConfigs.map(r => r.config)
            };

        } else {
            console.log(`\n❌ NO COMMUNICATION DETECTED`);
            console.log(`=============================`);
            console.log(`No responses received with any serial configuration.`);
            
            const openErrors = allResults.filter(r => !r.portOpened);
            if (openErrors.length > 0) {
                console.log(`\n🔧 Port Opening Issues:`);
                openErrors.forEach(result => {
                    console.log(`   ❌ ${result.config.name}: ${result.errors.join(', ')}`);
                });
            }

            console.log(`\n🔧 HARDWARE TROUBLESHOOTING:`);
            console.log(`1. ✅ Verify FlexiCart power LED is ON`);
            console.log(`2. ✅ Check RS-422 cable connections:`);
            console.log(`   - TX+ and TX- (from computer to FlexiCart RX)`);
            console.log(`   - RX+ and RX- (from FlexiCart TX to computer)`);
            console.log(`   - Ground connection`);
            console.log(`3. ✅ Verify FlexiCart is in communication mode`);
            console.log(`4. ✅ Check for RS-422 to USB converter settings`);
            console.log(`5. ✅ Try different USB port or RS-422 adapter`);
            console.log(`6. ✅ Test with known working FlexiCart unit`);

            return { success: false, reason: 'No communication detected' };
        }
    }
}

/**
 * Main execution
 */
async function main() {
    const portPath = process.argv[2] || '/dev/ttyRP8';
    
    try {
        const result = await FlexiCartSerialDiagnostic.runDiagnostic(portPath);
        
        if (result.success) {
            console.log(`\n🎉 DIAGNOSTIC PASSED - Communication detected!`);
            process.exit(0);
        } else {
            console.log(`\n❌ DIAGNOSTIC FAILED - ${result.reason}`);
            process.exit(1);
        }
    } catch (error) {








main();// Execute main function}    }        process.exit(1);        console.log(`\n❌ Unexpected error during diagnostics: ${error.message}`);    } catch (error) {
        console.error(`💥 Diagnostic crashed: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { FlexiCartSerialDiagnostic };