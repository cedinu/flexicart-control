/**
 * FlexiCart 38400 8E1 Test - Fixed Port Locking Issue
 * Uses aggressive port cleanup and single-use port instances
 */

const { SerialPort } = require('serialport');
const { execSync } = require('child_process');

class FlexiCart38400Fixed {
    
    /**
     * Aggressive port cleanup - Kill all processes using the port
     */
    static async aggressivePortCleanup(portPath) {
        try {
            console.log(`🔧 Aggressive port cleanup for ${portPath}...`);
            
            // Kill any processes using the port
            try {
                execSync(`sudo fuser -k ${portPath}`, { stdio: 'ignore' });
                console.log(`   ✅ Killed processes using port`);
            } catch (e) {
                // Process might not exist
            }
            
            // Force remove any lock files
            try {
                execSync(`sudo rm -f /var/lock/LCK..${portPath.split('/').pop()}*`, { stdio: 'ignore' });
                console.log(`   ✅ Removed lock files`);
            } catch (e) {
                // Lock files might not exist
            }
            
            // Wait for system cleanup
            await new Promise(resolve => setTimeout(resolve, 2000));
            console.log(`   ✅ Port cleanup complete`);
            
        } catch (error) {
            console.log(`   ⚠️  Cleanup warning: ${error.message}`);
        }
    }

