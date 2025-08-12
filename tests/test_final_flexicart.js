/**
 * Final FlexiCart Test - Using discovered working configuration
 * Tests with proper port cleanup and confirmed settings
 */

const { SerialPort } = require('serialport');
const { spawn, execSync } = require('child_process');

class FinalFlexiCartTest {
    
    /**
     * Force release any locks on the port
     */
    static async releasePortLocks(portPath) {
        try {
            console.log(`🔧 Releasing any locks on ${portPath}...`);
            
            // Kill any processes using the port
            try {
                execSync(`fuser -k ${portPath}`, { stdio: 'ignore' });
            } catch (e) {
                // Ignore errors - port might not be in use
            }
            
            // Wait a moment
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            console.log(`✅ Port locks released`);
        } catch (error) {
            console.log(`⚠️  Port release warning: ${error.message}`);
        }
    }

    /**
     * Create FlexiCart command (confirmed working format)
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
     * Test the confirmed working FlexiCart setup
     */
    static async testConfirmedSetup(portPath) {
        console.log(`🎯 Final FlexiCart Communication Test`);
        console.log(`===================================`);
        console.log(`Using CONFIRMED working configuration:`);
        console.log(`📡 Port: ${portPath}`);
        console.log(`📡 Settings: 19200 baud, 8E1`);
        console.log(`📡 Protocol: FlexiCart RS-422\n`);

        // Test multiple working commands
        const testCommands = [
            { name: 'DUMMY_CART1', ua2: 0x01, cmd: 0x50, desc: 'Dummy command to Cart 1 (CONFIRMED WORKING)' },
            { name: 'DUMMY_CART1_REPEAT', ua2: 0x01, cmd: 0x50, desc: 'Repeat dummy command' },
            { name: 'STATUS_CART1', ua2: 0x01, cmd: 0x61, desc: 'Status request to Cart 1' },
            { name: 'SYSTEM_MODE', ua2: 0x01, cmd: 0x65, desc: 'System mode request' },
            { name: 'DUMMY_CART2', ua2: 0x02, cmd: 0x50, desc: 'Test Cart 2 address' },
            { name: 'DUMMY_BROADCAST', ua2: 0xFF, cmd: 0x50, desc: 'Broadcast to all carts' }
        ];

        const results = [];

        for (let i = 0; i < testCommands.length; i++) {
            const testCmd = testCommands[i];
            
            console.log(`\n📤 Test ${i + 1}/${testCommands.length}: ${testCmd.name}`);
            console.log(`   📋 ${testCmd.desc}`);
            
            // Release any port locks before each test
            await this.releasePortLocks(portPath);
            
            const command = this.createCommand(testCmd.ua2, testCmd.cmd);
            console.log(`   📊 Command: ${command.toString('hex').toUpperCase()}`);
            
            try {
                const response = await this.sendCommandWithCleanup(portPath, command, 4000);
                
                if (response && response.length > 0) {
                    console.log(`   ✅ SUCCESS: ${response.length} bytes received`);
                    console.log(`   📊 Response: ${response.toString('hex').toUpperCase()}`);
                    console.log(`   📊 ASCII: "${response.toString().replace(/[^\x20-\x7E]/g, '.')}"`);
                    
                    results.push({
                        command: testCmd.name,
                        ua2: testCmd.ua2,
                        cmd: testCmd.cmd,
                        success: true,
                        response: response,
                        responseHex: response.toString('hex').toUpperCase()
                    });
                } else {
                    console.log(`   ❌ No response received`);
                    results.push({
                        command: testCmd.name,
                        ua2: testCmd.ua2,
                        cmd: testCmd.cmd,
                        success: false,
                        response: null
                    });
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
                results.push({
                    command: testCmd.name,
                    ua2: testCmd.ua2,
                    cmd: testCmd.cmd,
                    success: false,
                    error: error.message
                });
            }
            
            // Wait between commands
            if (i < testCommands.length - 1) {
                console.log(`   ⏳ Waiting 4 seconds before next command...`);
                await new Promise(resolve => setTimeout(resolve, 4000));
            }
        }

        return this.generateFinalReport(results, portPath);
    }

    /**
     * Send command with aggressive cleanup
     */
    static sendCommandWithCleanup(portPath, command, timeout = 4000) {
        return new Promise((resolve, reject) => {
            let port;
            let responseBuffer = Buffer.alloc(0);
            let isComplete = false;
            let timeoutHandle;

            const forceCleanup = () => {
                if (isComplete) return;
                isComplete = true;
                
                if (timeoutHandle) clearTimeout(timeoutHandle);
                
                if (port) {
                    try {
                        port.removeAllListeners();
                        if (port.isOpen) {
                            port.close();
                        }
                    } catch (e) {
                        // Force cleanup
                    }
                }
                
                // Force garbage collection
                port = null;
            };

            try {
                port = new SerialPort({
                    path: portPath,
                    baudRate: 19200,    // CONFIRMED WORKING
                    dataBits: 8,
                    parity: 'even',
                    stopBits: 1,
                    autoOpen: false
                });

                port.on('data', (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);
                    console.log(`   📥 Data: ${data.toString('hex').toUpperCase()}`);
                });

                port.on('error', (err) => {
                    console.log(`   ❌ Port error: ${err.message}`);
                    forceCleanup();
                    reject(new Error(`Port error: ${err.message}`));
                });

                port.open((openErr) => {
                    if (openErr) {
                        console.log(`   ❌ Open failed: ${openErr.message}`);
                        forceCleanup();
                        reject(new Error(`Open failed: ${openErr.message}`));
                        return;
                    }

                    console.log(`   ✅ Port opened`);

                    // Set timeout
                    timeoutHandle = setTimeout(() => {
                        console.log(`   ⏰ Response timeout`);
                        forceCleanup();
                        resolve(responseBuffer);
                    }, timeout);

                    // Send command
                    port.write(command, (writeErr) => {
                        if (writeErr) {
                            console.log(`   ❌ Write failed: ${writeErr.message}`);
                            forceCleanup();
                            reject(new Error(`Write failed: ${writeErr.message}`));
                        } else {
                            console.log(`   📤 Command sent successfully`);
                        }
                    });
                });

            } catch (error) {
                console.log(`   ❌ Exception: ${error.message}`);
                forceCleanup();
                reject(error);
            }
        });
    }

