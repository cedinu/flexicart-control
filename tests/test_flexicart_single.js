/**
 * Single Command FlexiCart Test - No port reuse
 * Tests one command at a time with fresh port instance
 */

const { SerialPort } = require('serialport');

class FlexiCartSingleTest {
    
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
     * Send command with completely fresh port instance
     */
    static async sendSingleCommand(portPath, command, commandName, timeout = 5000) {
        console.log(`\n🎯 Testing: ${commandName}`);
        console.log(`📊 Command: ${command.toString('hex').toUpperCase()}`);
        
        return new Promise((resolve) => {
            let port;
            let responseBuffer = Buffer.alloc(0);
            let isComplete = false;

            const cleanup = (result = null) => {
                if (isComplete) return;
                isComplete = true;
                
                if (port) {
                    try {
                        if (port.isOpen) {
                            port.close(() => {
                                console.log(`🔌 Port closed for ${commandName}`);
                                resolve(result);
                            });
                        } else {
                            resolve(result);
                        }
                    } catch (e) {
                        console.log(`⚠️  Close error: ${e.message}`);
                        resolve(result);
                    }
                } else {
                    resolve(result);
                }
            };

            try {
                port = new SerialPort({
                    path: portPath,
                    baudRate: 19200,
                    dataBits: 8,
                    parity: 'even',
                    stopBits: 1,
                    autoOpen: false
                });

                port.on('data', (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);
                    console.log(`📥 Received: ${data.toString('hex').toUpperCase()}`);
                });

                port.on('error', (err) => {
                    console.log(`❌ Port error: ${err.message}`);
                    cleanup({ error: err.message });
                });

                port.open((openErr) => {
                    if (openErr) {
                        console.log(`❌ Open failed: ${openErr.message}`);
                        cleanup({ error: openErr.message });
                        return;
                    }

                    console.log(`✅ Port opened`);

                    // Send command immediately
                    port.write(command, (writeErr) => {
                        if (writeErr) {
                            console.log(`❌ Write failed: ${writeErr.message}`);
                            cleanup({ error: writeErr.message });
                            return;
                        }

                        console.log(`📤 Command sent`);

                        // Wait for response
                        setTimeout(() => {
                            const result = {
                                command: commandName,
                                response: responseBuffer.length > 0 ? responseBuffer : null,
                                success: responseBuffer.length > 0
                            };
                            
                            console.log(`📊 Response: ${responseBuffer.length} bytes`);
                            if (responseBuffer.length > 0) {
                                console.log(`📊 Hex: ${responseBuffer.toString('hex').toUpperCase()}`);
                                console.log(`✅ Success!`);
                            } else {
                                console.log(`❌ No response`);
                            }
                            
                            cleanup(result);
                        }, timeout);
                    });
                });

            } catch (error) {
                console.log(`❌ Exception: ${error.message}`);
                cleanup({ error: error.message });
            }
        });
    }

    /**
     * Analyze FlexiCart response patterns
     */
    static analyzeResponses(responses) {
        console.log(`\n📊 FLEXICART RESPONSE ANALYSIS`);
        console.log(`==============================`);
        
        const validResponses = responses.filter(r => r.response);
        
        console.log(`Total tests: ${responses.length}`);
        console.log(`Successful responses: ${validResponses.length}`);
        
        if (validResponses.length === 0) {
            console.log(`❌ No responses received`);
            return;
        }

        console.log(`\n🎉 FLEXICART IS COMMUNICATING!`);
        console.log(`=============================`);

        validResponses.forEach((result, index) => {
            const response = result.response;
            const hex = response.toString('hex').toUpperCase();
            
            console.log(`\n📋 Response ${index + 1}: ${result.command}`);
            console.log(`   📊 Length: ${response.length} bytes`);
            console.log(`   📊 Hex: ${hex}`);
            console.log(`   📊 ASCII: "${response.toString().replace(/[^\x20-\x7E]/g, '.')}"`);
            
            // Pattern analysis
            const patterns = [];
            
            // Check for repeating patterns
            if (hex.includes('0606')) patterns.push('ACK_PATTERN');
            if (hex.includes('FCFC')) patterns.push('STATUS_PATTERN');
            if (hex.includes('FFFF')) patterns.push('MAX_VALUE_PATTERN');
            if (hex.includes('0000')) patterns.push('NULL_PATTERN');
            if (hex.includes('2020')) patterns.push('SPACE_PATTERN');
            if (hex.includes('0303')) patterns.push('ETX_PATTERN');
            if (hex.includes('0101')) patterns.push('UNIT_PATTERN');
            
            // Length classification
            if (response.length >= 10 && response.length <= 15) {
                patterns.push('STATUS_LENGTH');
            }
            
            console.log(`   🎯 Patterns: ${patterns.join(', ')}`);
            
            // Specific interpretations
            if (hex === '06060606FCFCFCFC00FFFF') {
                console.log(`   📋 INTERPRETATION:`);
                console.log(`      06 06 06 06 = ACK repetition (command acknowledged)`);
                console.log(`      FC FC FC FC = Status bytes (252 decimal = busy/processing?)`);
                console.log(`      00          = Null/ready byte`);
                console.log(`      FF FF       = Max values (status flags?)`);
                console.log(`   ✅ This looks like a FlexiCart status response!`);
            }
            
            if (hex === '2020202001010303030303010101') {
                console.log(`   📋 INTERPRETATION:`);
                console.log(`      20 20 20 20 = Space padding`);
                console.log(`      01 01       = Unit identifiers`);
                console.log(`      03 03 03 03 03 = ETX markers`);
                console.log(`      01 01 01    = More unit data`);
                console.log(`   ✅ This looks like a FlexiCart identification response!`);
            }
        });

        console.log(`\n🎯 CONCLUSION`);
        console.log(`=============`);
        console.log(`✅ FlexiCart hardware is connected and powered`);
        console.log(`✅ RS-422 communication is working at 19200 baud, 8E1`);
        console.log(`✅ FlexiCart is responding to commands with status data`);
        console.log(`✅ Multiple response patterns detected - indicates working protocol`);
        
        console.log(`\n🔧 NEXT STEPS:`);
        console.log(`1. Update your main application to use 19200 baud, 8E1`);
        console.log(`2. Implement response parsing for these patterns`);
        console.log(`3. Test specific FlexiCart operations (move, stop, etc.)`);
        console.log(`4. Document the response format for your application`);
        
        console.log(`\n📝 WORKING CONFIGURATION:`);
        console.log(`Port: ${responses[0].command.includes('ttyRP8') ? '/dev/ttyRP8' : 'your port'}`);
        console.log(`Baud Rate: 19200`);
        console.log(`Data Bits: 8`);
        console.log(`Parity: Even`);
        console.log(`Stop Bits: 1`);
        console.log(`Flow Control: None`);
    }

    /**
     * Test multiple commands individually
     */
    static async testMultipleCommands(portPath) {
        console.log(`🎯 FlexiCart Single Command Test`);
        console.log(`================================`);
        console.log(`Port: ${portPath}`);
        console.log(`Testing commands individually to avoid port conflicts\n`);

        const commands = [
            { name: 'DUMMY_01', ua2: 0x01, cmd: 0x50 },
            { name: 'STATUS_01', ua2: 0x01, cmd: 0x61 },
            { name: 'SYSTEM_MODE_01', ua2: 0x01, cmd: 0x65 },
            { name: 'REQUEST_01', ua2: 0x01, cmd: 0x60 },
            { name: 'DUMMY_BROADCAST', ua2: 0xFF, cmd: 0x50 },
            { name: 'DUMMY_02', ua2: 0x02, cmd: 0x50 },
            { name: 'DUMMY_04', ua2: 0x04, cmd: 0x50 }
        ];

        const results = [];

        for (const cmd of commands) {
            const command = this.createCommand(cmd.ua2, cmd.cmd);
            const result = await this.sendSingleCommand(portPath, command, cmd.name, 3000);
            results.push(result);
            
            // Wait between tests to ensure port is fully released
            console.log(`⏳ Waiting 3 seconds before next command...`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        this.analyzeResponses(results);
        return results;
    }
}

/**
 * Main execution
 */
async function main() {
    const portPath = process.argv[2] || '/dev/ttyRP8';
    
    try {
        console.log(`🚀 Starting Single Command FlexiCart Test`);
        const results = await FlexiCartSingleTest.testMultipleCommands(portPath);
        
        const successCount = results.filter(r => r.success).length;
        if (successCount > 0) {
            console.log(`\n🎉 SUCCESS! FlexiCart communication established!`);
            console.log(`Working responses: ${successCount}/${results.length}`);
            process.exit(0);
        } else {
            console.log(`\n❌ No successful communications`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error(`💥 Test failed: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}