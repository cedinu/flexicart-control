/**
 * FlexiCart Enhanced Initialization Monitor
 * Extended initialization monitoring with detailed status analysis
 */

const { createFlexiCartCommand, sendCommand } = require('../src/commands/flexicart_serial_utils');

async function enhancedInitializationTest() {
    console.log('🔍 FlexiCart Enhanced Initialization Monitor');
    console.log('==========================================\n');
    
    const port = '/dev/ttyRP0';
    const cartAddress = 0x01;
    
    try {
        // Step 1: Send initialization command
        console.log('🏗️  Sending Elevator Initialize (1DH) command...');
        
        const initCommand = createFlexiCartCommand(cartAddress, 0x1D, 0x00, 0x01, 0x80);
        const initResponse = await sendCommand(port, initCommand, 5000);
        
        console.log(`📤 Init command: ${initCommand.toString('hex')}`);
        console.log(`📥 Init response: ${initResponse ? initResponse.toString('hex') : 'NO RESPONSE'}`);
        
        if (!initResponse || initResponse[0] !== 0x04) {
            console.log('❌ Initialization failed or not acknowledged');
            return;
        }
        
        console.log('✅ Initialization started - now monitoring status...\n');
        
        // Step 2: Extended status monitoring
        console.log('🔍 Extended Status Monitoring (30 second intervals, 30 minutes max)');
        console.log('===================================================================');
        
        const maxChecks = 60; // 30 minutes
        let lastStatusHex = '';
        let statusChangeCount = 0;
        
        for (let check = 1; check <= maxChecks; check++) {
            console.log(`\n⏰ Status Check ${check}/${maxChecks} (${new Date().toLocaleTimeString()})`);
            console.log('-'.repeat(50));
            
            // Try multiple status request methods
            const statusMethods = [
                { name: 'CART_STATUS_REQUEST (71H)', cmd: 0x71, ctrl: 0x00 },
                { name: 'GENERAL_STATUS (61H)', cmd: 0x61, ctrl: 0x10 },
                { name: 'SYSTEM_STATUS (65H)', cmd: 0x65, ctrl: 0x00 }
            ];
            
            for (const method of statusMethods) {
                try {
                    const statusCmd = createFlexiCartCommand(cartAddress, method.cmd, 0x00, method.ctrl, 0x80);
                    const statusResp = await sendCommand(port, statusCmd, 10000); // 10 second timeout
                    
                    if (statusResp && statusResp.length > 0) {
                        const statusHex = statusResp.toString('hex');
                        console.log(`📊 ${method.name}: ${statusHex} (${statusResp.length} bytes)`);
                        
                        // Detect status changes
                        if (method.name === 'CART_STATUS_REQUEST (71H)' && statusHex !== lastStatusHex) {
                            if (lastStatusHex) {
                                statusChangeCount++;
                                console.log(`🔄 STATUS CHANGE #${statusChangeCount}: ${lastStatusHex} → ${statusHex}`);
                            }
                            lastStatusHex = statusHex;
                        }
                        
                        // Detailed analysis of CART STATUS RETURN
                        if (statusResp.length >= 7 && statusResp[5] === 0x71) {
                            analyzeCartStatusDetailed(statusResp);
                        }
                        
                    } else {
                        console.log(`📭 ${method.name}: NO RESPONSE`);
                    }
                    
                    // Small delay between methods
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                } catch (error) {
                    console.log(`❌ ${method.name}: ERROR - ${error.message}`);
                }
            }
            
            // Check if we should continue monitoring
            if (check < maxChecks) {
                console.log(`⏳ Waiting 30 seconds before next check...`);
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }
        
        console.log('\n🏁 Status monitoring completed.');
        console.log(`📈 Total status changes detected: ${statusChangeCount}`);
        
        // Step 3: Test bin reading regardless of init status
        console.log('\n📦 Testing bin reading (first 20 positions)...');
        console.log('===============================================');
        
        for (let pos = 1; pos <= 20; pos++) {
            const binCmd = createFlexiCartCommand(cartAddress, 0x62, 0x00, pos, 0x80);
            
            try {
                const binResp = await sendCommand(port, binCmd, 5000);
                
                if (binResp && binResp.length > 0) {
                    const respHex = binResp.toString('hex');
                    console.log(`📍 Bin ${pos.toString().padStart(2, '0')}: ${respHex} (${binResp.length}B) - ${analyzeBinQuick(binResp)}`);
                } else {
                    console.log(`📍 Bin ${pos.toString().padStart(2, '0')}: TIMEOUT`);
                }
                
            } catch (error) {
                console.log(`📍 Bin ${pos.toString().padStart(2, '0')}: ERROR - ${error.message}`);
            }
            
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
    } catch (error) {
        console.error('\n❌ Enhanced initialization test failed:', error.message);
    }
}

/**
 * Detailed analysis of CART STATUS RETURN response
 */
function analyzeCartStatusDetailed(response) {
    console.log('🔬 Detailed Cart Status Analysis:');
    console.log(`   📏 Length: ${response.length} bytes`);
    console.log(`   📋 Hex: ${response.toString('hex')}`);
    console.log(`   🔢 Bytes: [${Array.from(response).join(', ')}]`);
    
    if (response.length >= 8) {
        console.log(`   📊 Status Byte: 0x${response[7].toString(16).toUpperCase()}`);
        
        // Status byte interpretation (educated guesses)
        const statusByte = response[7];
        switch (statusByte) {
            case 0x00:
                console.log('   🟢 Status: READY/IDLE');
                break;
            case 0x80:
                console.log('   🟡 Status: INITIALIZING/BUSY');
                break;
            case 0x01:
                console.log('   🔵 Status: OPERATION_1');
                break;
            case 0x05:
                console.log('   🟠 Status: ERROR/NAK');
                break;
            default:
                console.log(`   ❓ Status: UNKNOWN (0x${statusByte.toString(16)})`);
        }
    }
    
    if (response.length >= 10) {
        console.log(`   🏗️  Additional data: ${response.slice(8).toString('hex')}`);
    }
}

/**
 * Quick bin analysis
 */
function analyzeBinQuick(response) {
    if (response.length === 1 && response[0] === 0x04) {
        return 'EMPTY (ACK only)';
    } else if (response.length >= 7 && response[5] === 0x72) {
        return 'OCCUPIED (BIN STATUS RETURN)';
    } else if (response.length > 2) {
        return 'OCCUPIED (Extended response)';
    } else {
        return `UNKNOWN (${response.length}B)`;
    }
}

// Run the test
if (require.main === module) {
    enhancedInitializationTest().catch(console.error);
}

module.exports = { enhancedInitializationTest };