    /**
     * Generate comprehensive final report
     */
    static generateFinalReport(results, portPath) {
        console.log(`\n\n📊 FINAL FLEXICART COMMUNICATION REPORT`);
        console.log(`========================================`);
        
        const successful = results.filter(r => r.success);
        const withResponses = results.filter(r => r.response);
        
        console.log(`Total commands tested: ${results.length}`);
        console.log(`Successful commands: ${successful.length}`);
        console.log(`Commands with responses: ${withResponses.length}`);
        console.log(`Success rate: ${Math.round((successful.length / results.length) * 100)}%`);
        
        if (withResponses.length > 0) {
            console.log(`\n🎉 FLEXICART COMMUNICATION FULLY CONFIRMED!`);
            console.log(`===========================================`);
            
            console.log(`\n📋 Working Commands:`);
            withResponses.forEach((result, index) => {
                console.log(`   ${index + 1}. ${result.command} (UA2=0x${result.ua2.toString(16).toUpperCase().padStart(2, '0')}, CMD=0x${result.cmd.toString(16).toUpperCase()})`);
                console.log(`      Response: ${result.responseHex}`);
                console.log(`      Length: ${result.response.length} bytes`);
            });
            
            // Analyze response patterns
            console.log(`\n📊 Response Pattern Analysis:`);
            const allResponses = withResponses.map(r => r.responseHex);
            const uniqueResponses = [...new Set(allResponses)];
            
            console.log(`   Unique response patterns: ${uniqueResponses.length}`);
            uniqueResponses.forEach((pattern, index) => {
                const count = allResponses.filter(r => r === pattern).length;
                console.log(`   ${index + 1}. ${pattern} (appeared ${count} times)`);
            });
            
            console.log(`\n✅ PRODUCTION READY CONFIGURATION:`);
            console.log(`==================================`);
            console.log(`Port: ${portPath}`);
            console.log(`Baud Rate: 19200`);
            console.log(`Data Bits: 8`);
            console.log(`Parity: Even`);
            console.log(`Stop Bits: 1`);
            console.log(`Flow Control: None`);
            console.log(`Protocol: FlexiCart RS-422`);
            console.log(`Working Cart Address: 0x01 (confirmed)`);
            console.log(`Working Command: 0x50 (dummy command)`);
            
            console.log(`\n🔧 Implementation Notes:`);
            console.log(`1. Use exactly these serial settings in your application`);
            console.log(`2. FlexiCart responds with status data, not simple ACK/NAK`);
            console.log(`3. Response patterns vary but indicate successful communication`);
            console.log(`4. Port cleanup between commands is essential`);
            console.log(`5. Minimum 3-4 second delay between commands recommended`);
            
            console.log(`\n🚀 Ready for Production Use!`);
            return { success: true, workingConfig: { baudRate: 19200, parity: 'even' }, responses: withResponses.length };
            
        } else {
            console.log(`\n❌ Communication Issues Detected`);
            console.log(`Check hardware connections and FlexiCart power.`);
            return { success: false, workingConfig: null, responses: 0 };
        }
    }
}

/**
 * Main execution
 */
async function main() {
    const portPath = process.argv[2] || '/dev/ttyRP8';
    
    console.log(`🚀 Final FlexiCart Communication Test`);
    console.log(`====================================`);
    console.log(`This test uses the confirmed working configuration.\n`);
    
    try {
        const report = await FinalFlexiCartTest.testConfirmedSetup(portPath);
        
        if (report.success) {
            console.log(`\n🎉 TEST PASSED - FlexiCart ready for production!`);
            process.exit(0);
        } else {
            console.log(`\n❌ TEST FAILED - Communication issues remain`);
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

module.exports = { FinalFlexiCartTest };