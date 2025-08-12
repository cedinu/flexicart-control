/**
 * FlexiCart RS-422 Communication Test
 * Using the working 19200 baud configuration discovered
 */

const { SerialPort } = require('serialport');

class FlexiCartRS422Test {
    static STX = 0x02;
    static ACK = 0x04;
    static NAK = 0x05;

    /**
     * Calculate proper FlexiCart checksum
     */
    static calculateChecksum(packet) {
        let sum = 0;
        // Sum from BC (index 1) to DATA (exclude CS position)
        for (let i = 1; i < packet.length - 1; i++) {
            sum += packet[i];
        }
        return (0x100 - (sum & 0xFF)) & 0xFF;
    }

    /**
     * Create FlexiCart command with proper checksum
     */
    static createFlexiCartCommand(ua2, cmd, bt = 0x00, control = 0x00, data = 0x80) {
        const packet = Buffer.alloc(9);
        packet[0] = this.STX;    // STX = 0x02
        packet[1] = 0x06;        // BC = 6 (byte count)
        packet[2] = 0x01;        // UA1 = 1 (FlexiCart unit type)
        packet[3] = ua2;         // UA2 (cart address)
        packet[4] = bt;          // BT (block type)
        packet[5] = cmd;         // CMD (command)
        packet[6] = control;     // Control byte
        packet[7] = data;        // Data byte
        packet[8] = this.calculateChecksum(packet); // CS (checksum)
        
        return packet;
    }

