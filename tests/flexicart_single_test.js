/**
 * Single FlexiCart Command Test
 * Tests one command at a time to avoid port locking
 */

const { FlexiCartStatusFixed } = require('./check_flexicart_status_fixed');

async function testSingleCommand() {
    const port = process.argv[2] || '/dev/ttyRP8';
    const cmdType = process.argv[3] || 'dummy';
    
    console.log(`🎯 Single FlexiCart Command Test`);
    console.log(`===============================`);
    console.log(`Port: ${port}`);
    console.log(`Command: ${cmdType}`);
    console.log(`Settings: 38400 baud, 8E1\n`);

    const commands = {
        'dummy': { cmd: 0x50, desc: 'Dummy command' },
        'status': { cmd: 0x61, desc: 'Status request' },
        'system': { cmd: 0x65, desc: 'System mode' },
        'position': { cmd: 0x60, desc: 'Position request' },
        'stop': { cmd: 0x20, desc: 'Stop command' }
    };

    if (!commands[cmdType]) {
        console.log(`❌ Unknown command: ${cmdType}`);
        console.log(`Available: ${Object.keys(commands).join(', ')}`);
        return;
    }

    try {
        const command = FlexiCartStatusFixed.createCommand(0x01, commands[cmdType].cmd);
        console.log(`📤 Sending ${commands[cmdType].desc}...`);
        console.log(`📊 Command bytes: ${command.toString('hex').toUpperCase()}`);
        
        const result = await FlexiCartStatusFixed.sendCommand(port, command, 4000, true);
        
        if (result.success) {
            console.log(`\n✅ SUCCESS!`);
            console.log(`📊 Response: ${result.length} bytes`);
            console.log(`📊 Hex: ${result.hex}`);
            console.log(`📊 ASCII: "${result.response.toString().replace(/[^\x20-\x7E]/g, '.')}"`);
            
            // Analyze the response
            console.log(`\n🔍 Response Analysis:`);
            console.log(`   Binary: ${result.response.map(b => b.toString(2).padStart(8, '0')).join(' ')}`);
            console.log(`   Decimal: ${Array.from(result.response).join(' ')}`);
            
        } else {
            console.log(`\n❌ FAILED: ${result.error}`);
        }
        
    } catch (error) {
        console.log(`\n💥 ERROR: ${error.message}`);
    }
}

if (require.main === module) {
    testSingleCommand();
}