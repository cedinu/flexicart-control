/**
 * Direct test of ttyRP8 port bypassing enumeration
 */

const { SerialPort } = require('serialport');
const fs = require('fs');

async function testDirectPort(portPath) {
    console.log(`🔧 Direct Port Test: ${portPath}`);
    console.log(`================================`);
    
    // Check filesystem
    if (!fs.existsSync(portPath)) {
        console.log(`❌ Port does not exist: ${portPath}`);
        return;
    }
    
    console.log(`✅ Port exists in filesystem`);
    
    // Check permissions
    try {
        const stats = fs.statSync(portPath);
        console.log(`📊 Port permissions: ${stats.mode.toString(8)}`);
    } catch (err) {
        console.log(`⚠️  Cannot read port stats: ${err.message}`);
    }
    
    // Test configurations
    const configs = [
        { baudRate: 9600, dataBits: 8, parity: 'none', stopBits: 1, name: '9600 8N1' },
        { baudRate: 38400, dataBits: 8, parity: 'even', stopBits: 1, name: '38400 8E1' },
        { baudRate: 9600, dataBits: 8, parity: 'even', stopBits: 1, name: '9600 8E1' },
        { baudRate: 19200, dataBits: 8, parity: 'even', stopBits: 1, name: '19200 8E1' }
    ];
    
    for (const config of configs) {
        console.log(`\n🔧 Testing ${config.name}...`);
        
        try {
            await testConfig(portPath, config);
        } catch (error) {
            console.log(`❌ Config test failed: ${error.message}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

function testConfig(portPath, config) {
    return new Promise((resolve) => {
        console.log(`   📡 ${config.baudRate} baud, ${config.dataBits}${config.parity[0].toUpperCase()}${config.stopBits}`);
        
        const port = new SerialPort({
            path: portPath,
            baudRate: config.baudRate,
            dataBits: config.dataBits,
            parity: config.parity,
            stopBits: config.stopBits,
            flowControl: false,
            autoOpen: false
        });

        let opened = false;
        let responseCount = 0;
        
        port.on('error', (err) => {
            console.log(`   ❌ Port error: ${err.message}`);
        });

        port.on('data', (data) => {
            responseCount++;
            console.log(`   📥 Response ${responseCount}: ${data.length}B ${data.toString('hex').toUpperCase()}`);
        });

        port.open((err) => {
            if (err) {
                console.log(`   ❌ Open failed: ${err.message}`);
                resolve();
                return;
            }

            console.log(`   ✅ Port opened successfully`);
            opened = true;

            // Send test data
            const testCommands = [
                Buffer.from([0x55]), // Simple pattern
                Buffer.from([0x02, 0x06, 0x01, 0x01, 0x00, 0x50, 0x00, 0x80, 0x28]), // FlexiCart dummy
                Buffer.from('AT\r\n'), // ASCII test
            ];

            let cmdIndex = 0;

            function sendNext() {
                if (cmdIndex >= testCommands.length) {
                    setTimeout(() => {
                        console.log(`   📊 Test complete: ${responseCount} responses received`);
                        port.close(() => resolve());
                    }, 2000);
                    return;
                }

                const cmd = testCommands[cmdIndex];
                console.log(`   📤 Sending: ${cmd.toString('hex').toUpperCase()}`);
                
                port.write(cmd, (err) => {
                    if (err) {
                        console.log(`   ❌ Write error: ${err.message}`);
                    }
                    cmdIndex++;
                    setTimeout(sendNext, 1000);
                });
            }

            setTimeout(sendNext, 500);
        });

        // Timeout
        setTimeout(() => {
            if (opened) {
                port.close(() => resolve());
            } else {
                resolve();
            }
        }, 10000);
    });
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
testDirectPort(portPath);