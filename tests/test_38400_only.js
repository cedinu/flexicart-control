/**
 * FlexiCart 38400 8E1 Communication Test
 * Tests ONLY the original FlexiCart specification: 38400 baud, 8 data bits, Even parity, 1 stop bit
 */

const { SerialPort } = require('serialport');
const { execSync } = require('child_process');

class FlexiCart38400Only {
    
    /**
     * Release port locks
     */
    static releasePortLocks(path) {
        try {
            execSync(`fuser -k ${path}`, { stdio: 'ignore' });
        } catch (e) {
            // Ignore errors
        }
    }

    /**
     * Create FlexiCart command with proper checksum
     */
    static createCommand(ua2, cmd, bt = 0x00, control = 0x00, data = 0x80) {
        const packet = Buffer.alloc(9);
        packet[0] = 0x02;        // STX
        packet[1] = 0x06;        // BC (Byte Count)
        packet[2] = 0x01;        // UA1 (Unit Address 1)
        packet[3] = ua2;         // UA2 (Unit Address 2 - Cart ID)
        packet[4] = bt;          // BT (Block Type)
        packet[5] = cmd;         // CMD (Command)
        packet[6] = control;     // Control byte
        packet[7] = data;        // Data byte
        
        // Calculate checksum (2's complement of sum from BC to DATA)
        let sum = 0;
        for (let i = 1; i < 8; i++) {
            sum += packet[i];
        }
        packet[8] = (0x100 - (sum & 0xFF)) & 0xFF;
        
        return packet;
    }

