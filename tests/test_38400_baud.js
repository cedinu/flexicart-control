/**
 * Test FlexiCart with 38400 baud (original specification)
 */

const { SerialPort } = require('serialport');
const { execSync } = require('child_process');

class FlexiCart38400Test {
    
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
     * Test multiple baud rates to find the best one
     */
    static async testBaudRates(portPath) {
        console.log(`🎯 FlexiCart Baud Rate Test`);
        console.log(`==========================`);
        console.log(`Port: ${portPath}`);
        console.log(`Testing multiple baud rates...\n`);

        const baudRates = [
            { rate: 38400, parity: 'even', desc: 'Original FlexiCart spec (38400, 8E1)' },
            { rate: 19200, parity: 'even', desc: 'Previously working (19200, 8E1)' },
            { rate: 38400, parity: 'none', desc: 'Alternative (38400, 8N1)' },
            { rate: 9600, parity: 'even', desc: 'Lower speed (9600, 8E1)' },
            { rate: 57600, parity: 'even', desc: 'Higher speed (57600, 8E1)' }
        ];

        const results = [];

        for (const config of baudRates) {
            console.log(`\n📡 Testing: ${config.desc}`);
            console.log(`   Settings: ${config.rate} baud, 8${config.parity[0].toUpperCase()}1`);
            
            this.releasePortLocks(portPath);
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            try {
                const response = await this.testSingleBaudRate(portPath, config.rate, config.parity);
                
                if (response && response.length > 0) {
                    console.log(`   ✅ SUCCESS: ${response.length} bytes received`);
                    console.log(`   📊 Response: ${response.toString('hex').toUpperCase()}`);
                    console.log(`   📊 ASCII: "${response.toString().replace(/[^\x20-\x7E]/g, '.')}"`);
                    
                    // Analyze response quality
                    const quality = this.analyzeResponseQuality(response);
                    console.log(`   📊 Quality: ${quality.score}/10 (${quality.assessment})`);
                    
                    results.push({
                        baudRate: config.rate,
                        parity: config.parity,
                        description: config.desc,
                        success: true,
                        response: response,
                        responseHex: response.toString('hex').toUpperCase(),
                        quality: quality
                    });
                } else {
                    console.log(`   ❌ No response received`);
                    results.push({
                        baudRate: config.rate,
                        parity: config.parity,
                        description: config.desc,
                        success: false
                    });
                }
                
            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
                results.push({
                    baudRate: config.rate,
                    parity: config.parity,
                    description: config.desc,
                    success: false,
                    error: error.message
                });
            }
            
            // Wait between tests
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        return this.analyzeFinalResults(results);
    }

    /**
     * Test single baud rate configuration
     */
    static testSingleBaudRate(portPath, baudRate, parity, timeout = 4000) {
        return new Promise((resolve, reject) => {
            let port;
            let responseBuffer = Buffer.alloc(0);
            let isComplete = false;

            const cleanup = () => {
                if (isComplete) return;
                isComplete = true;
                
                if (port && port.isOpen) {
                    port.close(() => {
                        resolve(responseBuffer);
                    });
                } else {
                    resolve(responseBuffer);
                }
            };

            try {
                port = new SerialPort({
                    path: portPath,
                    baudRate: baudRate,
                    dataBits: 8,
                    parity: parity,
                    stopBits: 1,
                    autoOpen: false
                });

                port.on('data', (data) => {
                    responseBuffer = Buffer.concat([responseBuffer, data]);
                    console.log(`   📥 Data: ${data.toString('hex').toUpperCase()}`);
                });

                port.on('error', (err) => {
                    console.log(`   ❌ Port error: ${err.message}`);
                    cleanup();
                });

                port.open((openErr) => {
                    if (openErr) {
                        console.log(`   ❌ Open failed: ${openErr.message}`);
                        reject(new Error(`Open failed: ${openErr.message}`));
                        return;
                    }

                    console.log(`   ✅ Port opened`);

                    // Send dummy command
                    const command = this.createCommand(0x01, 0x50);
                    console.log(`   📤 Sending: ${command.toString('hex').toUpperCase()}`);

                    port.write(command, (writeErr) => {
                        if (writeErr) {
                            console.log(`   ❌ Write failed: ${writeErr.message}`);
                            cleanup();
                            return;
                        }

                        console.log(`   📤 Command sent`);

                        // Wait for response
                        setTimeout(() => {
                            console.log(`   ⏰ Timeout - collecting response`);
                            cleanup();
                        }, timeout);
                    });
                });

            } catch (error) {
                console.log(`   ❌ Exception: ${error.message}`);
                reject(error);
            }
        });
    }

    /**
     * Analyze response quality
     */
    static analyzeResponseQuality(response) {
        let score = 0;
        let reasons = [];

        // Length check
        if (response.length >= 8 && response.length <= 32) {
            score += 2;
            reasons.push('good length');
        }

        // Pattern checks
        const hex = response.toString('hex').toUpperCase();
        
        if (hex.includes('0606')) {
            score += 2;
            reasons.push('ACK pattern');
        }
        
        if (hex.includes('FCFC') || hex.includes('C3C3')) {
            score += 2;
            reasons.push('status pattern');
        }
        
        if (hex.includes('FFFF')) {
            score += 1;
            reasons.push('max value pattern');
        }
        
        if (hex.includes('8383') || hex.includes('5757')) {
            score += 1;
            reasons.push('data pattern');
        }
        
        // Repetition patterns (good for FlexiCart)
        if (/(.{2})\1+/.test(hex)) {
            score += 2;
            reasons.push('repetition patterns');
        }

        let assessment;
        if (score >= 8) assessment = 'EXCELLENT';
        else if (score >= 6) assessment = 'GOOD';
        else if (score >= 4) assessment = 'FAIR';
        else if (score >= 2) assessment = 'POOR';
        else assessment = 'INVALID';

        return {
            score,
            assessment,
            reasons: reasons.join(', ')
        };
    }

    /**
     * Analyze final results and recommend best configuration
     */
    static analyzeFinalResults(results) {
        console.log(`\n\n📊 BAUD RATE TEST RESULTS`);
        console.log(`=========================`);

        const successful = results.filter(r => r.success);
        
        console.log(`Total configurations tested: ${results.length}`);
        console.log(`Successful configurations: ${successful.length}`);

        if (successful.length === 0) {
            console.log(`❌ No successful communications found`);
            return { success: false };
        }

        console.log(`\n✅ Working Configurations:`);
        successful.forEach((result, index) => {
            console.log(`\n${index + 1}. ${result.description}`);
            console.log(`   📊 Baud: ${result.baudRate}, Parity: ${result.parity}`);
            console.log(`   📊 Response: ${result.responseHex}`);
            console.log(`   📊 Quality: ${result.quality.score}/10 (${result.quality.assessment})`);
            console.log(`   📊 Features: ${result.quality.reasons}`);
        });

        // Find best configuration
        const bestConfig = successful.sort((a, b) => b.quality.score - a.quality.score)[0];
        
        console.log(`\n🏆 RECOMMENDED CONFIGURATION:`);
        console.log(`============================`);
        console.log(`📡 ${bestConfig.description}`);
        console.log(`📡 Baud Rate: ${bestConfig.baudRate}`);
        console.log(`📡 Parity: ${bestConfig.parity}`);
        console.log(`📡 Quality Score: ${bestConfig.quality.score}/10`);
        console.log(`📡 Sample Response: ${bestConfig.responseHex}`);
        
        console.log(`\n🔧 Use these settings in your application:`);
        console.log(`baudRate: ${bestConfig.baudRate},`);
        console.log(`dataBits: 8,`);
        console.log(`parity: '${bestConfig.parity}',`);
        console.log(`stopBits: 1`);

        return {
            success: true,
            bestConfig: bestConfig,
            allConfigs: successful
        };
    }
}

/**
 * Main execution
 */
async function main() {
    const portPath = process.argv[2] || '/dev/ttyRP8';
    
    try {
        const results = await FlexiCart38400Test.testBaudRates(portPath);
        
        if (results.success) {
            console.log(`\n🎉 OPTIMAL CONFIGURATION FOUND!`);
            process.exit(0);
        } else {
            console.log(`\n❌ No working configuration found`);
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