const { sendCommand } = require('../src/commands/flexicart_serial_utils');

/**
 * FlexiCart Communication Reliability Test
 * Focus on getting proper ACK/NAK responses before testing protocols
 */
class FlexiCartCommunicationTest {
    static STX = 0x02;  // Start of text
    static ACK = 0x04;  // Acknowledge
    static NAK = 0x05;  // Not Acknowledge
    static BUSY = 0x06; // Busy

    /**
     * Calculate proper checksum
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
     * Create basic FlexiCart command packet
     */
    static createCommand(bt, cmd, control = 0x00, data = 0x80, ua2 = 0x01) {
        const bc = 0x06; // Fixed byte count for basic commands
        const ua1 = 0x01; // FlexiCart unit type
        
        const packet = Buffer.alloc(9);
        packet[0] = this.STX;   // STX
        packet[1] = bc;         // BC
        packet[2] = ua1;        // UA1
        packet[3] = ua2;        // UA2
        packet[4] = bt;         // BT
        packet[5] = cmd;        // CMD
        packet[6] = control;    // Control
        packet[7] = data;       // DATA
        packet[8] = this.calculateChecksum(packet); // CS
        
        return packet;
    }

    /**
     * Analyze response for proper protocol acknowledgments
     */
    static analyzeResponse(response, commandName) {
        const analysis = {
            isAck: false,
            isNak: false,
            isBusy: false,
            hasValidProtocol: false,
            responseType: 'UNKNOWN',
            rawHex: response.toString('hex').toUpperCase(),
            length: response.length
        };

        if (response.length === 0) {
            analysis.responseType = 'NO_RESPONSE';
            return analysis;
        }

        // Check for exact ACK response
        if (response.includes(this.ACK)) {
            analysis.isAck = true;
            analysis.hasValidProtocol = true;
            analysis.responseType = 'ACK';
        }
        
        // Check for exact NAK response  
        if (response.includes(this.NAK)) {
            analysis.isNak = true;
            analysis.hasValidProtocol = true;
            analysis.responseType = 'NAK';
        }
        
        // Check for BUSY response
        if (response.includes(this.BUSY)) {
            analysis.isBusy = true;
            analysis.hasValidProtocol = true;
            analysis.responseType = 'BUSY';
        }

        // Check for protocol structure (STX at start)
        if (response[0] === this.STX && response.length >= 3) {
            analysis.hasValidProtocol = true;
            if (analysis.responseType === 'UNKNOWN') {
                analysis.responseType = 'STRUCTURED_RESPONSE';
            }
        }

        // If none of the above, classify as raw data
        if (analysis.responseType === 'UNKNOWN') {
            analysis.responseType = 'RAW_DATA';
        }

        return analysis;
    }

    /**
     * Test basic communication with simple commands
     */
    static async testBasicCommunication(portPath) {
        console.log(`📡 FlexiCart Communication Reliability Test`);
        console.log(`==========================================`);
        console.log(`Port: ${portPath}`);
        console.log(`Time: ${new Date().toISOString()}\n`);

        const results = {
            workingCommands: [],
            ackResponses: [],
            nakResponses: [],
            busyResponses: [],
            reliableProtocol: false,
            bestUA2: null
        };

        // Test with different UA2 values (cart addresses)
        const testUA2Values = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80];
        
        // Simple test commands that should get responses
        const testCommands = [
            { name: 'DUMMY', bt: 0x00, cmd: 0x50, desc: 'Dummy command - basic communication test' },
            { name: 'SYSTEM_RESET', bt: 0x00, cmd: 0x00, desc: 'System reset command' },
            { name: 'REQUEST', bt: 0x00, cmd: 0x60, desc: 'Request command' },
            { name: 'SENSE_CART_STATUS', bt: 0x00, cmd: 0x61, desc: 'Sense cart status' }
        ];