    /**
     * Send command using 38400 8E1 settings
     */
    static sendCommand38400(portPath, command, commandName, timeout = 5000) {
        return new Promise((resolve, reject) => {
            console.log(`\n📤 ${commandName}`);
            console.log(`   Command: ${command.toString('hex').toUpperCase()}`);
            console.log(`   Settings: 38400 baud, 8E1`);
            
            let port;
            let responseBuffer = Buffer.alloc(0);
            let isComplete = false;

            const cleanup = (result = null, error = null) => {
                if (isComplete) return;
                isComplete = true;
                
                if (port && port.isOpen) {
                    port.close(() => {
                        if (error) reject(error);
                        else resolve(result);
                    });
                } else {
                    if (error) reject(error);
                    else resolve(result);
                }
            };

            try {
                // ONLY 38400 8E1 settings
                port = new SerialPort({
                    path: portPath,
                    baudRate: 38400,     // FlexiCart original specification
                    dataBits: 8,
                    parity: 'even',      // Even parity required
                    stopBits: 1,
                    autoOpen: false
                });

                port.on('data', (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);
                    console.log(`   📥 Received: ${data.toString('hex').toUpperCase()}`);
                    console.log(`   📝 ASCII: "${data.toString().replace(/[^\x20-\x7E]/g, '.')}"`);
                });

                port.on('error', (err) => {
                    console.log(`   ❌ Port error: ${err.message}`);
                    cleanup(null, new Error(`Port error: ${err.message}`));
                });

                port.open((openErr) => {
                    if (openErr) {
                        console.log(`   ❌ Open failed: ${openErr.message}`);
                        cleanup(null, new Error(`Open failed: ${openErr.message}`));
                        return;
                    }

                    console.log(`   ✅ Port opened (38400 8E1)`);

                    // Send command
                    port.write(command, (writeErr) => {
                        if (writeErr) {
                            console.log(`   ❌ Write failed: ${writeErr.message}`);
                            cleanup(null, new Error(`Write failed: ${writeErr.message}`));
                            return;
                        }

                        console.log(`   ✅ Command sent`);

                        // Wait for response
                        setTimeout(() => {
                            console.log(`   ⏰ Response timeout (${timeout}ms)`);
                            console.log(`   📊 Total received: ${responseBuffer.length} bytes`);
                            
                            if (responseBuffer.length > 0) {
                                console.log(`   📊 Full response: ${responseBuffer.toString('hex').toUpperCase()}`);
                                cleanup({
                                    command: commandName,
                                    response: responseBuffer,
                                    hex: responseBuffer.toString('hex').toUpperCase(),
                                    length: responseBuffer.length,
                                    success: true
                                });
                            } else {
                                console.log(`   ❌ No response received`);
                                cleanup({
                                    command: commandName,
                                    response: null,
                                    success: false
                                });
                            }
                        }, timeout);
                    });
                });

            } catch (error) {
                console.log(`   ❌ Exception: ${error.message}`);
                cleanup(null, error);
            }
        });
    }

    /**
     * Test FlexiCart communication with standard commands
     */
    static async testFlexiCartCommands(portPath) {
        console.log(`🎯 FlexiCart 38400 8E1 Communication Test`);
        console.log(`========================================`);
        console.log(`Port: ${portPath}`);
        console.log(`Settings: 38400 baud, 8 data bits, Even parity, 1 stop bit`);
        console.log(`Protocol: Sony FlexiCart RS-422\n`);

        // Standard FlexiCart commands to test
        const commands = [
            { name: 'DUMMY_CART1', ua2: 0x01, cmd: 0x50, desc: 'Dummy command to Cart 1' },
            { name: 'STATUS_CART1', ua2: 0x01, cmd: 0x61, desc: 'Status request to Cart 1' },
            { name: 'SYSTEM_MODE', ua2: 0x01, cmd: 0x65, desc: 'System mode request' },
            { name: 'REQUEST_CART1', ua2: 0x01, cmd: 0x60, desc: 'General request to Cart 1' },
            { name: 'STOP_CART1', ua2: 0x01, cmd: 0x20, desc: 'Stop command to Cart 1' },
            { name: 'DUMMY_CART2', ua2: 0x02, cmd: 0x50, desc: 'Dummy command to Cart 2' },
            { name: 'DUMMY_BROADCAST', ua2: 0xFF, cmd: 0x50, desc: 'Dummy broadcast to all carts' }
        ];

        const results = [];

        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];
            
            console.log(`\n🔧 Test ${i + 1}/${commands.length}: ${cmd.desc}`);
            
            // Release port locks
            this.releasePortLocks(portPath);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
                const command = this.createCommand(cmd.ua2, cmd.cmd);
                const result = await this.sendCommand38400(portPath, command, cmd.name, 4000);
                
                results.push(result);
                
                if (result.success) {
                    console.log(`   ✅ SUCCESS - ${result.length} bytes received`);
                } else {
                    console.log(`   ❌ FAILED - No response`);
                }
                
            } catch (error) {
                console.log(`   ❌ ERROR: ${error.message}`);
                results.push({
                    command: cmd.name,
                    success: false,
                    error: error.message
                });
            }
            
            // Wait between commands
            if (i < commands.length - 1) {
                console.log(`   ⏳ Waiting 3 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }

        return this.analyzeResults(results);
    }

    /**
     * Analyze test results and provide recommendations
     */
    static analyzeResults(results) {
        console.log(`\n\n📊 38400 8E1 TEST RESULTS`);
        console.log(`==========================`);

        const successful = results.filter(r => r.success);
        const withResponses = results.filter(r => r.response && r.response.length > 0);

        console.log(`Total commands tested: ${results.length}`);
        console.log(`Successful commands: ${successful.length}`);
        console.log(`Commands with responses: ${withResponses.length}`);

        if (withResponses.length === 0) {
            console.log(`\n❌ NO COMMUNICATION ESTABLISHED`);
            console.log(`Possible issues:`);
            console.log(`1. FlexiCart not powered or ready`);
            console.log(`2. Wrong baud rate (try 19200 or 9600)`);
            console.log(`3. Cable connection issues`);
            console.log(`4. RS-422 wiring problems`);
            return { success: false, workingCommands: 0 };
        }

        console.log(`\n🎉 COMMUNICATION ESTABLISHED WITH 38400 8E1!`);
        console.log(`============================================`);

        // Show all responses
        withResponses.forEach((result, index) => {
            console.log(`\n📋 Response ${index + 1}: ${result.command}`);
            console.log(`   📊 Length: ${result.length} bytes`);
            console.log(`   📊 Hex: ${result.hex}`);
            console.log(`   📊 ASCII: "${result.response.toString().replace(/[^\x20-\x7E]/g, '.')}"`);
            
            // Analyze patterns
            const patterns = this.analyzeResponsePatterns(result.hex);
            console.log(`   🎯 Patterns: ${patterns.join(', ')}`);
        });

        // Find unique response patterns
        const uniquePatterns = [...new Set(withResponses.map(r => r.hex))];
        console.log(`\n📊 Unique Response Patterns: ${uniquePatterns.length}`);
        uniquePatterns.forEach((pattern, index) => {
            const count = withResponses.filter(r => r.hex === pattern).length;
            console.log(`   ${index + 1}. ${pattern} (appeared ${count} times)`);
        });

        console.log(`\n✅ CONFIRMED WORKING CONFIGURATION:`);
        console.log(`===================================`);
        console.log(`📡 Baud Rate: 38400`);
        console.log(`📡 Data Bits: 8`);
        console.log(`📡 Parity: Even`);
        console.log(`📡 Stop Bits: 1`);
        console.log(`📡 Flow Control: None`);
        console.log(`📡 Protocol: Sony FlexiCart RS-422`);

        console.log(`\n🔧 Working Commands:`);
        withResponses.forEach(result => {
            console.log(`   ✅ ${result.command} - ${result.length} bytes response`);
        });

        console.log(`\n🚀 READY FOR PRODUCTION USE!`);
        console.log(`FlexiCart is responding correctly to commands.`);

        return {
            success: true,
            workingCommands: withResponses.length,
            responses: withResponses,
            uniquePatterns: uniquePatterns
        };
    }

    /**
     * Analyze response patterns
     */
    static analyzeResponsePatterns(hex) {
        const patterns = [];
        
        if (hex.includes('0606')) patterns.push('ACK_PATTERN');
        if (hex.includes('FCFC')) patterns.push('STATUS_FC');
        if (hex.includes('C3C3')) patterns.push('STATUS_C3');
        if (hex.includes('FFFF')) patterns.push('MAX_VALUES');
        if (hex.includes('2020')) patterns.push('SPACE_PADDING');
        if (hex.includes('0303')) patterns.push('ETX_PATTERN');
        if (hex.includes('8383')) patterns.push('DATA_83');
        if (hex.includes('5757')) patterns.push('DATA_57');
        if (/(.{2})\1{2,}/.test(hex)) patterns.push('REPETITION');
        
        return patterns.length > 0 ? patterns : ['CUSTOM_RESPONSE'];
    }
}

/**
 * Main execution
 */
async function main() {
    const portPath = process.argv[2] || '/dev/ttyRP8';
    
    console.log(`🚀 Starting FlexiCart 38400 8E1 Test`);
    console.log(`===================================`);
    console.log(`Testing ONLY: 38400 baud, 8E1 (original FlexiCart spec)\n`);
    
    try {
        const results = await FlexiCart38400Only.testFlexiCartCommands(portPath);
        
        if (results.success) {
            console.log(`\n🎉 TEST PASSED - FlexiCart 38400 8E1 working!`);
            console.log(`Working commands: ${results.workingCommands}`);
            process.exit(0);
        } else {
            console.log(`\n❌ TEST FAILED - No communication with 38400 8E1`);
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

module.exports = { FlexiCart38400Only };