    /**
     * Test FlexiCart communication with working RS-422 settings
     */
    static async testFlexiCartCommunication(portPath) {
        console.log(`🎯 FlexiCart RS-422 Communication Test`);
        console.log(`====================================`);
        console.log(`Port: ${portPath}`);
        console.log(`Settings: 19200 baud, 8E1 (discovered working config)`);
        console.log(`Time: ${new Date().toISOString()}\n`);

        // Test with different cart addresses (UA2)
        const cartAddresses = [
            { ua2: 0x01, name: 'CART1' },
            { ua2: 0x02, name: 'CART2' },
            { ua2: 0x04, name: 'CART3' },
            { ua2: 0x08, name: 'CART4' },
            { ua2: 0xFF, name: 'BROADCAST' }
        ];

        // FlexiCart commands to test
        const testCommands = [
            { cmd: 0x50, name: 'DUMMY_COMMAND', desc: 'Dummy command for communication test' },
            { cmd: 0x61, name: 'SENSE_CART_STATUS', desc: 'Sense cart status' },
            { cmd: 0x65, name: 'SENSE_SYSTEM_MODE', desc: 'Sense system mode' },
            { cmd: 0x60, name: 'REQUEST', desc: 'General request command' }
        ];

        const results = {
            workingAddresses: [],
            ackResponses: [],
            nakResponses: [],
            structuredResponses: []
        };

        for (const cartAddr of cartAddresses) {
            console.log(`\n🎯 Testing ${cartAddr.name} (UA2 = 0x${cartAddr.ua2.toString(16).toUpperCase().padStart(2, '0')})`);
            console.log(`${'='.repeat(60)}`);

            for (const testCmd of testCommands) {
                console.log(`\n📤 ${testCmd.name}: ${testCmd.desc}`);
                
                const command = this.createFlexiCartCommand(cartAddr.ua2, testCmd.cmd);
                console.log(`   📊 Command: ${command.toString('hex').toUpperCase()}`);
                console.log(`   📊 Breakdown: STX=${command[0].toString(16)} BC=${command[1].toString(16)} UA1=${command[2].toString(16)} UA2=${command[3].toString(16)} BT=${command[4].toString(16)} CMD=${command[5].toString(16)} CS=${command[8].toString(16)}`);

                try {
                    const response = await this.sendCommandWithRS422(portPath, command);
                    
                    if (response && response.length > 0) {
                        console.log(`   📥 Response: ${response.length} bytes`);
                        console.log(`   📊 Raw hex: ${response.toString('hex').toUpperCase()}`);
                        
                        const analysis = this.analyzeFlexiCartResponse(response);
                        console.log(`   📊 Analysis: ${analysis.type}`);
                        
                        if (analysis.isAck) {
                            console.log(`   ✅ ACK RECEIVED - FlexiCart acknowledged command!`);
                            results.ackResponses.push({
                                address: cartAddr.name,
                                ua2: cartAddr.ua2,
                                command: testCmd.name,
                                response: response.toString('hex')
                            });
                        } else if (analysis.isNak) {
                            console.log(`   ❌ NAK RECEIVED - Command rejected but communication working!`);
                            results.nakResponses.push({
                                address: cartAddr.name,
                                ua2: cartAddr.ua2,
                                command: testCmd.name,
                                response: response.toString('hex')
                            });
                        } else if (analysis.isStructured) {
                            console.log(`   📊 STRUCTURED RESPONSE - FlexiCart protocol detected!`);
                            results.structuredResponses.push({
                                address: cartAddr.name,
                                ua2: cartAddr.ua2,
                                command: testCmd.name,
                                response: response.toString('hex'),
                                analysis: analysis
                            });
                        } else {
                            console.log(`   📊 RAW RESPONSE - Data received but not standard protocol`);
                        }

                        // Check if this address is working
                        if ((analysis.isAck || analysis.isNak || analysis.isStructured) && 
                            !results.workingAddresses.includes(cartAddr.ua2)) {
                            results.workingAddresses.push(cartAddr.ua2);
                        }

                    } else {
                        console.log(`   ❌ No response received`);
                    }

                } catch (error) {
                    console.log(`   ❌ Error: ${error.message}`);
                }

                // Brief delay between commands
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Delay between cart addresses
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Final results
        console.log(`\n\n📊 FLEXICART RS-422 TEST RESULTS`);
        console.log(`=================================`);
        console.log(`Working cart addresses: ${results.workingAddresses.length}`);
        console.log(`ACK responses: ${results.ackResponses.length}`);
        console.log(`NAK responses: ${results.nakResponses.length}`);
        console.log(`Structured responses: ${results.structuredResponses.length}`);

        if (results.workingAddresses.length > 0) {
            console.log(`\n🎉 SUCCESS! FlexiCart communication established!`);
            console.log(`✅ Working cart addresses: ${results.workingAddresses.map(addr => `0x${addr.toString(16).toUpperCase()}`).join(', ')}`);
            
            console.log(`\n📋 Working Responses:`);
            [...results.ackResponses, ...results.nakResponses, ...results.structuredResponses].forEach(resp => {
                console.log(`   🎯 ${resp.address} ${resp.command}: ${resp.response}`);
            });

            console.log(`\n🔧 Update your flexicart_serial_utils.js with:`);
            console.log(`baudRate: 19200,`);
            console.log(`dataBits: 8,`);
            console.log(`parity: 'even',`);
            console.log(`stopBits: 1`);

        } else {
            console.log(`\n⚠️  No FlexiCart protocol responses detected`);
            console.log(`But RS-422 communication is working (previous test showed responses)`);
            console.log(`This suggests:`);
            console.log(`1. FlexiCart may not be powered on or ready`);
            console.log(`2. Different command format may be required`);
            console.log(`3. Initialization sequence may be needed`);
        }

        return results;
    }

    /**
     * Send command using working RS-422 configuration
     */
    static sendCommandWithRS422(portPath, command, timeout = 3000) {
        return new Promise((resolve, reject) => {
            const port = new SerialPort({
                path: portPath,
                baudRate: 19200,    // Use discovered working baud rate
                dataBits: 8,
                parity: 'even',
                stopBits: 1,
                flowControl: false,
                autoOpen: false
            });

            let responseData = Buffer.alloc(0);
            let responseTimeout;

            port.on('data', (data) => {
                responseData = Buffer.concat([responseData, data]);
            });

            port.on('error', (err) => {
                reject(new Error(`Port error: ${err.message}`));
            });

            port.open((err) => {
                if (err) {
                    reject(new Error(`Failed to open port: ${err.message}`));
                    return;
                }

                // Set response timeout
                responseTimeout = setTimeout(() => {
                    port.close(() => {
                        resolve(responseData.length > 0 ? responseData : null);
                    });
                }, timeout);

                // Send command
                port.write(command, (writeErr) => {
                    if (writeErr) {
                        clearTimeout(responseTimeout);
                        port.close(() => {
                            reject(new Error(`Write failed: ${writeErr.message}`));
                        });
                    }
                });
            });
        });
    }

    /**
     * Analyze FlexiCart response
     */
    static analyzeFlexiCartResponse(response) {
        const analysis = {
            type: 'UNKNOWN',
            isAck: false,
            isNak: false,
            isStructured: false,
            length: response.length,
            hex: response.toString('hex').toUpperCase()
        };

        // Check for exact ACK/NAK
        if (response.length === 1) {
            if (response[0] === this.ACK) {
                analysis.isAck = true;
                analysis.type = 'ACK';
                return analysis;
            }
            if (response[0] === this.NAK) {
                analysis.isNak = true;
                analysis.type = 'NAK';
                return analysis;
            }
        }

        // Check for structured FlexiCart response (starts with STX)
        if (response.length >= 3 && response[0] === this.STX) {
            analysis.isStructured = true;
            analysis.type = 'STRUCTURED_FLEXICART';
            
            // Try to parse the structure
            if (response.length >= 9) {
                analysis.bc = response[1];
                analysis.ua1 = response[2];
                analysis.ua2 = response[3];
                analysis.bt = response[4];
                analysis.cmd = response[5];
                analysis.control = response[6];
                analysis.data = response[7];
                analysis.checksum = response[8];
                analysis.type = 'FULL_FLEXICART_RESPONSE';
            }
        } else {
            analysis.type = 'RAW_DATA';
        }

        return analysis;
    }
}

/**
 * Main execution
 */
async function main() {
    const portPath = process.argv[2] || '/dev/ttyRP8';
    
    console.log(`🚀 Starting FlexiCart RS-422 Communication Test`);
    console.log(`Using discovered working configuration: 19200 baud, 8E1\n`);
    
    try {
        const results = await FlexiCartRS422Test.testFlexiCartCommunication(portPath);
        
        if (results.workingAddresses.length > 0) {
            console.log(`\n✅ Test PASSED - FlexiCart communication working!`);
            process.exit(0);
        } else {
            console.log(`\n⚠️  Test INCONCLUSIVE - Need further investigation`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error(`❌ Test failed: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { FlexiCartRS422Test };