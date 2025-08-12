/**
 * Test the production FlexiCart module
 */

const { testFlexiCartConnection, sendDummyCommand } = require('../src/commands/flexicart_serial_utils');

async function main() {
    const portPath = process.argv[2] || '/dev/ttyRP8';
    
    console.log(`🎯 Testing Production FlexiCart Module`);
    console.log(`====================================`);
    console.log(`Port: ${portPath}\n`);
    
    try {
        // Test connection
        const connectionTest = await testFlexiCartConnection(portPath, true);
        
        if (connectionTest.success) {
            console.log(`\n🎉 SUCCESS! Production module working!`);
            console.log(`✅ FlexiCart communication confirmed`);
            console.log(`✅ Ready for integration into your application`);
            
            // Test a few more commands
            console.log(`\n🔧 Testing additional commands...`);
            
            const dummy2 = await sendDummyCommand(portPath, 0x01, true);
            if (dummy2 && dummy2.valid) {
                console.log(`✅ Second dummy command successful`);
            }
            
        } else {
            console.log(`\n❌ Production module test failed`);
            console.log(`Error: ${connectionTest.error}`);
        }
        
    } catch (error) {
        console.error(`💥 Test failed: ${error.message}`);
    }
}

main();