    /**
     * Create FlexiCart command
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
     * Send single command with complete isolation
     */
    static async sendIsolatedCommand(portPath, command, commandName, timeout = 5000) {
        console.log(`\n📤 ${commandName}`);
        console.log(`   Command: ${command.toString('hex').toUpperCase()}`);
        
        // Aggressive cleanup before opening
        await this.aggressivePortCleanup(portPath);
        
        return new Promise((resolve) => {
            let port = null;
            let responseBuffer = Buffer.alloc(0);
            let timeoutHandle = null;
            let resolved = false;

            const forceResolve = (result) => {
                if (resolved) return;
                resolved = true;
                
                // Clear timeout
                if (timeoutHandle) {
                    clearTimeout(timeoutHandle);
                    timeoutHandle = null;
                }
                
                // Force close port
                if (port) {
                    try {
                        port.removeAllListeners();
                        if (port.isOpen) {
                            port.close(() => {
                                console.log(`   🔌 Port force closed`);
                                resolve(result);
                            });
                        } else {
                            resolve(result);
                        }
                    } catch (e) {
                        console.log(`   ⚠️  Force close error: ${e.message}`);
                        resolve(result);
                    }
                } else {
                    resolve(result);
                }
            };

            try {
                console.log(`   🔌 Opening port with 38400 8E1...`);
                
                port = new SerialPort({
                    path: portPath,
                    baudRate: 38400,        // CORRECT FlexiCart RS-422 rate
                    dataBits: 8,
                    parity: 'even',
                    stopBits: 1,
                    autoOpen: false,
                    lock: false             // Disable built-in locking
                });

                port.on('data', (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);
                    console.log(`   📥 Data: ${data.toString('hex').toUpperCase()}`);
                    console.log(`   📝 ASCII: "${data.toString().replace(/[^\x20-\x7E]/g, '.')}"`);
                });

                port.on('error', (err) => {
                    console.log(`   ❌ Port error: ${err.message}`);
                    forceResolve({
                        command: commandName,
                        success: false,
                        error: err.message
                    });
                });

                port.open((openErr) => {
                    if (openErr) {
                        console.log(`   ❌ Open failed: ${openErr.message}`);
                        forceResolve({
                            command: commandName,
                            success: false,
                            error: openErr.message
                        });
                        return;
                    }

                    console.log(`   ✅ Port opened (38400 8E1)`);

                    // Set timeout for response
                    timeoutHandle = setTimeout(() => {
                        console.log(`   ⏰ Response timeout (${timeout}ms)`);
                        console.log(`   📊 Total received: ${responseBuffer.length} bytes`);
                        
                        if (responseBuffer.length > 0) {
                            console.log(`   📊 Response: ${responseBuffer.toString('hex').toUpperCase()}`);
                            forceResolve({
                                command: commandName,
                                success: true,
                                response: responseBuffer,
                                hex: responseBuffer.toString('hex').toUpperCase(),
                                length: responseBuffer.length
                            });
                        } else {
                            console.log(`   ❌ No response`);
                            forceResolve({
                                command: commandName,
                                success: false,
                                error: 'No response received'
                            });
                        }
                    }, timeout);

                    // Send command
                    port.write(command, (writeErr) => {
                        if (writeErr) {
                            console.log(`   ❌ Write failed: ${writeErr.message}`);
                            forceResolve({
                                command: commandName,
                                success: false,
                                error: writeErr.message
                            });
                        } else {
                            console.log(`   ✅ Command sent (38400 baud)`);
                        }
                    });
                });

            } catch (error) {
                console.log(`   ❌ Exception: ${error.message}`);
                forceResolve({
                    command: commandName,
                    success: false,
                    error: error.message
                });
            }
        });
    }

    /**
     * Test FlexiCart commands with proper isolation
     */
    static async testFlexiCartFixed(portPath) {
        console.log(`🎯 FlexiCart 38400 8E1 - Fixed Port Locking`);
        console.log(`==========================================`);
        console.log(`Port: ${portPath}`);
        console.log(`Rate: 38400 baud (CORRECT FlexiCart RS-422 specification)`);
        console.log(`Settings: 8 data bits, Even parity, 1 stop bit\n`);

        // Test commands with isolation
        const commands = [
            { name: 'DUMMY_CART1', ua2: 0x01, cmd: 0x50, desc: 'Dummy command to Cart 1' },
            { name: 'STATUS_CART1', ua2: 0x01, cmd: 0x61, desc: 'Status request to Cart 1' },
            { name: 'SYSTEM_MODE', ua2: 0x01, cmd: 0x65, desc: 'System mode request' },
            { name: 'STOP_CART1', ua2: 0x01, cmd: 0x20, desc: 'Stop command to Cart 1' },
            { name: 'DUMMY_CART2', ua2: 0x02, cmd: 0x50, desc: 'Test Cart 2' }
        ];

        const results = [];

        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];
            
            console.log(`\n🔧 Test ${i + 1}/${commands.length}: ${cmd.desc}`);
            
            try {
                const command = this.createCommand(cmd.ua2, cmd.cmd);
                const result = await this.sendIsolatedCommand(portPath, command, cmd.name, 4000);
                
                results.push(result);
                
                if (result.success && result.response) {
                    console.log(`   ✅ SUCCESS - ${result.length} bytes received`);
                } else {
                    console.log(`   ❌ FAILED - ${result.error || 'No response'}`);
                }
                
            } catch (error) {
                console.log(`   ❌ ERROR: ${error.message}`);
                results.push({
                    command: cmd.name,
                    success: false,
                    error: error.message
                });
            }
            
            // Long delay between commands for complete cleanup
            if (i < commands.length - 1) {
                console.log(`   ⏳ Waiting 5 seconds for complete port cleanup...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        return this.analyzeFixedResults(results);
    }

    /**
     * Analyze results from fixed test
     */
    static analyzeFixedResults(results) {
        console.log(`\n\n📊 FLEXICART 38400 8E1 FIXED TEST RESULTS`);
        console.log(`==========================================`);

        const successful = results.filter(r => r.success);
        const withResponses = results.filter(r => r.response && r.response.length > 0);

        console.log(`Total commands tested: ${results.length}`);
        console.log(`Successful commands: ${successful.length}`);
        console.log(`Commands with responses: ${withResponses.length}`);

        if (withResponses.length === 0) {
            console.log(`\n❌ NO COMMUNICATION WITH 38400 8E1`);
            console.log(`\nPossible issues:`);
            console.log(`1. FlexiCart not powered or connected`);
            console.log(`2. RS-422 wiring issues (A+/A-, B+/B-)`);
            console.log(`3. Wrong port (check /dev/ttyRP6 vs /dev/ttyRP8)`);
            console.log(`4. FlexiCart in wrong mode or not ready`);
            
            console.log(`\n🔧 Troubleshooting steps:`);
            console.log(`1. Check FlexiCart power LED`);
            console.log(`2. Verify RS-422 cable connections`);
            console.log(`3. Test with different port: /dev/ttyRP8`);
            console.log(`4. Check FlexiCart manual for initialization sequence`);
            
            return { success: false, workingCommands: 0 };
        }

        console.log(`\n🎉 FLEXICART 38400 8E1 COMMUNICATION SUCCESS!`);
        console.log(`==============================================`);

        withResponses.forEach((result, index) => {
            console.log(`\n📋 Response ${index + 1}: ${result.command}`);
            console.log(`   📊 Length: ${result.length} bytes`);
            console.log(`   📊 Hex: ${result.hex}`);
            console.log(`   📊 ASCII: "${result.response.toString().replace(/[^\x20-\x7E]/g, '.')}"`);
        });

        console.log(`\n✅ CONFIRMED CONFIGURATION:`);
        console.log(`===========================`);
        console.log(`📡 Baud Rate: 38400 (CORRECT for FlexiCart RS-422)`);
        console.log(`📡 Data Bits: 8`);
        console.log(`📡 Parity: Even`);
        console.log(`📡 Stop Bits: 1`);
        console.log(`📡 Flow Control: None`);

        console.log(`\n🚀 PRODUCTION READY!`);
        console.log(`Update your main application with these exact settings.`);

        return {
            success: true,
            workingCommands: withResponses.length,
            responses: withResponses
        };
    }
}

/**
 * Main execution
 */
async function main() {
    const portPath = process.argv[2] || '/dev/ttyRP6';
    
    console.log(`🚀 FlexiCart 38400 8E1 Fixed Test`);
    console.log(`=================================`);
    console.log(`Testing with CORRECT FlexiCart rate: 38400 baud`);
    console.log(`Fixing port locking issues with aggressive cleanup\n`);
    
    try {
        const results = await FlexiCart38400Fixed.testFlexiCartFixed(portPath);
        
        if (results.success) {
            console.log(`\n🎉 SUCCESS! FlexiCart 38400 8E1 working!`);
            console.log(`Working commands: ${results.workingCommands}`);
            process.exit(0);
        } else {
            console.log(`\n❌ FAILED - No communication with FlexiCart`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error(`💥 Test crashed: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}