        try {
            for (const ua2 of testUA2Values) {
                console.log(`\n🎯 Testing UA2 = 0x${ua2.toString(16).toUpperCase().padStart(2, '0')} (Cart address)`);
                console.log(`${'='.repeat(50)}`);

                const ua2Results = {
                    ua2Value: ua2,
                    ackCount: 0,
                    nakCount: 0,
                    busyCount: 0,
                    validResponses: 0,
                    commandResults: []
                };

                for (const testCmd of testCommands) {
                    console.log(`\n📤 Testing: ${testCmd.name}`);
                    console.log(`   📋 Description: ${testCmd.desc}`);
                    
                    const command = this.createCommand(testCmd.bt, testCmd.cmd, 0x00, 0x80, ua2);
                    console.log(`   📊 Command: ${command.toString('hex').toUpperCase()}`);
                    console.log(`   📊 Breakdown: STX=${command[0].toString(16)} BC=${command[1].toString(16)} UA1=${command[2].toString(16)} UA2=${command[3].toString(16)} BT=${command[4].toString(16)} CMD=${command[5].toString(16)}`);

                    try {
                        const response = await sendCommand(portPath, command, 3000, false);
                        console.log(`   📥 Response: ${response.length} bytes`);
                        
                        if (response.length > 0) {
                            console.log(`   📊 Raw hex: ${response.toString('hex').toUpperCase()}`);
                            
                            const analysis = this.analyzeResponse(response, testCmd.name);
                            console.log(`   📊 Analysis: ${analysis.responseType}`);
                            
                            if (analysis.isAck) {
                                console.log(`   ✅ ACK RECEIVED - Valid protocol communication!`);
                                ua2Results.ackCount++;
                                results.ackResponses.push({
                                    ua2,
                                    command: testCmd.name,
                                    response: analysis.rawHex
                                });
                            } else if (analysis.isNak) {
                                console.log(`   ❌ NAK RECEIVED - Command rejected but communication working!`);
                                ua2Results.nakCount++;
                                results.nakResponses.push({
                                    ua2,
                                    command: testCmd.name,
                                    response: analysis.rawHex
                                });
                            } else if (analysis.isBusy) {
                                console.log(`   ⏳ BUSY RECEIVED - Device busy but communication working!`);
                                ua2Results.busyCount++;
                                results.busyResponses.push({
                                    ua2,
                                    command: testCmd.name,
                                    response: analysis.rawHex
                                });
                            } else if (analysis.hasValidProtocol) {
                                console.log(`   📊 STRUCTURED RESPONSE - Protocol detected`);
                                ua2Results.validResponses++;
                            } else {
                                console.log(`   📊 RAW DATA - No protocol structure detected`);
                            }

                            ua2Results.commandResults.push({
                                command: testCmd.name,
                                analysis,
                                success: analysis.hasValidProtocol
                            });

                        } else {
                            console.log(`   ❌ No response`);
                        }

                    } catch (error) {
                        console.log(`   ❌ Error: ${error.message}`);
                    }

                    // Small delay between commands
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Analyze results for this UA2
                const totalValidResponses = ua2Results.ackCount + ua2Results.nakCount + ua2Results.busyCount + ua2Results.validResponses;
                
                console.log(`\n📊 UA2 0x${ua2.toString(16).toUpperCase()} Summary:`);
                console.log(`   ✅ ACK responses: ${ua2Results.ackCount}`);
                console.log(`   ❌ NAK responses: ${ua2Results.nakCount}`);
                console.log(`   ⏳ BUSY responses: ${ua2Results.busyCount}`);
                console.log(`   📊 Valid protocol responses: ${totalValidResponses}/${testCommands.length}`);

                if (totalValidResponses > 0) {
                    results.workingCommands.push(ua2Results);
                    
                    if (ua2Results.ackCount > 0 && !results.bestUA2) {
                        results.bestUA2 = ua2;
                        results.reliableProtocol = true;
                    }
                }

                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // Final analysis
            console.log(`\n\n📊 COMMUNICATION TEST RESULTS`);
            console.log(`==============================`);
            console.log(`Total ACK responses: ${results.ackResponses.length}`);
            console.log(`Total NAK responses: ${results.nakResponses.length}`);
            console.log(`Total BUSY responses: ${results.busyResponses.length}`);
            console.log(`Reliable protocol detected: ${results.reliableProtocol ? 'YES' : 'NO'}`);

            if (results.reliableProtocol) {
                console.log(`\n🎉 SUCCESS! FlexiCart communication established!`);
                console.log(`✅ Best UA2 address: 0x${results.bestUA2.toString(16).toUpperCase()}`);
                
                console.log(`\n📋 Working ACK responses:`);
                results.ackResponses.forEach(ack => {
                    console.log(`   📍 UA2=0x${ack.ua2.toString(16).toUpperCase()} ${ack.command}: ${ack.response}`);
                });

                if (results.nakResponses.length > 0) {
                    console.log(`\n📋 Working NAK responses (communication OK, command rejected):`);
                    results.nakResponses.forEach(nak => {
                        console.log(`   📍 UA2=0x${nak.ua2.toString(16).toUpperCase()} ${nak.command}: ${nak.response}`);
                    });
                }

                // Generate working command examples
                console.log(`\n🔧 Working FlexiCart Commands:`);
                console.log(`=============================`);
                const workingUA2 = results.bestUA2;
                const dummyCmd = this.createCommand(0x00, 0x50, 0x00, 0x80, workingUA2);
                const statusCmd = this.createCommand(0x00, 0x61, 0x00, 0x80, workingUA2);
                
                console.log(`// Working UA2 address: 0x${workingUA2.toString(16).toUpperCase()}`);
                console.log(`const DUMMY_CMD = Buffer.from([${dummyCmd.join(', ')}]);`);
                console.log(`const STATUS_CMD = Buffer.from([${statusCmd.join(', ')}]);`);

            } else {
                console.log(`\n⚠️  No reliable FlexiCart protocol communication detected.`);
                console.log(`\n🔧 Troubleshooting suggestions:`);
                console.log(`   1. Verify FlexiCart power and ready status`);
                console.log(`   2. Check RS-422 cable connections and wiring`);
                console.log(`   3. Verify baud rate (38400) and serial settings`);
                console.log(`   4. Check if FlexiCart requires initialization sequence`);
                console.log(`   5. Try different communication modes or protocols`);
                
                if (results.workingCommands.length > 0) {
                    console.log(`\n📊 Some responses were received - possible communication issues:`);
                    results.workingCommands.forEach(ua2Result => {
                        console.log(`   📍 UA2=0x${ua2Result.ua2Value.toString(16).toUpperCase()}: ${ua2Result.commandResults.length} responses`);
                    });
                }
            }

            return results;

        } catch (error) {
            console.log(`❌ Communication test failed: ${error.message}`);
            return results;
        }
    }
}

/**
 * Main execution
 */
async function main() {
    const portPath = process.argv[2] || '/dev/ttyRP8';
    
    console.log('🎬 FlexiCart Communication Tester');
    console.log('=================================');
    console.log('Testing reliable ACK/NAK communication before protocol testing\n');
    
    try {
        const results = await FlexiCartCommunicationTest.testBasicCommunication(portPath);
        
        if (results.reliableProtocol) {
            console.log(`\n✅ Communication test PASSED`);
            console.log(`   Ready for advanced protocol testing with UA2=0x${results.bestUA2.toString(16).toUpperCase()}`);
            process.exit(0);
        } else {
            console.log(`\n❌ Communication test FAILED`);
            console.log(`   Fix communication issues before proceeding with protocol tests`);
            process.exit(1);
        }
        
    } catch (error) {
        console.error(`❌ Fatal error: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = {
    FlexiCartCommunicationTest
};