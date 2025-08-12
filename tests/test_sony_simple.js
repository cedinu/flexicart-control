/**
 * Simple Sony Protocol Test
 * Basic test to isolate Sony functionality without dependencies
 */

const { SerialPort } = require('serialport');

async function testBasicSonyCommands(portPath) {
    console.log(`🎌 Simple Sony Protocol Test for ${portPath}`);
    console.log('===========================================');
    
    try {
        // Direct Sony commands without complex dependencies
        const SONY_COMMANDS = {
            DEVICE_TYPE: Buffer.from([0x90, 0x11, 0x00, 0x00]),
            ID_REQUEST: Buffer.from([0x88, 0x01]),
            STATUS_QUERY: Buffer.from([0x53, 0x3F, 0x0D])
        };
        
        for (const [name, command] of Object.entries(SONY_COMMANDS)) {
            console.log(`\n🧪 Testing ${name}...`);
            console.log(`📤 Command: ${command.toString('hex')}`);
            
            try {
                const response = await sendBasicCommand(portPath, command);
                console.log(`📥 Response: ${response.toString('hex')}`);
                
                // Analyze response
                const syncBytes = response.filter(byte => byte === 0x55).length;
                const nonSyncBytes = response.filter(byte => byte !== 0x55);
                
                console.log(`📊 Sync bytes: ${syncBytes}, Data bytes: ${nonSyncBytes.length}`);
                if (nonSyncBytes.length > 0) {
                    console.log(`📋 Data: [${nonSyncBytes.map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
                }
                
            } catch (error) {
                console.log(`❌ Failed: ${error.message}`);
            }
            
            // Small delay between commands
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        console.log('\n✅ Basic Sony test completed');
        
    } catch (error) {
        console.log(`❌ Test failed: ${error.message}`);
    }
}

async function sendBasicCommand(path, command, timeout = 3000) {
    return new Promise((resolve, reject) => {
        let responseBuffer = Buffer.alloc(0);
        
        const port = new SerialPort({
            path: path,
            baudRate: 38400,
            dataBits: 8,
            parity: 'even',
            stopBits: 1,
            autoOpen: false
        });
        
        const timeoutId = setTimeout(() => {
            port.close();
            if (responseBuffer.length > 0) {
                resolve(responseBuffer);
            } else {
                reject(new Error('Response timeout'));
            }
        }, timeout);
        
        port.on('data', (data) => {
            responseBuffer = Buffer.concat([responseBuffer, data]);
        });
        
        port.on('error', (err) => {
            clearTimeout(timeoutId);
            reject(err);
        });
        
        port.open((err) => {
            if (err) {
                clearTimeout(timeoutId);
                reject(err);
                return;
            }
            
            port.write(command, (writeErr) => {
                if (writeErr) {
                    clearTimeout(timeoutId);
                    port.close();
                    reject(writeErr);
                }
            });
        });
    });
}

// Run the test
const portPath = process.argv[2] || '/dev/ttyRP8';
testBasicSonyCommands(portPath);