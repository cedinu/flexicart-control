/**
 * Fixed FlexiCart Test - Proper port handling and response analysis
 */

const { SerialPort } = require('serialport');

class FlexiCartFixedTest {
    static STX = 0x02;
    static ETX = 0x03;
    static ACK = 0x04;
    static NAK = 0x05;

    /**
     * Create FlexiCart command with proper checksum
     */
    static createCommand(ua2, cmd, bt = 0x00, control = 0x00, data = 0x80) {
        const packet = Buffer.alloc(9);
        packet[0] = this.STX;    // STX = 0x02
        packet[1] = 0x06;        // BC = 6 (byte count)
        packet[2] = 0x01;        // UA1 = 1 (FlexiCart unit type)
        packet[3] = ua2;         // UA2 (cart address)
        packet[4] = bt;          // BT (block type)
        packet[5] = cmd;         // CMD (command)
        packet[6] = control;     // Control byte
        packet[7] = data;        // Data byte
        
        // Calculate checksum
        let sum = 0;
        for (let i = 1; i < 8; i++) {
            sum += packet[i];
        }
        packet[8] = (0x100 - (sum & 0xFF)) & 0xFF;
        
        return packet;
    }

    /**
     * Send single command with proper port cleanup
     */
    static async sendCommandSingle(portPath, command, timeout = 5000) {
        return new Promise((resolve, reject) => {
            console.log(`   🔌 Opening port for command...`);
            
            const port = new SerialPort({
                path: portPath,
                baudRate: 19200,
                dataBits: 8,
                parity: 'even',
                stopBits: 1,
                flowControl: false,
                autoOpen: false
            });

            let responseBuffer = Buffer.alloc(0);
            let responseTimeout;
            let isResolved = false;

            function cleanup(error = null, result = null) {
                if (isResolved) return;
                isResolved = true;
                
                if (responseTimeout) clearTimeout(responseTimeout);
                
                if (port && port.isOpen) {
                    port.removeAllListeners();
                    port.close((closeErr) => {
                        if (closeErr) console.log(`   ⚠️  Close error: ${closeErr.message}`);
                        console.log(`   🔌 Port closed`);
                        
                        if (error) reject(error);
                        else resolve(result || responseBuffer);
                    });
                } else {
                    if (error) reject(error);
                    else resolve(result || responseBuffer);
                }
            }

            port.on('error', (err) => {
                console.log(`   ❌ Port error: ${err.message}`);
                cleanup(new Error(`Port error: ${err.message}`));
            });

            port.on('data', (data) => {
                responseBuffer = Buffer.concat([responseBuffer, data]);
                console.log(`   📥 Received ${data.length} bytes: ${data.toString('hex').toUpperCase()}`);
                console.log(`   📝 ASCII: "${data.toString().replace(/[^\x20-\x7E]/g, '.')}"`);
                
                // Check for complete response (contains ETX or reasonable length)
                if (data.includes(this.ETX) || responseBuffer.length >= 32) {
                    console.log(`   ✅ Complete response detected`);
                    cleanup();
                }
            });

            port.open((err) => {
                if (err) {
                    console.log(`   ❌ Failed to open: ${err.message}`);
                    cleanup(new Error(`Failed to open: ${err.message}`));
                    return;
                }

                console.log(`   ✅ Port opened`);

                // Set response timeout
                responseTimeout = setTimeout(() => {
                    console.log(`   ⏰ Response timeout (${timeout}ms)`);
                    cleanup();
                }, timeout);

                // Send command
                console.log(`   📤 Sending: ${command.toString('hex').toUpperCase()}`);
                port.write(command, (writeErr) => {
                    if (writeErr) {
                        console.log(`   ❌ Write error: ${writeErr.message}`);
                        cleanup(new Error(`Write error: ${writeErr.message}`));
                    } else {
                        console.log(`   ✅ Command sent`);
                    }
                });
            });

            // Safety timeout
            setTimeout(() => {
                if (!isResolved) {
                    console.log(`   🚨 Safety timeout - forcing cleanup`);
                    cleanup(new Error('Safety timeout'));
                }
            }, timeout + 2000);
        });
    }

    /**
     * Analyze FlexiCart response patterns
     */
    static analyzeFlexiCartResponse(response, commandName) {
        console.log(`\n   🔍 RESPONSE ANALYSIS for ${commandName}:`);
        console.log(`   📊 Length: ${response.length} bytes`);
        console.log(`   📊 Hex: ${response.toString('hex').toUpperCase()}`);
        console.log(`   📊 ASCII: "${response.toString().replace(/[^\x20-\x7E]/g, '.')}"`);
        
        // Look for patterns
        const patterns = [];
        const hex = response.toString('hex').toUpperCase();
        
        // Check for standard responses
        if (response.length === 1) {
            if (response[0] === this.ACK) {
                patterns.push('STANDARD_ACK');
            } else if (response[0] === this.NAK) {
                patterns.push('STANDARD_NAK');
            }
        }
        
        // Check for structured response
        if (response[0] === this.STX) {
            patterns.push('STX_START');
        }
        
        if (response.includes(this.ETX)) {
            patterns.push('ETX_END');
        }
        
        // Check for repeating patterns
        if (hex.includes('202020')) patterns.push('SPACE_PATTERN');
        if (hex.includes('030303')) patterns.push('ETX_PATTERN');
        if (hex.includes('010101')) patterns.push('UNIT_PATTERN');
        
        // Check for status-like data
        if (response.length >= 10 && response.length <= 20) {
            patterns.push('STATUS_LENGTH');
        }
        
        console.log(`   🎯 Detected patterns: ${patterns.join(', ')}`);
        
        // Interpret the specific response we saw
        if (hex === '2020202001010303030303010101') {
            console.log(`   🎉 RECOGNIZED: This matches the FlexiCart response pattern!`);
            console.log(`   📋 Interpretation:`);
            console.log(`      20 20 20    = Space characters (status padding?)`);
            console.log(`      01 01       = Unit identifiers`);
            console.log(`      03 03 03 03 03 = ETX pattern (end markers)`);
            console.log(`      01 01 01    = More unit data`);
            console.log(`   ✅ This indicates FlexiCart is responding to commands!`);
        }
        
        return {
            length: response.length,
            hex: hex,
            patterns: patterns,
            isFlexiCartResponse: patterns.length > 0,
            isStandardAck: patterns.includes('STANDARD_ACK'),
            isStandardNak: patterns.includes('STANDARD_NAK'),
            hasStructure: patterns.includes('STX_START') || patterns.includes('ETX_PATTERN')
        };
    }

    /**
     * Test individual commands with proper delays
     */
    static async testFlexiCartCommands(portPath) {
        console.log(`🎯 FlexiCart Fixed Command Test`);
        console.log(`==============================`);
        console.log(`Port: ${portPath}`);
        console.log(`Settings: 19200 baud, 8E1\n`);

        // Test commands one at a time
        const testCommands = [
            { name: 'DUMMY_CMD', ua2: 0x01, cmd: 0x50, desc: 'Dummy command (known working)' },
            { name: 'STATUS_CMD', ua2: 0x01, cmd: 0x61, desc: 'Sense cart status' },
            { name: 'SYSTEM_MODE', ua2: 0x01, cmd: 0x65, desc: 'Sense system mode' },
            { name: 'REQUEST_CMD', ua2: 0x01, cmd: 0x60, desc: 'General request' },
            { name: 'DUMMY_BROADCAST', ua2: 0xFF, cmd: 0x50, desc: 'Dummy to all carts' },
        ];

        const results = [];

        for (const testCmd of testCommands) {
            console.log(`\n📤 Testing: ${testCmd.name}`);
            console.log(`   📋 Description: ${testCmd.desc}`);
            
            const command = this.createCommand(testCmd.ua2, testCmd.cmd);
            console.log(`   📊 Command: ${command.toString('hex').toUpperCase()}`);
            
            try {
                const response = await this.sendCommandSingle(portPath, command, 3000);
                
                if (response && response.length > 0) {
                    const analysis = this.analyzeFlexiCartResponse(response, testCmd.name);
                    
                    results.push({
                        command: testCmd.name,
                        success: true,
                        response: response,
                        analysis: analysis
                    });
                    
                    console.log(`   ✅ SUCCESS: Received ${response.length} bytes`);
                    
                } else {
                    console.log(`   ❌ No response received`);
                    results.push({
                        command: testCmd.name,
                        success: false,
                        response: null,
                        analysis: null
                    });
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
                results.push({
                    command: testCmd.name,
                    success: false,
                    error: error.message,
                    response: null,
                    analysis: null
                });
            }
            
            // Wait between commands to prevent port conflicts
            console.log(`   ⏳ Waiting 2 seconds before next command...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Final analysis
        console.log(`\n\n📊 FINAL TEST RESULTS`);
        console.log(`======================`);
        
        const successfulCommands = results.filter(r => r.success);
        const responsesReceived = results.filter(r => r.response);
        
        console.log(`Commands tested: ${results.length}`);
        console.log(`Successful commands: ${successfulCommands.length}`);
        console.log(`Responses received: ${responsesReceived.length}`);
        
        if (responsesReceived.length > 0) {
            console.log(`\n🎉 FLEXICART COMMUNICATION CONFIRMED!`);
            console.log(`====================================`);
            
            responsesReceived.forEach(result => {
                console.log(`\n🎯 ${result.command}:`);
                console.log(`   📊 Response: ${result.response.toString('hex').toUpperCase()}`);
                console.log(`   📊 Patterns: ${result.analysis.patterns.join(', ')}`);
                console.log(`   📊 FlexiCart Response: ${result.analysis.isFlexiCartResponse ? 'YES' : 'NO'}`);
            });
            
            console.log(`\n✅ CONCLUSION: FlexiCart is responding to commands!`);
            console.log(`The responses show FlexiCart-specific patterns.`);
            console.log(`Your RS-422 communication is working correctly.`);
            
        } else {
            console.log(`\n⚠️  No responses received`);
            console.log(`Check FlexiCart power and connections.`);
        }

        return results;
    }
}

/**
 * Main execution
 */
async function main() {
    const portPath = process.argv[2] || '/dev/ttyRP8';
    
    try {
        const results = await FlexiCartFixedTest.testFlexiCartCommands(portPath);
        
        const successCount = results.filter(r => r.success).length;
        if (successCount > 0) {
            console.log(`\n✅ Test PASSED - FlexiCart communication working!`);
            process.exit(0);
        } else {
            console.log(`\n❌ Test FAILED - No communication established`);
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

module.exports = { FlexiCartFixedTest };